ALTER TABLE "drop_in_bookings" ADD COLUMN "waiver_consent_variant" varchar(10);--> statement-breakpoint
ALTER TABLE "drop_in_bookings" ADD COLUMN "waiver_consent_text" text;--> statement-breakpoint
ALTER TABLE "field_rentals" ADD COLUMN "waiver_consent_variant" varchar(10);--> statement-breakpoint
ALTER TABLE "field_rentals" ADD COLUMN "waiver_consent_text" text;