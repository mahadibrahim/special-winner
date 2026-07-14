-- Email marketing consent + its evidence (the email twin of phone_opt_ins).
-- Hand-edited for IDEMPOTENCY: prod has been db:push-drifted before (see
-- 0023/0024), and the per-file migration runner re-executes a file whose
-- tracking row is ever lost. Every statement here must survive a re-run.
ALTER TYPE "public"."self_service_token_kind" ADD VALUE IF NOT EXISTS 'email_consent';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "email_opt_ins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid,
	"email" varchar(255) NOT NULL,
	"status" varchar(20) NOT NULL,
	"opted_in_at" timestamp,
	"opted_out_at" timestamp,
	"opt_in_source" varchar(50),
	"consent_text_shown" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "email_opt_ins" ADD CONSTRAINT "email_opt_ins_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "email_opt_ins" ADD CONSTRAINT "email_opt_ins_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_email_opt_ins_org_email" ON "email_opt_ins" USING btree ("organization_id","email");
