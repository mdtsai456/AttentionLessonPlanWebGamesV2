// 大廳資料來自同源 sessionStorage。currentDay 暫由歷史場次推導；長期應由
// 後端統一提供，避免各遊戲各自計算而不同步（見 docs/dccs-lobby-handoff.md）。

import { resolveApiBase } from './net/apiBase.js';

const KEY_MODE = 'game_mode';
// 大廳「訓練進度選擇」讓玩家自己指定要玩第幾天，寫在這個 key 裡。
// 2026-09-22 起改為：玩家自選，不再強制用歷史推導值——研究資料可能因此
// 出現同一天重玩／跳著玩的情況，這是已知、已跟後端負責人確認過的取捨。
const KEY_SELECTED_DAY = 'lobby_selected_current_day';

function readKey(key) {
  try {
    return sessionStorage.getItem(key);
  } catch (_err) {
    // 隱私模式下讀 sessionStorage 會 throw；當成「沒有大廳資訊」處理。
    return null;
  }
}

/**
 * 後端 auth.py 組出來的 studentKey 形如 `G1_S03`（grade_caseId）。
 * caseId 本身可能含底線，所以只切第一個。
 * @param {string | null} studentKey
 * @returns {{grade: string, caseId: string} | null}
 */
function splitStudentKey(studentKey) {
  if (!studentKey) return null;
  const idx = studentKey.indexOf('_');
  if (idx <= 0 || idx === studentKey.length - 1) return null;
  return {
    grade: studentKey.slice(0, idx),
    caseId: studentKey.slice(idx + 1),
  };
}

/**
 * 讀出大廳登入的第 slot 位玩家（1 或 2）。
 * @param {1 | 2} slot
 * @returns {{grade: string, caseId: string, school: string, studentKey: string,
 *            token: string | null} | null}
 */
export function readLobbyPlayer(slot) {
  const studentKey = readKey(`student${slot}_key`);
  const school = readKey(`student${slot}_school`);
  const parts = splitStudentKey(studentKey);
  if (!parts || !school) return null;

  return {
    ...parts,
    school,
    studentKey,
    // 單人另有共用 token；雙人第二位只有 student2_token。
    token: readKey(`student${slot}_token`) || readKey('token'),
  };
}

/**
 * 判斷這一頁是不是從大廳進來的，並回傳該場的玩家。
 * @returns {{mode: 'single' | 'double',
 *            players: Array<object>} | null} 不是從大廳進來則為 null
 */
export function readLobbySession() {
  const player1 = readLobbyPlayer(1);
  if (!player1) return null;

  const player2 = readLobbyPlayer(2);
  const wantsDouble = readKey(KEY_MODE) === 'double';

  if (wantsDouble && player2) {
    return { mode: 'double', players: [player1, player2] };
  }
  return { mode: 'single', players: [player1] };
}

/** 把後端的 "YYYY-MM-DD HH:MM:SS"（UTC naive）轉成本地時區的 Date。 */
function parseUtcTimestamp(value) {
  if (typeof value !== 'string' || !value) return null;
  const date = new Date(`${value.replace(' ', 'T')}Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * 推導這位學生今天的 currentDay。
 *
 * 優先序：大廳「訓練進度選擇」的玩家自選值（KEY_SELECTED_DAY）> 依歷史場次
 * 自動推導。選了哪一天，畫面上的進度回顧跟實際送出的 currentDay 是同一個值
 * ——玩家看到「第 N 次的進度」點下去玩，就是真的在玩第 N 天。
 *
 * 沒有自選值時才走自動推導：施測日是「本地日曆上的一天」，後端存的是 UTC，
 * 所以比較前先轉回本地時區。同一天已經玩過別款遊戲 → 沿用那個值；否則取
 * 歷史最大值 +1；沒有紀錄 → 1。這段推導失敗一律 throw，**不得**默默猜一個
 * 值，寧可退回讓現場人員手動填。
 *
 * @param {{grade: string, caseId: string, school: string, token: string|null}} player
 * @returns {Promise<number>}
 */
export async function resolveCurrentDay(player) {
  const selected = readKey(KEY_SELECTED_DAY);
  if (selected !== null) {
    const day = Number(selected);
    if (Number.isInteger(day) && day >= 1) return day;
  }

  if (!player || !player.token) {
    throw new Error('resolveCurrentDay: 缺少登入 token，無法查詢既有場次');
  }

  const url =
    `${resolveApiBase()}/students/` +
    `${encodeURIComponent(`${player.grade}_${player.caseId}`)}/sessions` +
    `?school=${encodeURIComponent(player.school)}`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${player.token}` },
  });

  if (!res.ok) {
    throw new Error(`resolveCurrentDay: 查詢場次失敗（HTTP ${res.status}）`);
  }

  const body = await res.json();
  const sessions = Array.isArray(body && body.sessions) ? body.sessions : [];
  if (sessions.length === 0) return 1;

  const todayKey = new Date().toDateString();
  let maxSeen = 0;
  let todaysDay = null;

  for (const session of sessions) {
    const day = Number(session.currentDay);
    if (!Number.isFinite(day)) continue;
    if (day > maxSeen) maxSeen = day;

    const startedAt = parseUtcTimestamp(session.startTime);
    if (startedAt && startedAt.toDateString() === todayKey) {
      // 同一施測日的 5 款遊戲共用同一個 currentDay；取最大的那個，避免
      // 早先某一場寫錯值時整天都被拉低。
      todaysDay = todaysDay === null ? day : Math.max(todaysDay, day);
    }
  }

  if (todaysDay !== null) return todaysDay;
  return maxSeen + 1;
}

export function returnToLobby() {
  window.location.href = '../games.html';
}
