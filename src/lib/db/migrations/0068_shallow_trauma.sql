ALTER TYPE "public"."refund_status" ADD VALUE IF NOT EXISTS 'credited';--> statement-breakpoint
CREATE TABLE "account_credit_redemptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_credit_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"registration_id" uuid,
	"amount_cents" integer NOT NULL,
	"redeemed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "account_credits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" varchar(3) DEFAULT 'usd' NOT NULL,
	"reason" text,
	"source_registration_id" uuid,
	"issued_by_user_id" uuid,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account_credit_redemptions" ADD CONSTRAINT "account_credit_redemptions_account_credit_id_account_credits_id_fk" FOREIGN KEY ("account_credit_id") REFERENCES "public"."account_credits"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_credit_redemptions" ADD CONSTRAINT "account_credit_redemptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_credit_redemptions" ADD CONSTRAINT "account_credit_redemptions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_credit_redemptions" ADD CONSTRAINT "account_credit_redemptions_registration_id_registrations_id_fk" FOREIGN KEY ("registration_id") REFERENCES "public"."registrations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_credits" ADD CONSTRAINT "account_credits_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_credits" ADD CONSTRAINT "account_credits_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_credits" ADD CONSTRAINT "account_credits_source_registration_id_registrations_id_fk" FOREIGN KEY ("source_registration_id") REFERENCES "public"."registrations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_credits" ADD CONSTRAINT "account_credits_issued_by_user_id_users_id_fk" FOREIGN KEY ("issued_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_credit_redemptions_credit_idx" ON "account_credit_redemptions" USING btree ("account_credit_id");--> statement-breakpoint
CREATE INDEX "account_credit_redemptions_org_user_idx" ON "account_credit_redemptions" USING btree ("organization_id","user_id");--> statement-breakpoint
CREATE INDEX "account_credit_redemptions_registration_idx" ON "account_credit_redemptions" USING btree ("registration_id");--> statement-breakpoint
CREATE INDEX "account_credits_org_user_idx" ON "account_credits" USING btree ("organization_id","user_id");--> statement-breakpoint
CREATE INDEX "account_credits_source_registration_idx" ON "account_credits" USING btree ("source_registration_id");