-- KIET site backend — run automatically via: npm run db:migrate
-- (You do not need to paste this by hand unless you prefer the MySQL console.)

CREATE TABLE IF NOT EXISTS site_config (
  id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
  json_data LONGTEXT NOT NULL,
  updated_at TIMESTAMP(3) NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
);

CREATE TABLE IF NOT EXISTS analytics_events (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  at DATETIME(3) NOT NULL,
  type VARCHAR(64) NOT NULL,
  session_id VARCHAR(120) NOT NULL DEFAULT '',
  section VARCHAR(64) NOT NULL DEFAULT '',
  payload JSON NULL,
  ip VARCHAR(64) NOT NULL DEFAULT '',
  ua VARCHAR(500) NOT NULL DEFAULT '',
  INDEX idx_analytics_at (at),
  INDEX idx_analytics_session (session_id)
);

CREATE TABLE IF NOT EXISTS admissions (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  at DATETIME(3) NOT NULL,
  source VARCHAR(32) NOT NULL,
  session_id VARCHAR(255) NOT NULL DEFAULT '',
  full_name VARCHAR(255) NULL DEFAULT '',
  email VARCHAR(255) NULL DEFAULT '',
  dob VARCHAR(64) NULL DEFAULT '',
  stream VARCHAR(128) NULL DEFAULT '',
  branch VARCHAR(255) NULL DEFAULT '',
  phone VARCHAR(64) NULL DEFAULT '',
  city VARCHAR(128) NULL DEFAULT '',
  district VARCHAR(128) NULL DEFAULT '',
  name VARCHAR(255) NULL DEFAULT '',
  INDEX idx_adm_at (at),
  INDEX idx_adm_source (source)
);

CREATE TABLE IF NOT EXISTS admissions_partial (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  at DATETIME(3) NOT NULL,
  session_id VARCHAR(120) NOT NULL,
  completion_percent SMALLINT NOT NULL,
  page VARCHAR(64) NOT NULL DEFAULT 'admissions',
  fields JSON NULL,
  INDEX idx_part_at (at),
  INDEX idx_part_session (session_id)
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id VARCHAR(80) NOT NULL PRIMARY KEY,
  at DATETIME(3) NOT NULL,
  session_id VARCHAR(120) NOT NULL,
  role ENUM('visitor', 'admin') NOT NULL,
  body TEXT NOT NULL,
  page_url VARCHAR(512) NOT NULL DEFAULT '',
  read_by_admin TINYINT(1) NOT NULL DEFAULT 0,
  INDEX idx_chat_session (session_id),
  INDEX idx_chat_at (at)
);
