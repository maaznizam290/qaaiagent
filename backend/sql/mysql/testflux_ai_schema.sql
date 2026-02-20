-- Test Flux MySQL schema (XAMPP/TablePlus friendly)
-- Purpose: persist data for
-- 1) Signup (user creation)
-- 2) Sign in (user verification attempts)
-- 3) Test Flux Script Engine runs
-- 4) Self-Healing Engine runs
--
-- Notes:
-- - This design is append-only for auditability ("read-only after insert").
-- - UPDATE/DELETE are blocked by triggers.
-- - Use utf8mb4 for full Unicode support.

-- If your DB already exists in TablePlus (e.g. `Test Flux`), keep only USE.
-- If it does not exist, uncomment CREATE DATABASE and run once.
-- CREATE DATABASE IF NOT EXISTS `Test Flux`
--   CHARACTER SET utf8mb4
--   COLLATE utf8mb4_unicode_ci;

USE `Test Flux`;

SET NAMES utf8mb4;

-- =========================================================
-- 1) Signup (User creation)
-- =========================================================
CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(80) NOT NULL,
  email VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('user', 'admin') NOT NULL DEFAULT 'user',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email),
  KEY idx_users_created_at (created_at)
) ENGINE=InnoDB;

-- =========================================================
-- 2) Sign in (User verification)
-- =========================================================
CREATE TABLE IF NOT EXISTS signin_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NULL,
  email_attempted VARCHAR(255) NOT NULL,
  success TINYINT(1) NOT NULL,
  failure_reason VARCHAR(255) NULL,
  ip_address VARCHAR(45) NULL,
  user_agent VARCHAR(512) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_signin_events_user_id (user_id),
  KEY idx_signin_events_email (email_attempted),
  KEY idx_signin_events_created_at (created_at),
  CONSTRAINT fk_signin_events_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON UPDATE RESTRICT
    ON DELETE SET NULL
) ENGINE=InnoDB;

-- =========================================================
-- 3) Test Flux Script Engine
-- =========================================================
CREATE TABLE IF NOT EXISTS script_engine_runs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  source_url VARCHAR(2048) NOT NULL,
  instruction TEXT NOT NULL,
  framework ENUM('playwright', 'cypress') NOT NULL DEFAULT 'playwright',
  generated_events_json JSON NULL,
  selector_map_json JSON NULL,
  transformed_playwright LONGTEXT NULL,
  transformed_cypress LONGTEXT NULL,
  warning_text TEXT NULL,
  status ENUM('generated', 'failed') NOT NULL DEFAULT 'generated',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_script_engine_runs_user_id (user_id),
  KEY idx_script_engine_runs_framework (framework),
  KEY idx_script_engine_runs_created_at (created_at),
  CONSTRAINT fk_script_engine_runs_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON UPDATE RESTRICT
    ON DELETE RESTRICT
) ENGINE=InnoDB;

-- =========================================================
-- 4) Self-Healing Engine
-- =========================================================
CREATE TABLE IF NOT EXISTS self_healing_runs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  flow_id BIGINT UNSIGNED NULL,
  target_type ENUM('flow_id', 'url') NOT NULL,
  target_value VARCHAR(2048) NOT NULL,
  instruction TEXT NOT NULL,
  framework ENUM('playwright', 'cypress') NOT NULL DEFAULT 'playwright',
  strict_selector_match TINYINT(1) NOT NULL DEFAULT 0,
  status ENUM('passed', 'failed', 'diagnostic') NOT NULL DEFAULT 'diagnostic',
  total_selectors INT UNSIGNED NOT NULL DEFAULT 0,
  primary_matched INT UNSIGNED NOT NULL DEFAULT 0,
  fallback_matched INT UNSIGNED NOT NULL DEFAULT 0,
  unresolved_count INT UNSIGNED NOT NULL DEFAULT 0,
  dom_before LONGTEXT NOT NULL,
  dom_after LONGTEXT NOT NULL,
  dom_current LONGTEXT NOT NULL,
  healing_summary_json JSON NULL,
  selector_resolution_json JSON NULL,
  dom_diff_json JSON NULL,
  run_logs MEDIUMTEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_self_healing_runs_user_id (user_id),
  KEY idx_self_healing_runs_status (status),
  KEY idx_self_healing_runs_framework (framework),
  KEY idx_self_healing_runs_created_at (created_at),
  CONSTRAINT fk_self_healing_runs_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON UPDATE RESTRICT
    ON DELETE RESTRICT
) ENGINE=InnoDB;

