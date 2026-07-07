CREATE TYPE "public"."concussion_clearance_status" AS ENUM('pending', 'received');--> statement-breakpoint
CREATE TYPE "public"."incident_status" AS ENUM('open', 'closed');--> statement-breakpoint
CREATE TYPE "public"."incident_subject_type" AS ENUM('participant', 'bystander', 'staff', 'other');--> statement-breakpoint
CREATE TYPE "public"."incident_type" AS ENUM('injury', 'altercation', 'medical_event', 'property_damage', 'other');--> statement-breakpoint
CREATE TABLE "incidents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"venue_id" uuid NOT NULL,
	"game_id" uuid,
	"reported_by_user_id" uuid NOT NULL,
	"subject_type" "incident_subject_type" NOT NULL,
	"subject_family_member_id" uuid,
	"subject_free_text_name" varchar(200),
	"incident_type" "incident_type" NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"people_involved" text NOT NULL,
	"first_responder_name" varchar(200) NOT NULL,
	"immediate_care_given" text NOT NULL,
	"emergency_services_called" boolean DEFAULT false NOT NULL,
	"emergency_services_call_time" timestamp with time zone,
	"suspected_concussion" boolean DEFAULT false NOT NULL,
	"removed_from_play" boolean,
	"parent_notified_onsite" boolean DEFAULT false NOT NULL,
	"concussion_clearance_status" "concussion_clearance_status",
	"insurance_relevant" boolean,
	"director_consulted" boolean,
	"status" "incident_status" DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "incidents_subject_shape" CHECK (("incidents"."subject_type" = 'participant' AND "incidents"."subject_family_member_id" IS NOT NULL) OR ("incidents"."subject_type" <> 'participant' AND "incidents"."subject_free_text_name" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_reported_by_user_id_users_id_fk" FOREIGN KEY ("reported_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_subject_family_member_id_family_members_id_fk" FOREIGN KEY ("subject_family_member_id") REFERENCES "public"."family_members"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "incidents_org_created_idx" ON "incidents" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "incidents_venue_idx" ON "incidents" USING btree ("venue_id");--> statement-breakpoint
CREATE INDEX "incidents_game_idx" ON "incidents" USING btree ("game_id");--> statement-breakpoint
CREATE INDEX "incidents_subject_family_member_idx" ON "incidents" USING btree ("subject_family_member_id");