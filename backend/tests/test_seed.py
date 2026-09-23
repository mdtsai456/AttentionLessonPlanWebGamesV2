"""seed.py 的純邏輯測試,完全不碰資料庫。

只斷言產生資料的不變式,讓日後調整 seed 常數時若弄壞這些性質會立刻亮紅。
tuple 欄位順序沿用 seed.generate():
  session: (grade, case_id, school, uuid, start_time, game_type,
            mode, pair_id, current_day, end_time)
  detail : (grade, case_id, school, uuid, correct, wrong, accuracy, duration, stage)
"""

import seed

# session tuple 欄位索引
S_GRADE = 0
S_CASE_ID = 1
S_SCHOOL = 2
S_UUID = 3
S_START = 4
S_GAME_TYPE = 5
S_MODE = 6
S_PAIR_ID = 7
S_CURRENT_DAY = 8
S_END = 9


def test_generate_is_deterministic():
    # 固定 seed → 兩次產生完全相同,重灌才會可重現。
    assert seed.generate() == seed.generate()


def test_student_password_hash_constant_matches_plaintext():
    # TEST_STUDENT_PASSWORD_HASH 是手動算好硬編碼的（見 seed.py 裡的說明：
    # hash_password() 每次都用新的隨機 salt，現算會讓 generate() 失去決定性）。
    # 若 TEST_STUDENT_PASSWORD 改了卻忘記重算雜湊，這個測試會抓到。
    from auth import verify_password

    assert verify_password(seed.TEST_STUDENT_PASSWORD, seed.TEST_STUDENT_PASSWORD_HASH)


def test_row_counts():
    students, sessions, details = seed.generate()
    n_students = len(seed.SCHOOLS) * len(seed.STUDENTS)

    assert n_students == 18
    assert len(students) == n_students
    assert sum(len(rows) for rows in details.values()) == len(sessions)


def test_sessions_per_student_within_configured_range():
    # 每位學生的場次數(單人+雙人合計)要落在「完整玩 completed_days 天」對應
    # 的區間內：下限是只玩 MIN_COMPLETED_DAYS 天且都不是雙人日；上限是玩滿
    # MAX_COMPLETED_DAYS 天、且該範圍內每個雙人日都加上雙人場。
    _, sessions, _ = seed.generate()
    counts: dict[tuple[str, str, str], int] = {}
    for row in sessions:
        key = (row[S_GRADE], row[S_CASE_ID], row[S_SCHOOL])
        counts[key] = counts.get(key, 0) + 1

    play_days = seed.build_play_days()
    min_count = seed.MIN_COMPLETED_DAYS * len(seed.GAMES)
    max_double_days = sum(
        1
        for day in play_days[: seed.MAX_COMPLETED_DAYS]
        if day["day_in_round"] in seed.DOUBLE_DAYS_IN_ROUND
    )
    max_count = (
        seed.MAX_COMPLETED_DAYS * len(seed.GAMES)
        + max_double_days * len(seed.DOUBLE_GAMES)
    )

    n_students = len(seed.SCHOOLS) * len(seed.STUDENTS)
    assert len(counts) == n_students
    for count in counts.values():
        assert min_count <= count <= max_count


def test_single_and_double_session_split():
    _, sessions, _ = seed.generate()
    by_mode: dict[str, int] = {}
    for row in sessions:
        by_mode[row[S_MODE]] = by_mode.get(row[S_MODE], 0) + 1

    # 抽樣後的確切數字不再是固定公式,只斷言兩種模式都還有資料可看。
    assert by_mode.keys() == {"single", "double"}
    assert by_mode["single"] + by_mode["double"] == len(sessions)


def test_double_sessions_only_for_capable_games_and_carry_pair_id():
    _, sessions, _ = seed.generate()
    for row in sessions:
        if row[S_MODE] == "double":
            assert row[S_GAME_TYPE] in seed.DOUBLE_GAMES
            assert row[S_PAIR_ID] is not None
            assert len(row[S_PAIR_ID]) == 36
        else:
            assert row[S_PAIR_ID] is None


def test_game_type_keys_match_result_tables():
    # game_type 必須精確對上 queries 的白名單鍵,含全大寫 TGAME,否則 report 查不到 stats。
    from queries import GAME_RESULT_TABLES

    _, sessions, _ = seed.generate()
    game_types = {row[S_GAME_TYPE] for row in sessions}
    assert game_types == set(seed.GAMES)
    assert game_types <= set(GAME_RESULT_TABLES)
    assert "TGAME" in game_types


