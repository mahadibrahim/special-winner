ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "welcome_series_enrolled_at" timestamp;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "marketing_opted_out_at" timestamp;
