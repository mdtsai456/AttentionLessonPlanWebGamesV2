# Bubble Focus Game

## 頁面入口

- 單人模式：`/app/EFT/single.html`
- 雙人模式：`/app/EFT/double.html`

兩個頁面共用以下流程：

1. 開始遊戲
2. 操作說明
3. 30 秒練習
4. 正式開始倒數
5. 十關正式遊戲
6. 將結果傳送到後端 API

## 登入資料

遊戲從 sessionStorage 讀取登入流程留下的資料。

單人需要：

- student1_grade
- student1_case_id
- student1_school
- current_day

雙人另外需要：

- student2_grade
- student2_case_id
- student2_school

也支援 student1／student2 JSON 物件，以及既有的 student1_key=G1_S03 格式。

## 結果 API

正式結束與中途離場都會呼叫同源的：

POST /api/sessions

單人送出一筆資料。雙人送出兩筆資料，每位學生各一筆，兩筆共用：

- data.mode = "double"
- data.pairId = crypto.randomUUID() 產生的 UUID

遊戲代碼固定使用 EFT：

- lessonId = "1140908_EFT"
- EFT_correct
- EFT_wrong
- EFT_accuracy
- EFT_duration
- EFT_stage

瀏覽器實際離開或重新整理時，使用 navigator.sendBeacon 傳送當前進度。

## 本機執行

EFT 為原生 HTML、CSS 與 JavaScript，不需要前端建置工具或 Node.js。請依專案根目錄
README 啟動 FastAPI，並從 `/app/EFT/single.html` 或 `/app/EFT/double.html` 進入。
