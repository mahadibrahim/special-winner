-- Written idempotently per the 0023/0024 convention: prod has been `db:push`-ed
-- in the past, so a migration must tolerate an object that already exists.
CREATE TABLE IF NOT EXISTS "spectator_waivers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"user_id" uuid,
	"first_name" varchar(100) NOT NULL,
	"last_name" varchar(100) NOT NULL,
	"phone" varchar(20) NOT NULL,
	"email" varchar(255),
	"is_minor" boolean DEFAULT false NOT NULL,
	"guardian_name" varchar(200),
	"signed_name" varchar(200) NOT NULL,
	"waiver_text_shown" text NOT NULL,
	"signed_at" timestamp DEFAULT now() NOT NULL,
	"valid_until" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "spectator_waivers" ADD CONSTRAINT "spectator_waivers_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "spectator_waivers" ADD CONSTRAINT "spectator_waivers_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "spectator_waivers" ADD CONSTRAINT "spectator_waivers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_spectator_waivers_org_phone" ON "spectator_waivers" USING btree ("organization_id","phone");
