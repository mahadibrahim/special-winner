DO $$ BEGIN CREATE TYPE "public"."ops_ping_channel" AS ENUM('whatsapp', 'email', 'suppressed'); EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."ops_ping_kind" AS ENUM('registration_paid', 'dropin_booked', 'rental_confirmed', 'membership_started', 'payment_succeeded', 'user_signup', 'test'); EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ops_pings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"kind" "ops_ping_kind" NOT NULL,
	"event_id" varchar(255) NOT NULL,
	"brand" varchar(20) DEFAULT 'aspire' NOT NULL,
	"message" text NOT NULL,
	"channel" "ops_ping_channel" DEFAULT 'suppressed' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ops_pings" ADD CONSTRAINT "ops_pings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ops_pings_kind_event_uniq" ON "ops_pings" USING btree ("kind","event_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ops_pings_org_created_idx" ON "ops_pings" USING btree ("organization_id","created_at");
