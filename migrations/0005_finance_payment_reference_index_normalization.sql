-- Reconcile the normalized payment-reference unique index across older Preview databases.
-- The temporary v2 index keeps uniqueness enforced while the canonical index is rebuilt.
-- If normalized duplicates exist, creation fails safely before the existing index is dropped.
CREATE UNIQUE INDEX IF NOT EXISTS uq_finance_payment_reference_normalized_v2
ON finance_payments(
  UPPER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(TRIM(reference_no), char(13), ''), char(12), ''), char(11), ''), char(10), ''), char(9), ''), char(160), ''), char(65279), ''), char(8232), ''), char(8233), ''), ' ', ''))
)
WHERE reference_no IS NOT NULL AND TRIM(reference_no) <> '';

DROP INDEX IF EXISTS uq_finance_payment_reference_normalized;

CREATE UNIQUE INDEX uq_finance_payment_reference_normalized
ON finance_payments(
  UPPER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(TRIM(reference_no), char(13), ''), char(12), ''), char(11), ''), char(10), ''), char(9), ''), char(160), ''), char(65279), ''), char(8232), ''), char(8233), ''), ' ', ''))
)
WHERE reference_no IS NOT NULL AND TRIM(reference_no) <> '';

DROP INDEX IF EXISTS uq_finance_payment_reference_normalized_v2;
