ALTER TABLE "users" ADD COLUMN "email_canonical" varchar(255);--> statement-breakpoint

-- Backfill: best-effort lowercase. Gmail rows get the full dot-trick
-- normalization re-applied on next signin via the app layer; this just
-- keeps the column populated so existing users can sign in without a
-- backfill race when the UNIQUE constraint takes effect.
UPDATE "users" SET "email_canonical" = lower("email") WHERE "email_canonical" IS NULL;--> statement-breakpoint

ALTER TABLE "users" ADD CONSTRAINT "users_email_canonical_unique" UNIQUE("email_canonical");