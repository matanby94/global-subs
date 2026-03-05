-- 009: Add unique index on credit_transactions.reference for idempotency
-- Prevents double-grant race conditions when webhook and user-return fire simultaneously.
-- Only covers payment references (stripe_cs_, paypal_order_, paypal_capture_) — 
-- generic references like 'signup', 'DEMO_SEED', 'sandbox_test' are excluded.

CREATE UNIQUE INDEX IF NOT EXISTS idx_credit_transactions_reference_unique
  ON credit_transactions (reference)
  WHERE reference IS NOT NULL
    AND (reference LIKE 'stripe_cs_%'
      OR reference LIKE 'paypal_order_%'
      OR reference LIKE 'paypal_capture_%');
