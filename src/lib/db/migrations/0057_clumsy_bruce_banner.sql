ALTER TABLE "seasons" ADD COLUMN IF NOT EXISTS "half_day_price_cents" integer;--> statement-breakpoint
ALTER TABLE "seasons" ADD COLUMN IF NOT EXISTS "min_age" integer;--> statement-breakpoint
ALTER TABLE "seasons" ADD COLUMN IF NOT EXISTS "max_age" integer;