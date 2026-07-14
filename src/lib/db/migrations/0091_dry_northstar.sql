-- Consent is per-channel. Existing rows are all SMS consents (the table was
-- built for 10DLC), so the backfill default is correct by construction.
-- Written idempotently: prod has been db:push-drifted before (see 0023/0024).
ALTER TABLE "phone_opt_ins" ADD COLUMN IF NOT EXISTS "channel" varchar(20) DEFAULT 'sms' NOT NULL;--> statement-breakpoint
DROP INDEX IF EXISTS "idx_phone_opt_ins_org_phone";--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_phone_opt_ins_org_phone_channel" ON "phone_opt_ins" USING btree ("organization_id","phone","channel");
