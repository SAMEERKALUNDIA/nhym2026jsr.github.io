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
-- Prevent reuse of a non-empty transaction reference regardless of spaces or letter case.
-- Rejected registrations have payment_reference cleared, so the participant may resubmit.
CREATE UNIQUE INDEX IF NOT EXISTS uq_reg_payment_reference_normalized
ON registrations(UPPER(REPLACE(REPLACE(REPLACE(TRIM(payment_reference), ' ', ''), char(9), ''), char(10), '')))
WHERE TRIM(payment_reference) <> '';

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


-- Additive payment ledger for registrations that contain multiple people and/or
-- multiple real-world transactions. Existing registrations remain readable through
-- the legacy payment_mode/payment_reference columns.
CREATE TABLE IF NOT EXISTS registration_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  registration_id INTEGER NOT NULL REFERENCES registrations(id) ON DELETE CASCADE,
  payment_no INTEGER NOT NULL,
  payment_mode TEXT NOT NULL,
  payment_reference TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK (amount > 0),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'VERIFIED', 'REJECTED')),
  created_at TEXT NOT NULL,
  updated_at TEXT,
  UNIQUE(registration_id, payment_no)
);
CREATE INDEX IF NOT EXISTS idx_registration_payments_registration
  ON registration_payments(registration_id);
CREATE INDEX IF NOT EXISTS idx_registration_payments_status
  ON registration_payments(status);
CREATE UNIQUE INDEX IF NOT EXISTS uq_registration_payment_reference_normalized
  ON registration_payments(UPPER(REPLACE(REPLACE(REPLACE(TRIM(payment_reference), ' ', ''), char(9), ''), char(10), '')))
  WHERE TRIM(payment_reference) <> '';

CREATE TABLE IF NOT EXISTS registration_payment_allocations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  payment_id INTEGER NOT NULL REFERENCES registration_payments(id) ON DELETE CASCADE,
  participant_id INTEGER NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL CHECK (amount > 0),
  UNIQUE(payment_id, participant_id),
  UNIQUE(participant_id)
);
CREATE INDEX IF NOT EXISTS idx_payment_allocations_participant
  ON registration_payment_allocations(participant_id);
