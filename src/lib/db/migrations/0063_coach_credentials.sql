DO $$ BEGIN CREATE TYPE "public"."credential_type" AS ENUM('safesport', 'background_check', 'cpr_first_aid', 'concussion_protocol', 'coaching_license', 'other'); EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."credential_status" AS ENUM('pending', 'valid', 'expired', 'rejected'); EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE TABLE "coach_credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"organization_id" uuid,
	"credential_type" "credential_type" NOT NULL,
	"status" "credential_status" DEFAULT 'pending' NOT NULL,
	"issued_at" timestamp,
	"expires_at" timestamp,
	"document_key" text,
	"verified_by_user_id" uuid,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "coach_credentials" ADD CONSTRAINT "coach_credentials_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_credentials" ADD CONSTRAINT "coach_credentials_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_credentials" ADD CONSTRAINT "coach_credentials_verified_by_user_id_users_id_fk" FOREIGN KEY ("verified_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "coach_credentials_user_org_type_uniq" ON "coach_credentials" USING btree ("user_id","organization_id","credential_type");--> statement-breakpoint
CREATE INDEX "coach_credentials_org_idx" ON "coach_credentials" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "coach_credentials_user_idx" ON "coach_credentials" USING btree ("user_id");