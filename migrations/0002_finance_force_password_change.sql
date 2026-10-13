-- Require Finance users to replace administrator-issued temporary passwords at next sign-in.
-- Apply this migration to the intended D1 database before deploying Worker code that uses the new column.
ALTER TABLE finance_users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0 CHECK (must_change_password IN (0,1));
