-- ============================================================================
-- 補正式庫（AttentionLessonPlan）缺的帳密登入功能結構（ADR-0004，2026-09-11）
--
-- 背景：正式庫是 2026-09-08 用當時的 tests/schema.sql 建的，早於帳密登入功能
-- （2026-09-11 才加）。測試庫（AttentionLessonPlan_test）之後有照最新
-- tests/schema.sql 重建，正式庫沒有，兩邊因此分岔。
--
-- 2026-09-22 用 information_schema 實際比對確認缺口：
--   - student 缺 password_hash / student_id / account 三個欄位＋對應 unique key
--   - teacher 缺 password_hash / account 兩個欄位＋對應 unique key
--   - login_session 整張表不存在
--   （uq_teacher_school_name、fk_student_school、fk_teacher_school 這些登入功能
--    以外的既有結構，正式庫本來就有，兩邊一致，這份腳本不會重複處理。）
--
-- 每一段都跟 backend/tests/schema.sql 目前的定義逐欄對照，跑完之後兩邊 schema
-- 應該完全一致。全部下在明確的 `AttentionLessonPlan.`（正式庫）前綴上，就算
-- 執行時 DBeaver 預設連的資料庫不是它，也不會誤動到別的庫。
--
-- 影響評估：
--   - student 目前是空表（0 筆），新增三欄不需要回填。
--   - teacher 目前有 16 筆佔位資料，password_hash 會補成 ''（跟 ADR-0004
--     「既有資料視為尚未指派密碼」的處理一致）；account 補成 NULL——UNIQUE
--     索引允許多筆 NULL 並存，16 筆同時是 NULL 不會衝突。
--   - 純加欄位／加表，不刪除、不修改任何既有欄位或既有資料。
-- ============================================================================

-- ---------- 1. student：補三個帳密登入欄位 ----------
ALTER TABLE `AttentionLessonPlan`.`student`
  ADD COLUMN `password_hash` varchar(255) NOT NULL DEFAULT '' AFTER `school`,
  ADD COLUMN `student_id` int NOT NULL AUTO_INCREMENT AFTER `password_hash`,
  ADD COLUMN `account` varchar(20) DEFAULT NULL AFTER `student_id`,
  ADD UNIQUE KEY `uq_student_id` (`student_id`),
  ADD UNIQUE KEY `uq_student_account` (`account`);

-- ---------- 2. teacher：補兩個帳密登入欄位 ----------
ALTER TABLE `AttentionLessonPlan`.`teacher`
  ADD COLUMN `password_hash` varchar(255) NOT NULL DEFAULT '' AFTER `school`,
  ADD COLUMN `account` varchar(20) DEFAULT NULL AFTER `password_hash`,
  ADD UNIQUE KEY `uq_teacher_account` (`account`);

-- ---------- 3. login_session：整張表補上 ----------
CREATE TABLE IF NOT EXISTS `AttentionLessonPlan`.`login_session` (
  `token` varchar(64) NOT NULL,
  `subject_type` enum('teacher','student') NOT NULL,
  `teacher_id` int DEFAULT NULL,
  `grade` varchar(20) DEFAULT NULL,
  `case_id` varchar(50) DEFAULT NULL,
  `school` varchar(100) DEFAULT NULL,
  `created_at` datetime NOT NULL,
  `expires_at` datetime NOT NULL,
  PRIMARY KEY (`token`),
  CONSTRAINT `fk_login_session_teacher` FOREIGN KEY (`teacher_id`)
    REFERENCES `AttentionLessonPlan`.`teacher` (`teacher_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_login_session_student` FOREIGN KEY (`grade`, `case_id`, `school`)
    REFERENCES `AttentionLessonPlan`.`student` (`grade`, `case_id`, `school`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================================
-- 跑完後可以用這幾行快速確認（或直接重跑 diff_schema.py 那份比對腳本）：
--   SHOW COLUMNS FROM AttentionLessonPlan.student;
--   SHOW COLUMNS FROM AttentionLessonPlan.teacher;
--   SHOW TABLES FROM AttentionLessonPlan LIKE 'login_session';
-- ============================================================================
