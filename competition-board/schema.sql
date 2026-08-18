CREATE TABLE IF NOT EXISTS competitions (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '競賽',
  event_date TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'completed', 'archived')),
  description TEXT NOT NULL DEFAULT '',
  link TEXT NOT NULL DEFAULT '',
  featured INTEGER NOT NULL DEFAULT 0 CHECK (featured IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS competitions_status_date_idx ON competitions(status, event_date);
CREATE INDEX IF NOT EXISTS competitions_featured_idx ON competitions(featured, event_date);
