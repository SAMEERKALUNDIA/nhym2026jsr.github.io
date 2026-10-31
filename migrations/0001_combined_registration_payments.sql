-- Combined registration payments. Additive migration; safe for existing registrations.
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
