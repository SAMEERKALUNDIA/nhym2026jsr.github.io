CREATE TABLE IF NOT EXISTS public_feedback (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  city TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL CHECK (category IN ('Support', 'Opposition', 'Suggestion', 'Other')),
  message TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_public_feedback_created ON public_feedback(created_at DESC);

-- Store a hash of the requester IP only for short-window abuse prevention; never store raw IPs.
CREATE TABLE IF NOT EXISTS public_feedback_rate_limits (
  ip_hash TEXT PRIMARY KEY,
  window_started_at TEXT NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0
);
