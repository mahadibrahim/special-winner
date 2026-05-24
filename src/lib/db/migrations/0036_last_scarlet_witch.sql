-- Stripe dispute tracking on payments table.
-- Backing store for the charge.dispute.* webhook handler. Additive,
-- idempotent — see the 0023/0024 pattern for why every touch of types
-- and columns wraps DO blocks / IF NOT EXISTS.

DO $$ BEGIN
  CREATE TYPE "public"."dispute_status" AS ENUM(
    'warning_needs_response',
    'warning_under_review',
    'warning_closed',
    'needs_response',
    'under_review',
    'won',
    'lost'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint

ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "stripe_dispute_id" varchar(255);
--> statement-breakpoint

ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "dispute_status" "dispute_status";
--> statement-breakpoint

ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "dispute_reason_code" varchar(64);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "payments_stripe_dispute_uniq"
  ON "payments" USING btree ("stripe_dispute_id")
  WHERE stripe_dispute_id IS NOT NULL;