def test_each_student_plays_contiguous_days_from_one():
    # 核心不變式(2026-09-22 使用者要求)：每位學生的 current_day 一定從 1
    # 開始連續累加、不缺天、不超過 MAX_ALLOWED_DAY——不是玩到哪天算哪天、
    # 也不能跳著玩。
    _, sessions, _ = seed.generate()
    days_by_student: dict[tuple[str, str, str], set[int]] = {}
    for row in sessions:
        key = (row[S_GRADE], row[S_CASE_ID], row[S_SCHOOL])
        days_by_student.setdefault(key, set()).add(row[S_CURRENT_DAY])

    n_students = len(seed.SCHOOLS) * len(seed.STUDENTS)
    assert len(days_by_student) == n_students
    for days in days_by_student.values():
        assert days == set(range(1, max(days) + 1))
        assert seed.MIN_COMPLETED_DAYS <= max(days) <= seed.MAX_COMPLETED_DAYS
        assert max(days) <= seed.MAX_ALLOWED_DAY


def test_stats_are_internally_consistent():
    # duration 的合理範圍是「該遊戲的 FULL_SESSION_MS ~ +20000ms 抖動」，
    # 不是寫死的一個數字——每款遊戲玩滿一場的長度不一樣（DCCS 是 600000，
    # 其餘是 360000，見 seed.FULL_SESSION_MS），且這份 mock data 一律代表
    # 玩滿一場，duration 不會低於 FULL_SESSION_MS（見 emit() 的抖動只往上加）。
    _, _, details = seed.generate()
    table_to_game = {table: game for game, table in seed.GAME_TABLE.items()}
    for table, rows in details.items():
        full_ms = seed.FULL_SESSION_MS[table_to_game[table]]
        for (_g, _c, _s, _u, correct, wrong, accuracy, duration, stage) in rows:
            assert 15 <= stage <= 40
            assert 0 <= correct <= stage
            assert stage == correct + wrong
            assert accuracy == correct / stage
            assert full_ms <= duration <= full_ms + 20000


def test_uuids_unique_and_deterministic():
    _, sessions, _ = seed.generate()
    uuids = [row[S_UUID] for row in sessions]
    assert len(set(uuids)) == len(uuids)  # 全域唯一

    once = seed.make_uuid("陽光國小", "G1", "S01", "DCCS", 1)
    twice = seed.make_uuid("陽光國小", "G1", "S01", "DCCS", 1)
    assert once == twice
    assert len(once) == 36  # 符合 varchar(36)
    # 同一 (學生,遊戲,施測日) 的單人與雙人 uuid 不同
    assert seed.make_uuid("陽光國小", "G1", "S01", "DCCS", 1, "double") != once


def test_no_round_b_data_with_current_completed_days_range():
    # 2026-09-22 改成「連續玩、少量資料」設計後的已知取捨：MAX_COMPLETED_DAYS
    # 目前小於 13，資料不會跨進 Round B(current_day 13 起)，所以這份 mock
    # data 沒辦法示範「Round B 優於 Round A」的趨勢(原本的
    # test_round_b_beats_round_a_overall 已拿掉，b_vals 會是空的除以零)。
    # 若之後要重新示範這個趨勢，把 MAX_COMPLETED_DAYS 調到 13 以上，
    # 這個測試會提醒你需要一併檢視。
    assert seed.MAX_COMPLETED_DAYS < 13
    _, sessions, _ = seed.generate()
    assert all(row[S_CURRENT_DAY] <= 12 for row in sessions)


def test_daily_timeline_single_block_noon_double_block_afternoon():
    _, sessions, _ = seed.generate()
    for row in sessions:
        start, end = row[S_START], row[S_END]
        assert end > start        # 有時長
        if row[S_MODE] == "single":
            assert start.hour == 12   # 上午 12:00 開始
            assert end.hour < 13      # 整套單人版落在 13:00 前
        else:
            assert start.hour == 14   # 雙人版另一時段
            assert end.hour < 15


def test_play_days_are_mon_wed_fri_across_two_rounds():
    days = seed.build_play_days()
    assert len(days) == 24
    assert [d["current_day"] for d in days] == list(range(1, 25))
    assert all(d["date"].weekday() in (0, 2, 4) for d in days)  # 一/三/五
    assert {d["round"] for d in days} == {"A", "B"}
    assert all(d["date"].month == 1 for d in days if d["round"] == "A")
    assert all(d["date"].month == 3 for d in days if d["round"] == "B")
