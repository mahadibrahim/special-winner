-- Hand-edited for IDEMPOTENCY: prod has been db:push-drifted before (see
-- 0023/0024), and the per-file migration runner re-executes a file whose
-- tracking row is ever lost.
ALTER TABLE "phone_opt_ins" ADD COLUMN IF NOT EXISTS "confirmation_last_sent_at" timestamp;