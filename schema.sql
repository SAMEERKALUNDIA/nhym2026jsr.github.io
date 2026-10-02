CREATE TABLE IF NOT EXISTS registrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  registration_id TEXT UNIQUE,
  email TEXT NOT NULL,
  total_amount INTEGER NOT NULL,
  payment_mode TEXT NOT NULL,
  payment_reference TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  declarations_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_reg_status ON registrations(status);
CREATE INDEX IF NOT EXISTS idx_reg_payment_ref ON registrations(payment_reference);

CREATE TABLE IF NOT EXISTS participants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  registration_id INTEGER NOT NULL REFERENCES registrations(id) ON DELETE CASCADE,
  participant_no INTEGER NOT NULL,
  name TEXT NOT NULL,
  dob TEXT, gender TEXT, address TEXT, district TEXT, state TEXT, pin TEXT, age TEXT,
  category TEXT NOT NULL, fee INTEGER NOT NULL,
  activities_json TEXT, cultural TEXT, sports TEXT, from_outside TEXT, accommodation TEXT,
  note TEXT, details_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_part_reg ON participants(registration_id);
