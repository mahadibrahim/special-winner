ALTER TABLE "class_slot_templates" ADD COLUMN IF NOT EXISTS "is_technical" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "family_members" ADD COLUMN IF NOT EXISTS "kit_size" text;--> statement-breakpoint
ALTER TABLE "membership_tiers" ADD COLUMN IF NOT EXISTS "technical_monthly_cents" integer;--> statement-breakpoint
ALTER TABLE "membership_tiers" ADD COLUMN IF NOT EXISTS "stripe_price_id_technical" text;