CREATE TABLE IF NOT EXISTS daily_update_users (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  login_id TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_login_at TEXT
);

CREATE TABLE IF NOT EXISTS daily_update_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES daily_update_users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_daily_update_sessions_user ON daily_update_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_daily_update_sessions_expiry ON daily_update_sessions(expires_at);

CREATE TABLE IF NOT EXISTS daily_updates (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'General',
  event_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('DRAFT', 'PENDING', 'PUBLISHED', 'REJECTED')),
  created_by_user_id TEXT REFERENCES daily_update_users(id) ON DELETE SET NULL,
  created_by_name TEXT NOT NULL,
  approved_by TEXT,
  approved_at TEXT,
  published_at TEXT,
  rejection_note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_daily_updates_public ON daily_updates(status, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_daily_updates_status ON daily_updates(status, updated_at DESC);

CREATE TABLE IF NOT EXISTS daily_update_photos (
  id TEXT PRIMARY KEY,
  update_id TEXT NOT NULL REFERENCES daily_updates(id) ON DELETE CASCADE,
  r2_key TEXT NOT NULL UNIQUE,
  original_name TEXT NOT NULL,
  content_type TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  caption TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_daily_update_photos_update ON daily_update_photos(update_id, display_order);

CREATE TABLE IF NOT EXISTS daily_update_audit_log (
  id TEXT PRIMARY KEY,
  actor_user_id TEXT,
  actor_name TEXT NOT NULL,
  action TEXT NOT NULL,
  update_id TEXT,
  details_json TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_daily_update_audit_created ON daily_update_audit_log(created_at DESC);

CREATE TABLE IF NOT EXISTS daily_update_login_limits (
  id TEXT PRIMARY KEY,
  attempt_key TEXT NOT NULL UNIQUE,
  failures INTEGER NOT NULL DEFAULT 0,
  window_started_at TEXT NOT NULL,
  locked_until TEXT
);
