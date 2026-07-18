ALTER TYPE "public"."field_rental_status" ADD VALUE IF NOT EXISTS 'requested' BEFORE 'pending_payment';--> statement-breakpoint
DROP INDEX "field_rentals_active_field_idx";--> statement-breakpoint
ALTER TABLE "field_rental_rate_card" ADD COLUMN "request_hold_hours" integer DEFAULT 24 NOT NULL;--> statement-breakpoint
ALTER TABLE "field_rental_rate_card" ADD COLUMN "min_lead_time_hours" integer DEFAULT 48 NOT NULL;--> statement-breakpoint
ALTER TABLE "field_rentals" ADD COLUMN "request_expires_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "field_rentals_active_field_idx" ON "field_rentals" USING btree ("venue_id","field_number","starts_at") WHERE status IN ('requested', 'pending_payment', 'confirmed');