-- Anonymous browser-level visitor count for the public NHYM homepage.
-- The cookie value is hashed before it is stored; no IP addresses or personal details are retained.
CREATE TABLE IF NOT EXISTS homepage_visitors (
  visitor_hash TEXT PRIMARY KEY,
  first_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
