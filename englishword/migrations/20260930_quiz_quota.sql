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
