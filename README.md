# Attention Lesson Plan WebGames

給國小學生玩的 5 款注意力訓練小遊戲，搭配教師端報表與資料管理系統，供 ADHD
注意力教案的介入研究使用（高雄醫學大學、清華大學共 8 個施測場域）。

一支 FastAPI 後端同時提供資料 API 與網頁前端（登入頁、遊戲大廳、DMS、各遊戲
頁面），瀏覽器端不需要處理 CORS，遊戲程式碼裡也不會出現任何資料庫帳密。

**完整架構、資料流程、資料庫設計、測試帳密，都在
[`backend/docs/system-architecture.md`](backend/docs/system-architecture.md)**——
第一次接觸這個專案，先看那份。

---

## 快速啟動（本機開發）

```bash
cd backend
cp .env.example .env              # 填入測試庫帳密（不是正式庫，見下方注意事項）
uv sync --group dev

uv run python seed_directory.py   # 灌場域／老師（測試庫密碼固定 test1234）
uv run python seed.py             # 灌假學生／假成績（帳號固定從 S0001 開始）

uv run uvicorn main:app --reload --host 127.0.0.1 --port 5001
```

瀏覽器開 `http://127.0.0.1:5001/app/`（**不要**用檔案總管雙擊 HTML 檔案，
`file://` 開啟會讓前端的 ES module 跟 API 呼叫全部失敗）。

測試帳密（老師 `T0001`、學生 `S0001`／`S0002`，密碼都是 `test1234`）與「為什麼
這組帳密固定不變、什麼情況會失效」，見
[`system-architecture.md` §4](backend/docs/system-architecture.md#4-測試帳密)。

⚠️ **`pytest` 會清空整個測試庫**（測試隔離機制）。要有能登入的帳密，`pytest`
一定要排在灌資料**之前**跑，不能在之後。

---

## 資料夾結構

```
backend/    ← FastAPI 後端，只有後端負責人碰
frontend/   ← 登入頁／大廳／DMS 由後端負責人維護；每款遊戲各自一個子資料夾
  └── dccs/ ← 已完成串接的範例，其他遊戲照這個模式接
```

完整標註版本、每個檔案的用途，見
[`system-architecture.md` §2](backend/docs/system-architecture.md#2-檔案架構)。

---

## 五款遊戲串接狀態

| 遊戲 | 說明 | 狀態 |
|---|---|---|
| **DCCS**（賽道攔截） | 維度轉換與認知彈性評測，含單／雙人版 | ✅ 已完成，`frontend/dccs/` |
| **DAT** | 持續性注意力評測，含單／雙人版 | ⏳ 串接中 |
| **EFT** | 視覺搜尋評測，含單／雙人版 | ⏳ 串接中 |
| **IM** | 工作記憶與反應控制評測 | ⏳ 待排入 |
| **TGame** | 空間認知與路線規劃評測 | ⏳ 待排入 |

## Login Page

`frontend/index.html`，老師／學生帳密登入，見
[`docs/adr/0004-teacher-student-password-login.md`](backend/docs/adr/0004-teacher-student-password-login.md)。

## Data Management System Page

`frontend/dms.html`，老師查看場域內學生的場次與報表，見
[`docs/dms-integration-notes.md`](backend/docs/dms-integration-notes.md)。

---

## 新遊戲要怎麼加入

1. 整個遊戲放進自己的資料夾：`frontend/<game>/`。
2. 成績只送一支端點：`POST /api/sessions`，同源相對路徑，不寫死任何網域。
3. 在 `frontend/games.html` 的 `GAME_PAGES` 對照表加一行。
4. 開一個 PR，內容只有 `frontend/<game>/` ＋ `games.html` 那一行，不動
   `backend/` 任何檔案。

完整規則見 [`system-architecture.md` §2.1](backend/docs/system-architecture.md#21-新遊戲要怎麼接進來)，
唯一一份完整範例是 `frontend/dccs/`（[`SPEC.md`](frontend/dccs/SPEC.md)／
[`README.md`](frontend/dccs/README.md)）。

---

## 文件索引

| 文件 | 給誰 |
|---|---|
| [`backend/docs/system-architecture.md`](backend/docs/system-architecture.md) | 所有人，先看這份 |
| [`backend/docs/unity-integration-guide.md`](backend/docs/unity-integration-guide.md) | 各遊戲負責人 |
| [`backend/docs/frontend-integration-guide.md`](backend/docs/frontend-integration-guide.md) | 前端／DMS |
| [`backend/docs/database-schema.md`](backend/docs/database-schema.md) | 需要看 schema 演進脈絡的人 |
| [`backend/docs/backend-reference.md`](backend/docs/backend-reference.md) | API 清單＋資料庫濃縮總覽 |
| [`backend/docs/school-directory.md`](backend/docs/school-directory.md) | 場域代碼定案清單 |
| [`backend/README.md`](backend/README.md) | 後端啟動細節、端點清單 |
