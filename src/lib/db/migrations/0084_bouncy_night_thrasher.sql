ALTER TYPE "public"."drop_in_booking_status" ADD VALUE IF NOT EXISTS 'pending_payment' BEFORE 'cancelled';--> statement-breakpoint
ALTER TYPE "public"."drop_in_cancellation_reason" ADD VALUE IF NOT EXISTS 'expired_payment_hold';--> statement-breakpoint
ALTER TABLE "drop_in_bookings" ADD COLUMN IF NOT EXISTS "reminder_sent_at" timestamp with time zone;
