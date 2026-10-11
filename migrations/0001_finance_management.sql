-- NHYM 2026 Finance Management System
-- Apply to a test database first, then production after review.
CREATE TABLE IF NOT EXISTS finance_users (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  login_id TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('FINANCE_HEAD','OPERATOR','APPROVER','AUDITOR')),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS finance_categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  category_type TEXT NOT NULL CHECK (category_type IN ('EXPENSE','INCOME')),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1))
);

CREATE TABLE IF NOT EXISTS finance_budgets (
  id TEXT PRIMARY KEY,
  category_id TEXT NOT NULL,
  budget_period TEXT NOT NULL DEFAULT 'NHYM2026',
  approved_amount_paise INTEGER NOT NULL CHECK (approved_amount_paise >= 0),
  revision_no INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','APPROVED','CLOSED')),
  created_by TEXT NOT NULL,
  approved_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (category_id) REFERENCES finance_categories(id),
  FOREIGN KEY (created_by) REFERENCES finance_users(id),
  FOREIGN KEY (approved_by) REFERENCES finance_users(id)
);

CREATE TABLE IF NOT EXISTS finance_expenses (
  id TEXT PRIMARY KEY,
  expense_no TEXT NOT NULL UNIQUE,
  category_id TEXT NOT NULL,
  budget_id TEXT,
  vendor_name TEXT NOT NULL,
  description TEXT NOT NULL,
  requested_amount_paise INTEGER NOT NULL CHECK (requested_amount_paise > 0),
  approved_amount_paise INTEGER CHECK (approved_amount_paise IS NULL OR approved_amount_paise >= 0),
  final_amount_paise INTEGER CHECK (final_amount_paise IS NULL OR final_amount_paise >= 0),
  expense_date TEXT NOT NULL,
  approval_status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (approval_status IN ('DRAFT','PENDING','APPROVED','REJECTED','CANCELLED')),
  payment_status TEXT NOT NULL DEFAULT 'UNPAID' CHECK (payment_status IN ('UNPAID','PARTIAL','PAID','REVERSED')),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (category_id) REFERENCES finance_categories(id),
  FOREIGN KEY (budget_id) REFERENCES finance_budgets(id),
  FOREIGN KEY (created_by) REFERENCES finance_users(id)
);

CREATE TABLE IF NOT EXISTS finance_approvals (
  id TEXT PRIMARY KEY,
  expense_id TEXT NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('APPROVED','REJECTED','RETURNED')),
  approved_amount_paise INTEGER,
  remarks TEXT,
  decided_by TEXT NOT NULL,
  decided_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (expense_id) REFERENCES finance_expenses(id),
  FOREIGN KEY (decided_by) REFERENCES finance_users(id)
);

CREATE TABLE IF NOT EXISTS finance_payments (
  id TEXT PRIMARY KEY,
  expense_id TEXT NOT NULL,
  payment_no TEXT NOT NULL UNIQUE,
  payment_mode TEXT NOT NULL CHECK (payment_mode IN ('UPI','BANK_TRANSFER','CASH')),
  amount_paise INTEGER NOT NULL CHECK (amount_paise > 0),
  paid_at TEXT NOT NULL,
  reference_no TEXT,
  paid_by TEXT NOT NULL,
  reconciliation_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (reconciliation_status IN ('PENDING','MATCHED','DISCREPANCY')),
  remarks TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (expense_id) REFERENCES finance_expenses(id),
  FOREIGN KEY (paid_by) REFERENCES finance_users(id)
);

CREATE TABLE IF NOT EXISTS finance_income (
  id TEXT PRIMARY KEY,
  income_no TEXT NOT NULL UNIQUE,
  income_type TEXT NOT NULL,
  received_from TEXT NOT NULL,
  amount_paise INTEGER NOT NULL CHECK (amount_paise > 0),
  received_at TEXT NOT NULL,
  payment_mode TEXT NOT NULL CHECK (payment_mode IN ('UPI','BANK_TRANSFER','CASH')),
  reference_no TEXT,
  receipt_no TEXT UNIQUE,
  remarks TEXT,
  recorded_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (recorded_by) REFERENCES finance_users(id)
);

CREATE TABLE IF NOT EXISTS finance_documents (
  id TEXT PRIMARY KEY,
  expense_id TEXT,
  income_id TEXT,
  document_type TEXT NOT NULL CHECK (document_type IN ('BILL','RECEIPT','PAYMENT_PROOF','APPROVAL','VOUCHER','OTHER')),
  storage_key TEXT,
  file_name TEXT NOT NULL,
  mime_type TEXT,
  size_bytes INTEGER,
  paper_reference TEXT,
  uploaded_by TEXT NOT NULL,
  uploaded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (expense_id) REFERENCES finance_expenses(id),
  FOREIGN KEY (income_id) REFERENCES finance_income(id),
  FOREIGN KEY (uploaded_by) REFERENCES finance_users(id),
  CHECK (expense_id IS NOT NULL OR income_id IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS finance_audit_logs (
  id TEXT PRIMARY KEY,
  actor_user_id TEXT,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL,
  old_values_json TEXT,
  new_values_json TEXT,
  reason TEXT,
  request_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (actor_user_id) REFERENCES finance_users(id)
);

CREATE INDEX IF NOT EXISTS idx_finance_expenses_status ON finance_expenses(approval_status, payment_status);
CREATE INDEX IF NOT EXISTS idx_finance_expenses_date ON finance_expenses(expense_date);
CREATE INDEX IF NOT EXISTS idx_finance_payments_expense ON finance_payments(expense_id, paid_at);
CREATE INDEX IF NOT EXISTS idx_finance_income_date ON finance_income(received_at);
CREATE INDEX IF NOT EXISTS idx_finance_audit_entity ON finance_audit_logs(entity_type, entity_id, created_at);

INSERT OR IGNORE INTO finance_categories (id, name, category_type) VALUES
('exp-food','Food & Catering','EXPENSE'),
('exp-accommodation','Accommodation','EXPENSE'),
('exp-transport','Transport','EXPENSE'),
('exp-venue','Venue & Infrastructure','EXPENSE'),
('exp-stage','Stage, Sound & Lighting','EXPENSE'),
('exp-printing','Printing & Stationery','EXPENSE'),
('exp-cultural','Cultural Programme','EXPENSE'),
('exp-medical','Medical & Safety','EXPENSE'),
('exp-other','Other Expenses','EXPENSE'),
('inc-registration','Registration Collection','INCOME'),
('inc-donation','Donation','INCOME'),
('inc-sponsorship','Sponsorship','INCOME'),
('inc-contribution','Committee Contribution','INCOME'),
('inc-other','Other Income','INCOME');

CREATE UNIQUE INDEX IF NOT EXISTS uq_finance_payment_reference_normalized
ON finance_payments(UPPER(REPLACE(REPLACE(REPLACE(TRIM(reference_no), ' ', ''), char(9), ''), char(10), '')))
WHERE reference_no IS NOT NULL AND TRIM(reference_no) <> '';

INSERT OR IGNORE INTO finance_users (id, display_name, login_id, role, is_active)
VALUES ('finance-system-admin', 'Finance System Admin', 'shared-admin', 'FINANCE_HEAD', 1);
