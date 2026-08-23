CREATE TYPE "public"."class_enrollment_status" AS ENUM('active', 'ended');--> statement-breakpoint
CREATE TABLE "class_enrollments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slot_template_id" uuid NOT NULL,
	"family_member_id" uuid NOT NULL,
	"membership_id" uuid NOT NULL,
	"status" "class_enrollment_status" DEFAULT 'active' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "class_slot_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"venue_id" uuid NOT NULL,
	"name" text NOT NULL,
	"sport_label" text DEFAULT 'Soccer' NOT NULL,
	"min_age" integer,
	"max_age" integer,
	"weekday" integer NOT NULL,
	"start_time" time NOT NULL,
	"duration_mins" integer DEFAULT 55 NOT NULL,
	"capacity" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "drop_in_sessions" ADD COLUMN "class_slot_template_id" uuid;--> statement-breakpoint
ALTER TABLE "class_enrollments" ADD CONSTRAINT "class_enrollments_slot_template_id_class_slot_templates_id_fk" FOREIGN KEY ("slot_template_id") REFERENCES "public"."class_slot_templates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_enrollments" ADD CONSTRAINT "class_enrollments_family_member_id_family_members_id_fk" FOREIGN KEY ("family_member_id") REFERENCES "public"."family_members"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_enrollments" ADD CONSTRAINT "class_enrollments_membership_id_memberships_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."memberships"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_slot_templates" ADD CONSTRAINT "class_slot_templates_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_slot_templates" ADD CONSTRAINT "class_slot_templates_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "class_enrollments_one_active_per_child_template" ON "class_enrollments" USING btree ("slot_template_id","family_member_id") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "class_enrollments_child_idx" ON "class_enrollments" USING btree ("family_member_id","status");--> statement-breakpoint
CREATE INDEX "class_enrollments_template_status_idx" ON "class_enrollments" USING btree ("slot_template_id","status");--> statement-breakpoint
CREATE INDEX "class_slot_templates_org_active_idx" ON "class_slot_templates" USING btree ("organization_id","active");--> statement-breakpoint
ALTER TABLE "drop_in_sessions" ADD CONSTRAINT "drop_in_sessions_class_slot_template_id_class_slot_templates_id_fk" FOREIGN KEY ("class_slot_template_id") REFERENCES "public"."class_slot_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "drop_in_sessions_one_per_template_start" ON "drop_in_sessions" USING btree ("class_slot_template_id","starts_at") WHERE class_slot_template_id IS NOT NULL;