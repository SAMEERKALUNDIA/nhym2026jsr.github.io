-- Add the shared Gallery photo metadata table when the isolated Finance/Daily Updates Preview
-- database does not yet contain the main application's Gallery schema. Safe on production because
-- the existing gallery_photos table is preserved by IF NOT EXISTS.
CREATE TABLE IF NOT EXISTS gallery_photos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  r2_key TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  caption TEXT,
  category TEXT NOT NULL DEFAULT 'NHYM Events',
  content_type TEXT NOT NULL,
  file_size INTEGER,
  is_published INTEGER NOT NULL DEFAULT 1,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_gallery_photos_published
ON gallery_photos(is_published, display_order, created_at);