-- =========================================================
-- 5) Test Runs
-- =========================================================
CREATE TABLE IF NOT EXISTS test_runs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  flow_id BIGINT UNSIGNED NULL,
  framework ENUM('playwright', 'cypress') NOT NULL DEFAULT 'playwright',
  status ENUM('passed', 'failed') NOT NULL,
  analysis_status ENUM('pending', 'analyzing', 'completed', 'failed') NULL,
  analysis_timestamp DATETIME NULL,
  logs MEDIUMTEXT NULL,
  duration_ms INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_test_runs_user_id (user_id),
  KEY idx_test_runs_flow_id (flow_id),
  KEY idx_test_runs_status (status),
  KEY idx_test_runs_analysis_status (analysis_status),
  KEY idx_test_runs_created_at (created_at),
  CONSTRAINT fk_test_runs_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON UPDATE RESTRICT
    ON DELETE RESTRICT
) ENGINE=InnoDB;

-- =========================================================
-- 6) AI Failure Analysis (linked to test run id)
-- =========================================================
CREATE TABLE IF NOT EXISTS failure_analyses (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  test_run_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  failure_report_json JSON NOT NULL,
  analysis_json JSON NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_failure_analyses_test_run_id (test_run_id),
  KEY idx_failure_analyses_user_id (user_id),
  KEY idx_failure_analyses_created_at (created_at),
  CONSTRAINT fk_failure_analyses_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON UPDATE RESTRICT
    ON DELETE RESTRICT
) ENGINE=InnoDB;

-- =========================================================
-- 7) Test Run Actions (panel actions audit)
-- =========================================================
CREATE TABLE IF NOT EXISTS test_run_actions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  test_run_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  action_type ENUM('patch_suggestion', 'issue_ticket', 'known_flaky', 'rerun_test') NOT NULL,
  payload_json JSON NULL,
  status ENUM('requested', 'completed', 'failed') NOT NULL DEFAULT 'requested',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_test_run_actions_test_run_id (test_run_id),
  KEY idx_test_run_actions_user_id (user_id),
  KEY idx_test_run_actions_action_type (action_type),
  KEY idx_test_run_actions_created_at (created_at),
  CONSTRAINT fk_test_run_actions_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON UPDATE RESTRICT
    ON DELETE RESTRICT
) ENGINE=InnoDB;

