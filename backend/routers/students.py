"""學生相關的 API 路由，以及 rows → models 的組裝函式。"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query

import queries
from converters import (
    format_datetime,
    format_optional_datetime,
    normalize_game_type_for_db,
    normalize_game_type_from_db,
    normalize_mode_for_db,
    normalize_school,
    to_float,
    to_int,
)
from models import (
    GameStats,
    GameSummary,
    GameTrend,
    PlayRecord,
    SessionItem,
    SessionsResponse,
    StudentListItem,
    StudentListResponse,
    StudentReportResponse,
    TrendItem,
    TrendPoint,
)
from errors import db_error
from routers.identity import (
    Identity,
    get_current_identity,
    require_own_student_or_same_school_teacher,
    require_teacher,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["students"])


# --- 工具函式 ---


def parse_student_key(student_key: str) -> tuple[str, str]:
    """G1_S03 → (G1, S03)"""
    parts = student_key.strip().split("_", 1)
    if len(parts) != 2 or not parts[0] or not parts[1]:
        raise HTTPException(
            status_code=400,
            detail="studentKey 格式應為 G1_S03（grade_caseId）",
        )
    return parts[0], parts[1]


def session_fields_from_row(row: dict[str, Any]) -> dict[str, Any]:
    """從 assessment_result 列取出場次共用欄位。"""
    return {
        "sessionId": row["uuid"],
        "gameType": normalize_game_type_from_db(row["game_type"]),
        "mode": row["mode"],
        "currentDay": to_int(row["current_day"]),
        "startTime": format_datetime(row["start_time"]),
        "endTime": format_datetime(row["end_time"]),
    }


def build_game_stats(row: dict[str, Any] | None) -> GameStats | None:
    """從遊戲細部表列取出遊戲統計欄位。"""
    if row is None:
        return None
    return GameStats(
        correctCount=to_int(row["correct_count"]),
        wrongCount=to_int(row["wrong_count"]),
        accuracy=to_float(row["accuracy"]),
        duration=to_float(row["duration"]),
        stage=to_int(row["stage"]),
    )


# --- report 組裝（純函式） ---


def build_play_records(
    rows: list[dict[str, Any]],
    stats_by_uuid: dict[str, dict[str, Any]],
) -> list[PlayRecord]:
    """合併場次索引與各遊戲細部統計。"""
    return [
        PlayRecord(
            **session_fields_from_row(row),
            stats=build_game_stats(stats_by_uuid.get(row["uuid"])),
        )
        for row in rows
    ]


def _is_completed(record: PlayRecord) -> bool:
    """這筆場次是不是整場玩完的（不是中途離開）。

    2026-09-22 起，遊戲中途離開也會送出一筆場次（見
    frontend/dccs/js/dccs.js 的 destroy()），讓大廳的進度條分得出「玩過但
    沒玩完」跟「完全沒碰過」。副作用是 stats 不為 None 不再等於「整場玩
    完」——中途離開的那筆一樣有 stats，只是 duration 比較短。統計數字（見
    下面的 build_summary_by_game／build_trends）要用這個判斷篩掉中途離開的
    紀錄，不然平均正確率、趨勢線會被少數幾題就中止的場次拉偏。
    """
    if record.stats is None:
        return False
    threshold = queries.FULL_SESSION_MS.get(record.gameType)
    if threshold is None:
        return True  # 沒有定義門檻的遊戲類型，視為完整（不誤刪資料）。
    return record.stats.duration >= threshold


def build_summary_by_game(records: list[PlayRecord]) -> list[GameSummary]:
    """依 (遊戲種類, 模式) 彙總多場次統計。

    單人版與雙人版難度不同，混在同一列會誤導 —— 故分組鍵是 (gameType, mode)，
    同一遊戲最多拆成 single + double 兩列。排序先 gameType 再 mode（single 在前）。

    `sessionCount` 沿用既有慣例，含中途離開／沒有 stats 的場次一起算（回答
    「嘗試過幾次」）；`totalCorrect`／`totalWrong`／`avgAccuracy` 只採計整場
    玩完的場次（見 `_is_completed`），避免中途離開的少量作答拉偏平均正確率。
    `totalDuration` 則刻意**不排除**中途離開的場次——它回答「這位學生在這
    款遊戲上總共花了多少時間」，中途離開的時間一樣是真的花掉的時間。
    """
    grouped: dict[tuple[str, str], list[PlayRecord]] = {}
    for record in records:
        grouped.setdefault((record.gameType, record.mode), []).append(record)

    summaries: list[GameSummary] = []
    for (game_type, mode), game_records in grouped.items():
        all_stats = [r.stats for r in game_records if r.stats is not None]
        completed_stats = [r.stats for r in game_records if _is_completed(r)]

        summaries.append(
            GameSummary(
                gameType=game_type,
                mode=mode,
                sessionCount=len(game_records),
                totalCorrect=sum(s.correctCount for s in completed_stats),
                totalWrong=sum(s.wrongCount for s in completed_stats),
                avgAccuracy=(
                    round(sum(s.accuracy for s in completed_stats) / len(completed_stats), 2)
                    if completed_stats
                    else 0.0
                ),
                totalDuration=sum(s.duration for s in all_stats),
            )
        )

    summaries.sort(key=lambda item: (item.gameType, _mode_sort_key(item.mode)))
    return summaries


TREND_METRICS = ("correctCount", "wrongCount", "accuracy")  # 固定順序

# 顯示順序：single 一律排在 double 前（不是字母序 —— 字母序會把 double 排前面）。
_MODE_ORDER = {"single": 0, "double": 1}


def _mode_sort_key(mode: str) -> int:
    return _MODE_ORDER.get(mode, len(_MODE_ORDER))


def build_trends(records: list[PlayRecord]) -> list[GameTrend]:
    """把 records 依 gameType × 指標 pivot 成時間序列。純函式。

    stats 為 None、或中途離開沒玩完的場次（見 `_is_completed`）都沒有代表性
    的數值可畫，整筆略過——中途離開的場次作答題數少、正確率雜訊大，混進
    趨勢線只會讓學習曲線看起來忽高忽低。分組鍵為 (gameType, mode)，依該
    tuple 排序（gameType 字母序、single 在 double 前）。每條序列由舊到新
    （startTime 為 YYYY-MM-DD HH:MM:SS，字典序即時間序）。
    """
    grouped: dict[tuple[str, str], list[PlayRecord]] = {}
    for record in records:
        if not _is_completed(record):
            continue
        grouped.setdefault((record.gameType, record.mode), []).append(record)

    trends: list[GameTrend] = []
    for game_type, mode in sorted(
        grouped, key=lambda k: (k[0], _mode_sort_key(k[1]))
    ):
        ordered = sorted(grouped[(game_type, mode)], key=lambda r: r.startTime)
        items = [
            TrendItem(
                type=metric,
                stats=[
                    TrendPoint(time=r.startTime, value=getattr(r.stats, metric))
                    for r in ordered
                ],
            )
            for metric in TREND_METRICS
        ]
        trends.append(GameTrend(gameType=game_type, mode=mode, items=items))
    return trends


def build_student_list_items(rows: list[dict[str, Any]]) -> list[StudentListItem]:
    """把 fetch_students 的列組成回應項目。純函式。"""
    return [
        StudentListItem(
            studentKey=f"{row['grade']}_{row['case_id']}",
            grade=row["grade"],
            caseId=row["case_id"],
            school=row["school"],
            sessionCount=to_int(row["session_count"]),
            lastPlayedAt=format_optional_datetime(row["last_played_at"]),
        )
        for row in rows
    ]


# --- API 路由 ---


@router.get("/api/students", response_model=StudentListResponse)
def list_students(
    school: str | None = Query(
        default=None, description="可選，場域／學校。不給則預設為登入老師自己的場域"
    ),
    identity: Identity = Depends(require_teacher),
) -> StudentListResponse:
    """老師專用。不管有沒有帶 school，一律只回登入老師自己場域的學生——

    帶了別的場域字串一律 403，不是靜默改查自己場域，才不會讓呼叫端誤以為查到了
    別人的資料卻其實悄悄被換掉。
    """
    normalized_school = normalize_school(school) or identity.school
    if normalized_school != identity.school:
        raise HTTPException(status_code=403, detail="無權查看其他場域資料")

    try:
        rows = queries.fetch_students(normalized_school)
    except Exception as exc:
        raise db_error(exc) from exc

    items = build_student_list_items(rows)

    return StudentListResponse(
        school=normalized_school,
        studentCount=len(items),
        students=items,
    )


@router.get("/api/students/{student_key}/sessions", response_model=SessionsResponse)
def list_student_sessions(
    student_key: str,
    school: str = Query(..., description="場域／學校，例如：測試場域"),
    game_type: str | None = Query(
        default=None, description="可選，例如 DAT、EFT、TGame"
    ),
    mode: str | None = Query(
        default=None, description="可選，single 或 double；不給則回全部"
    ),
    identity: Identity = Depends(get_current_identity),
) -> SessionsResponse:
    grade, case_id = parse_student_key(student_key)
    require_own_student_or_same_school_teacher(identity, grade, case_id, school)

    try:
        rows = queries.fetch_assessment_rows(
            grade,
            case_id,
            school,
            normalize_game_type_for_db(game_type),
            normalize_mode_for_db(mode),
        )
    except Exception as exc:
        raise db_error(exc) from exc

    return SessionsResponse(
        studentKey=student_key,
        grade=grade,
        caseId=case_id,
        school=school,
        sessions=[SessionItem(**session_fields_from_row(row)) for row in rows],
    )


@router.get("/api/students/{student_key}/report", response_model=StudentReportResponse)
def get_student_report(
    student_key: str,
    school: str = Query(..., description="場域／學校，例如：測試場域"),
    game_type: str | None = Query(default=None, description="可選，例如 DCCS"),
    mode: str | None = Query(
        default=None, description="可選，single 或 double；不給則回全部"
    ),
    identity: Identity = Depends(get_current_identity),
) -> StudentReportResponse:
    grade, case_id = parse_student_key(student_key)
    require_own_student_or_same_school_teacher(identity, grade, case_id, school)

    try:
        rows = queries.fetch_assessment_rows(
            grade,
            case_id,
            school,
            normalize_game_type_for_db(game_type),
            normalize_mode_for_db(mode),
        )
        records = build_play_records(rows, queries.fetch_stats_for_rows(rows))
    except Exception as exc:
        raise db_error(exc) from exc

    return StudentReportResponse(
        studentKey=student_key,
        grade=grade,
        caseId=case_id,
        school=school,
        totalSessions=len(records),
        records=records,
        summaryByGame=build_summary_by_game(records),
        trends=build_trends(records),
    )
