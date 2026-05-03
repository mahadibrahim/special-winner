CREATE TYPE "public"."consent_status" AS ENUM('granted', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."consent_type" AS ENUM('parental', 'age_confirmation', 'liability', 'media_authorization');--> statement-breakpoint
CREATE TYPE "public"."media_auth_scope" AS ENUM('internal', 'promotional', 'public');--> statement-breakpoint
CREATE TYPE "public"."waiver_type" AS ENUM('liability', 'media_authorization');--> statement-breakpoint
CREATE TABLE "consents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"family_member_id" uuid NOT NULL,
	"registration_id" uuid,
	"waiver_id" uuid,
	"type" "consent_type" NOT NULL,
	"scope" "media_auth_scope",
	"status" "consent_status" DEFAULT 'granted' NOT NULL,
	"signed_by_user_id" uuid NOT NULL,
	"signed_by_name" varchar(200) NOT NULL,
	"signed_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp,
	"ip_address" varchar(64),
	"user_agent" text,
	"content_hash" varchar(64),
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "waivers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid,
	"type" "waiver_type" NOT NULL,
	"version" integer NOT NULL,
	"content" text NOT NULL,
	"effective_at" timestamp DEFAULT now() NOT NULL,
	"superseded_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "consents" ADD CONSTRAINT "consents_family_member_id_family_members_id_fk" FOREIGN KEY ("family_member_id") REFERENCES "public"."family_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consents" ADD CONSTRAINT "consents_registration_id_registrations_id_fk" FOREIGN KEY ("registration_id") REFERENCES "public"."registrations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consents" ADD CONSTRAINT "consents_waiver_id_waivers_id_fk" FOREIGN KEY ("waiver_id") REFERENCES "public"."waivers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consents" ADD CONSTRAINT "consents_signed_by_user_id_users_id_fk" FOREIGN KEY ("signed_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waivers" ADD CONSTRAINT "waivers_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "consents_family_member_idx" ON "consents" USING btree ("family_member_id");--> statement-breakpoint
CREATE INDEX "consents_family_member_type_idx" ON "consents" USING btree ("family_member_id","type");--> statement-breakpoint
CREATE INDEX "consents_registration_idx" ON "consents" USING btree ("registration_id");--> statement-breakpoint
CREATE INDEX "consents_waiver_idx" ON "consents" USING btree ("waiver_id");--> statement-breakpoint
CREATE INDEX "consents_signed_at_idx" ON "consents" USING btree ("signed_at");--> statement-breakpoint
CREATE INDEX "consents_active_lookup_idx" ON "consents" USING btree ("family_member_id","type","scope","status","signed_at");--> statement-breakpoint
CREATE INDEX "waivers_org_type_idx" ON "waivers" USING btree ("organization_id","type");--> statement-breakpoint
CREATE UNIQUE INDEX "waivers_one_current_per_org_type" ON "waivers" USING btree ("organization_id","type") WHERE "waivers"."superseded_at" IS NULL;