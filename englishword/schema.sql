CREATE TABLE IF NOT EXISTS words (
  id TEXT PRIMARY KEY,
  range_name TEXT NOT NULL,
  word TEXT NOT NULL,
  word_normalized TEXT NOT NULL,
  meaning TEXT NOT NULL,
  example TEXT NOT NULL DEFAULT '',
  phonetic TEXT NOT NULL DEFAULT '',
  part_of_speech TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (range_name, word_normalized)
);

CREATE INDEX IF NOT EXISTS words_range_idx ON words(range_name, sort_order, word);
CREATE INDEX IF NOT EXISTS words_normalized_idx ON words(word_normalized);

CREATE TABLE IF NOT EXISTS site_stats (
  stat_key TEXT PRIMARY KEY,
  view_count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS admin_login_attempts (
  client_hash TEXT PRIMARY KEY,
  failures INTEGER NOT NULL DEFAULT 0,
  window_started_at INTEGER NOT NULL,
  blocked_until INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS admin_login_attempts_updated_idx ON admin_login_attempts(updated_at);

CREATE TABLE IF NOT EXISTS quiz_starts (
  session_id TEXT PRIMARY KEY,
  day TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  device_hash TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS quiz_starts_ip_idx ON quiz_starts(day, ip_hash);
CREATE INDEX IF NOT EXISTS quiz_starts_device_idx ON quiz_starts(day, device_hash);
CREATE TRIGGER IF NOT EXISTS quiz_starts_retention AFTER INSERT ON quiz_starts
BEGIN
  DELETE FROM quiz_starts WHERE day < date(NEW.day, '-30 days');
END;
