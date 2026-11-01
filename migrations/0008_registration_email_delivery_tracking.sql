-- Registration email delivery timestamps used by Admin status updates and Participant Portal.
-- Additive and safe for existing registrations; no participant data is changed.
ALTER TABLE registrations ADD COLUMN approval_email_sent_at TEXT;
ALTER TABLE registrations ADD COLUMN rejection_email_sent_at TEXT;
