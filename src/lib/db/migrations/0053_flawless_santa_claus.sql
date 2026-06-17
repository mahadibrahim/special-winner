CREATE TABLE "team_invitees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_registration_id" uuid NOT NULL,
	"email" varchar(320) NOT NULL,
	"assigned_share_cents" integer NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"registration_id" uuid,
	"invited_at" timestamp DEFAULT now() NOT NULL,
	"paid_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "team_registrations" ADD COLUMN "team_fee_cents" integer;--> statement-breakpoint
ALTER TABLE "team_registrations" ADD COLUMN "deposit_cents" integer DEFAULT 20000;--> statement-breakpoint
ALTER TABLE "team_registrations" ADD COLUMN "deposit_payment_id" uuid;--> statement-breakpoint
ALTER TABLE "team_registrations" ADD COLUMN "captain_stripe_customer_id" varchar(255);--> statement-breakpoint
ALTER TABLE "team_registrations" ADD COLUMN "captain_payment_method_id" varchar(255);--> statement-breakpoint
ALTER TABLE "team_registrations" ADD COLUMN "payment_deadline" timestamp;--> statement-breakpoint
ALTER TABLE "team_registrations" ADD COLUMN "backstop_status" varchar(20) DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "team_invitees" ADD CONSTRAINT "team_invitees_team_registration_id_team_registrations_id_fk" FOREIGN KEY ("team_registration_id") REFERENCES "public"."team_registrations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_invitees" ADD CONSTRAINT "team_invitees_registration_id_registrations_id_fk" FOREIGN KEY ("registration_id") REFERENCES "public"."registrations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "team_invitees_team_idx" ON "team_invitees" USING btree ("team_registration_id");--> statement-breakpoint
CREATE UNIQUE INDEX "team_invitees_team_email_uniq" ON "team_invitees" USING btree ("team_registration_id","email");