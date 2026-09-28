# 檔案結構 (還在慢慢修改中)
frontend/
└── dat/
    ├── index.html               單人的遊戲說明頁面     
    ├── double.html              雙人的遊戲頁面     
    ├── single_.html             單人遊戲遊玩頁面    
    ├── README.md                     
    ├── assets/                  素材(背景、準心、動物等)     
    │   ├── background.png
    │   ├── crosshair.png
    │   └── animals/
    │       ├── 動物.png
    │       └── rabbit-hit-mask.js
    ├── css/                          
    │   ├── single.css                
    │   ├── double.css                
    │   └── single_tutorial.css              
    └── js/                          
        ├── double_api.js   雙人的資料庫 API call
        ├── double_game.js   雙人的遊戲邏輯與方法 要修改
        ├── double_main.js   雙人的遊戲架構
        ├── double_questions.js   雙人的問題生成
        ├── single_api.js   單人的資料庫 API call
        ├── single_questions.js   單人的問題生成
        ├── single_tutorial.js   單人的遊戲說明                     
        └── single.js   單人的主要遊戲畫面、遊玩邏輯，修改題目的關卡數、題目數、時間在這邊       


# DAT 遊戲注意事項
## DAT 需要修改的地方
- 題數跟秒數調整
- 程式碼功能相同的地方要一樣
- 每個 function 要加註解 (不要寫在程式後面)
- 暫停的時候要一樣(9/28現在處理)
- 下一關的時候要統一寫法 (9/28現在處理)
- 如果程式碼有多的註解要記得刪掉
- 新增紀錄準心在動物上面的時間
- 把換動物的彩蛋加上去 (能從素材抓到就用素材、沒有就用 defult)
- 總共 6 分鐘、6 個關卡，每關 1 分鐘、1 關有 6 題，每題 10 秒 

## 其他問題
- 遊戲進度條：
    - 分成 0 關(沒有完成關卡)、3 關(一半，會有進度保存)、6 關(完成所有關卡)
    - 完成一半(3 關)要顯示一半的，完成全部要滿的，不知道為什麼沒有顯示?
- 回傳資料庫的 sessionid 要哪邊抓？


## 遊戲時間與規則
到了 正式關卡之後 

DAT SINGLE ... 一天的訓練量為 6 分鐘

001   動物一直移動 這 6 分鐘會去計算說使用者 將準心放在動物上多少 '''秒'''

002   中間上面的輸入框 會顯示 '''非常多題目'''

正確且需要按下空白鍵的話
10 秒內沒有回答就會自動進行下一題

錯誤且不需要按下空白鍵的話
10 秒後就會自動進行下一題                       