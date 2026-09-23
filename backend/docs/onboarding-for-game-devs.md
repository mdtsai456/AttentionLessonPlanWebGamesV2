# 給遊戲負責人的上工筆記

這份是「第一天要看什麼、要注意什麼」的濃縮版，不是完整規格——完整規格在下面
指到的文件裡。這份只負責把最容易漏看、漏踩坑的地方講清楚。

## 1. 照這個順序讀文件

1. 專案根目錄 [`README.md`](../../README.md) —— 專案是什麼、資料夾結構、
   五款遊戲串接狀態、新遊戲怎麼加入。
2. [`system-architecture.md`](system-architecture.md) —— 系統流程圖、資料庫
   設計、測試帳密。**遇到「這個系統到底怎麼運作」的疑問先查這份。**
3. [`../README.md`](../README.md)（backend 的 README）—— 本機啟動、測試、
   假資料、資料庫帳號的完整細節。
4. [`frontend/dccs/SPEC.md`](../../frontend/dccs/SPEC.md) + [`README.md`](../../frontend/dccs/README.md) ——
   唯一一份「完整走過一次串接」的範例，規則寫得含糊的地方，直接看這份怎麼做。
5. [`unity-integration-guide.md`](unity-integration-guide.md) —— 成績要怎麼
   POST 回來、場域代碼表、雙人版欄位。**這是你們實際會用到的契約規格。**

## 2. `.env` 設定（本機開發最容易搞錯的地方）

```bash
cd backend
cp .env.example .env
```

`.env.example` 已經是本機開發該用的預設值（host、port 都對），**唯二要自己
填的是 `DB_PASSWORD` / `DB_WRITE_PASSWORD`**——跟 Debby 要 `seeder` 這組帳密
（只綁得到測試庫 `_test`，連不到正式庫，弄壞了也不影響任何人）。

**不要用 `app_ro`／`game_writer`／`root` 這三組帳密**，就算有人不小心把它們
給你也不要用：

- `app_ro`／`game_writer` 是**正式站**部署用的，只活在 Zeabur 的環境變數裡。
- `root` 只留給人工維運，不該出現在任何人的本機 `.env`。

你的遊戲程式碼裡**不會、也不需要**出現任何一組資料庫帳密——遊戲只呼叫
`POST /api/sessions`，資料庫連線是後端的事。

## 3. 啟動本機環境

```bash
uv sync --group dev

uv run python seed_directory.py   # 灌場域／老師（測試庫密碼固定 test1234）
uv run python seed.py             # 灌假學生／假成績（帳號固定從 S0001 開始）

uv run uvicorn main:app --reload --host 127.0.0.1 --port 5001
```

瀏覽器開 `http://127.0.0.1:5001/app/`。**不要**用檔案總管雙擊任何 HTML 檔案
（`file://` 打開會讓 ES module 跟 API 呼叫全部失敗，前端本來就設計成要由這支
後端伺服器提供）。

### ⚠️ 最容易踩的坑：`pytest` 會清空整個測試庫

`pytest` 的測試隔離機制會把 `school`／`teacher`／`student`／`login_session`／
`assessment_result` 全部清空，這是刻意設計，不是 bug。**規則：`pytest` 要排在
上面兩支灌資料指令之前跑，不能在之後。** 如果你曾經在灌完資料後又跑過一次
`pytest`（哪怕只是想確認環境沒問題），登入用的帳密就會消失，需要照上面順序
重跑一次 `seed_directory.py` + `seed.py`。

### 固定測試帳密

| 角色 | 帳號 | 密碼 |
|---|---|---|
| 老師 | `T0001` | `test1234` |
| 學生 1 | `S0001` | `test1234` |
| 學生 2 | `S0002` | `test1234` |

兩位學生同場域（KMU），可以拿來測雙人模式。這組帳密照上面順序重灌之後永遠
一樣，細節見 [`system-architecture.md` §4](system-architecture.md#4-測試帳密)。

## 4. 開發規則（避免大家互相衝突）

1. 整個遊戲放進自己的資料夾：`frontend/<game>/`，**只碰這個資料夾**。
2. 成績只送一支端點：`POST /api/sessions`，同源相對路徑（照
   `frontend/dccs/js/net/apiBase.js` 的寫法：優先讀 `window.API_BASE_URL` 之類
   的覆寫變數，預設用 `${location.origin}/api`），**不要在程式碼裡寫死任何網域**。
3. 受試者資訊（`grade`／`caseId`／`school`／`currentDay`）從大廳的
   `sessionStorage` 讀（照 `frontend/dccs/js/lobby.js` 的模式），不要求玩家
   重新輸入。
4. 在 `frontend/games.html` 的 `GAME_PAGES` 對照表加一行你的遊戲路徑。
5. 開 PR 時，**內容只有 `frontend/<game>/` ＋ `games.html` 那一行**，不要動
   `backend/` 任何檔案。真的需要後端配合（例如要多存一個遊戲專屬欄位），
   直接跟 Debby 說，由她統一處理。

## 5. 卡住的話

- 系統怎麼運作、資料庫長怎樣 → 先查 [`system-architecture.md`](system-architecture.md)。
- 成績要怎麼送、欄位對不對 → 查 [`unity-integration-guide.md`](unity-integration-guide.md)。
- 場域代碼打對了嗎 → 查 [`school-directory.md`](school-directory.md)，逐字對照，
  連字號不要打錯。
- 以上都查不到 → 找 Debby。