-- =========================================================
-- 8) Autonomous QA Agent
-- =========================================================
CREATE TABLE IF NOT EXISTS qa_test_plans (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  input_json JSON NOT NULL,
  plan_json JSON NOT NULL,
  status ENUM('generated', 'failed') NOT NULL DEFAULT 'generated',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_qa_test_plans_user_id (user_id),
  KEY idx_qa_test_plans_created_at (created_at),
  CONSTRAINT fk_qa_test_plans_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON UPDATE RESTRICT
    ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS qa_coverage_reports (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  report_json JSON NOT NULL,
  analysis_json JSON NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_qa_coverage_reports_user_id (user_id),
  KEY idx_qa_coverage_reports_created_at (created_at),
  CONSTRAINT fk_qa_coverage_reports_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON UPDATE RESTRICT
    ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS qa_ci_sync_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  provider ENUM('github', 'gitlab') NOT NULL,
  repo VARCHAR(255) NOT NULL,
  status_json JSON NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_qa_ci_sync_logs_user_id (user_id),
  KEY idx_qa_ci_sync_logs_created_at (created_at),
  CONSTRAINT fk_qa_ci_sync_logs_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON UPDATE RESTRICT
    ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS qa_learning_patterns (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  pattern_key VARCHAR(255) NOT NULL,
  failure_type VARCHAR(64) NOT NULL,
  root_cause TEXT NOT NULL,
  impacted_layer VARCHAR(120) NULL,
  suggested_fix TEXT NULL,
  occurrence_count INT UNSIGNED NOT NULL DEFAULT 1,
  last_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  metadata_json JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_qa_learning_patterns_user_pattern (user_id, pattern_key),
  KEY idx_qa_learning_patterns_user_id (user_id),
  KEY idx_qa_learning_patterns_occurrence_count (occurrence_count),
  CONSTRAINT fk_qa_learning_patterns_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON UPDATE RESTRICT
    ON DELETE RESTRICT
) ENGINE=InnoDB;

-- =========================================================
-- Append-only protection (read-only after insert)
-- =========================================================
DELIMITER $$

CREATE TRIGGER trg_users_no_update
BEFORE UPDATE ON users
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'users is append-only. UPDATE is not allowed.';
END$$

CREATE TRIGGER trg_users_no_delete
BEFORE DELETE ON users
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'users is append-only. DELETE is not allowed.';
END$$

CREATE TRIGGER trg_signin_events_no_update
BEFORE UPDATE ON signin_events
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'signin_events is append-only. UPDATE is not allowed.';
END$$

CREATE TRIGGER trg_signin_events_no_delete
BEFORE DELETE ON signin_events
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'signin_events is append-only. DELETE is not allowed.';
END$$

CREATE TRIGGER trg_script_engine_runs_no_update
BEFORE UPDATE ON script_engine_runs
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'script_engine_runs is append-only. UPDATE is not allowed.';
END$$

CREATE TRIGGER trg_script_engine_runs_no_delete
BEFORE DELETE ON script_engine_runs
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'script_engine_runs is append-only. DELETE is not allowed.';
END$$

CREATE TRIGGER trg_self_healing_runs_no_update
BEFORE UPDATE ON self_healing_runs
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'self_healing_runs is append-only. UPDATE is not allowed.';
END$$

CREATE TRIGGER trg_self_healing_runs_no_delete
BEFORE DELETE ON self_healing_runs
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'self_healing_runs is append-only. DELETE is not allowed.';
END$$

CREATE TRIGGER trg_failure_analyses_no_update
BEFORE UPDATE ON failure_analyses
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'failure_analyses is append-only. UPDATE is not allowed.';
END$$

CREATE TRIGGER trg_failure_analyses_no_delete
BEFORE DELETE ON failure_analyses
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'failure_analyses is append-only. DELETE is not allowed.';
END$$

DELIMITER ;

-- =========================================================
-- Query templates for app integration
-- =========================================================

-- Signup (create user)
-- INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?);

-- Sign in verification (check credentials)
-- SELECT id, email, password_hash, role, is_active
-- FROM users
-- WHERE email = ?
-- LIMIT 1;

-- Sign in event audit
-- INSERT INTO signin_events (user_id, email_attempted, success, failure_reason, ip_address, user_agent)
-- VALUES (?, ?, ?, ?, ?, ?);

-- Test Flux Script Engine run
-- INSERT INTO script_engine_runs
-- (user_id, source_url, instruction, framework, generated_events_json, selector_map_json, transformed_playwright, transformed_cypress, warning_text, status)
-- VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);

-- Self-Healing Engine run
-- INSERT INTO self_healing_runs
-- (user_id, flow_id, target_type, target_value, instruction, framework, strict_selector_match, status, total_selectors, primary_matched, fallback_matched, unresolved_count, dom_before, dom_after, dom_current, healing_summary_json, selector_resolution_json, dom_diff_json, run_logs)
-- VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);

-- AI Failure Analysis linked to run id
-- INSERT INTO failure_analyses (test_run_id, user_id, failure_report_json, analysis_json)
-- VALUES (?, ?, ?, ?);

-- Read-only analytics examples
-- SELECT * FROM users ORDER BY created_at DESC LIMIT 50;
-- SELECT * FROM signin_events ORDER BY created_at DESC LIMIT 100;
-- SELECT * FROM script_engine_runs ORDER BY created_at DESC LIMIT 100;
-- SELECT * FROM self_healing_runs ORDER BY created_at DESC LIMIT 100;
-- SELECT * FROM test_runs ORDER BY created_at DESC LIMIT 100;
-- SELECT * FROM failure_analyses ORDER BY created_at DESC LIMIT 100;
-- SELECT * FROM test_run_actions ORDER BY created_at DESC LIMIT 100;
-- SELECT * FROM qa_test_plans ORDER BY created_at DESC LIMIT 100;
-- SELECT * FROM qa_coverage_reports ORDER BY created_at DESC LIMIT 100;
-- SELECT * FROM qa_ci_sync_logs ORDER BY created_at DESC LIMIT 100;
-- SELECT * FROM qa_learning_patterns ORDER BY occurrence_count DESC LIMIT 100;
