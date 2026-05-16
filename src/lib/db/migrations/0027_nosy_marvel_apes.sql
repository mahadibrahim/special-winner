ALTER TABLE "registrations" ADD COLUMN "refund_requested_at" timestamp;--> statement-breakpoint
ALTER TABLE "registrations" ADD COLUMN "refund_request_reason" text;--> statement-breakpoint
ALTER TABLE "registrations" ADD COLUMN "refund_requested_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_refund_requested_by_user_id_users_id_fk" FOREIGN KEY ("refund_requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;