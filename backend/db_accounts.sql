-- ============================================================================
-- 建立最小權限資料庫帳號（依 docs/adr/0001-least-privilege-db-accounts.md）
--
-- 適用對象：新資料庫伺服器（廠商 2026-09 提供，43.163.233.40:31497）。
-- 用 root 連進去執行一次即可；重複執行安全（CREATE USER IF NOT EXISTS、
-- GRANT 本身是冪等的）。
--
-- 跟 ADR-0001 原文的差異：ADR-0001 寫成時（2026-07-10）帳密登入功能
-- （ADR-0004，2026-09）還不存在。backend/writes.py 的
-- insert_login_session() / delete_login_session()（登入發 token／登出刪 token）
-- 走的是跟遊戲成績寫入同一條 get_write_connection()，也就是同一個帳號
-- （DB_WRITE_USER）。若只照 ADR-0001 原本「7 張表 INSERT」去建 game_writer，
-- 切過去之後登入／登出會直接 500（INSERT/DELETE denied on login_session）。
-- 下面已經把這兩項補進 game_writer 的授權。
--
-- 部署前請先把下面三個密碼換成新產生的強密碼，不要沿用任何舊的／已出現在
-- 文件或聊天記錄裡的字串；換完密碼後，把這份檔案裡的密碼欄位還原成
-- 佔位字串再進 git（這份檔案只放 GRANT 結構，不放真實密碼）。
-- ============================================================================

SET @db_name      = 'AttentionLessonPlan';
SET @test_db_name = 'AttentionLessonPlan_test';

-- ----------------------------------------------------------------------------
-- 1. app_ro —— 只讀，綁正式庫。給部署在 Zeabur 的後端讀取用（DB_USER/DB_PASSWORD）。
--    需要 SELECT 到全部 10 張表：登入要讀 teacher/student 的 password_hash 比對
--    密碼、驗證 token 要讀 login_session、/report 等要讀 assessment_result 與
--    五張 *_result。
-- ----------------------------------------------------------------------------
CREATE USER IF NOT EXISTS 'app_ro'@'%' IDENTIFIED BY 'CHANGE_ME_app_ro_password';

GRANT SELECT ON AttentionLessonPlan.school            TO 'app_ro'@'%';
GRANT SELECT ON AttentionLessonPlan.teacher           TO 'app_ro'@'%';
GRANT SELECT ON AttentionLessonPlan.student           TO 'app_ro'@'%';
GRANT SELECT ON AttentionLessonPlan.login_session     TO 'app_ro'@'%';
GRANT SELECT ON AttentionLessonPlan.assessment_result TO 'app_ro'@'%';
GRANT SELECT ON AttentionLessonPlan.dat_result        TO 'app_ro'@'%';
GRANT SELECT ON AttentionLessonPlan.dccs_result       TO 'app_ro'@'%';
GRANT SELECT ON AttentionLessonPlan.eft_result        TO 'app_ro'@'%';
GRANT SELECT ON AttentionLessonPlan.im_result         TO 'app_ro'@'%';
GRANT SELECT ON AttentionLessonPlan.tgame_result      TO 'app_ro'@'%';

-- ----------------------------------------------------------------------------
-- 2. game_writer —— 只寫，綁正式庫。給部署在 Zeabur 的後端寫入用
--    （DB_WRITE_USER/DB_WRITE_PASSWORD）。
-- ----------------------------------------------------------------------------
CREATE USER IF NOT EXISTS 'game_writer'@'%' IDENTIFIED BY 'CHANGE_ME_game_writer_password';

-- ADR-0001 原本的 7 張表：Unity／遊戲 POST /api/sessions 寫入場次與成績。
GRANT INSERT ON AttentionLessonPlan.student           TO 'game_writer'@'%';
GRANT INSERT ON AttentionLessonPlan.assessment_result TO 'game_writer'@'%';
GRANT INSERT ON AttentionLessonPlan.dat_result        TO 'game_writer'@'%';
GRANT INSERT ON AttentionLessonPlan.dccs_result       TO 'game_writer'@'%';
GRANT INSERT ON AttentionLessonPlan.eft_result        TO 'game_writer'@'%';
GRANT INSERT ON AttentionLessonPlan.im_result         TO 'game_writer'@'%';
GRANT INSERT ON AttentionLessonPlan.tgame_result      TO 'game_writer'@'%';

-- 本次新補：登入（INSERT 一筆 token）／登出（DELETE 該筆 token）。
-- 沒有這兩行，routers/auth.py 的登入與登出端點會回 500。
GRANT INSERT, DELETE ON AttentionLessonPlan.login_session TO 'game_writer'@'%';

-- ----------------------------------------------------------------------------
-- 3. seeder —— 全權，但只綁測試庫。seed.py（預設）與 pytest 用。
--    刻意不給正式庫：這是測試帳號，手滑或外洩也不該有能力動到正式資料。
-- ----------------------------------------------------------------------------
CREATE USER IF NOT EXISTS 'seeder'@'%' IDENTIFIED BY 'CHANGE_ME_seeder_password';

GRANT SELECT, INSERT, DELETE, CREATE ON AttentionLessonPlan_test.* TO 'seeder'@'%';

-- ----------------------------------------------------------------------------
-- 4. root —— 維持全權，只留人工維運，不進任何部署環境變數。
--    這裡刻意不下任何 GRANT／REVOKE，避免這份腳本意外動到 root 自己的權限範圍。
-- ----------------------------------------------------------------------------

FLUSH PRIVILEGES;

-- ----------------------------------------------------------------------------
-- 執行完可以用下面幾行檢查權限是否符合預期（用 root 執行）：
--   SHOW GRANTS FOR 'app_ro'@'%';
--   SHOW GRANTS FOR 'game_writer'@'%';
--   SHOW GRANTS FOR 'seeder'@'%';
-- ----------------------------------------------------------------------------
