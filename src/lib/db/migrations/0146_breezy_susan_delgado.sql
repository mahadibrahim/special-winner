CREATE TYPE "public"."coaching_assignment_kind" AS ENUM('team', 'class_template', 'class_session');--> statement-breakpoint
CREATE TYPE "public"."coaching_role" AS ENUM('lead', 'assistant');--> statement-breakpoint
CREATE TABLE "coaching_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"coach_user_id" uuid NOT NULL,
	"role" "coaching_role" DEFAULT 'lead' NOT NULL,
	"kind" "coaching_assignment_kind" NOT NULL,
	"target_id" uuid NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "coaching_assignments_coach_kind_target" UNIQUE("coach_user_id","kind","target_id")
);
--> statement-breakpoint
ALTER TABLE "coach_notes" ALTER COLUMN "team_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "coach_notes" ADD COLUMN "activity_kind" varchar(32);--> statement-breakpoint
ALTER TABLE "coach_notes" ADD COLUMN "activity_id" uuid;--> statement-breakpoint
ALTER TABLE "coaching_assignments" ADD CONSTRAINT "coaching_assignments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coaching_assignments" ADD CONSTRAINT "coaching_assignments_coach_user_id_users_id_fk" FOREIGN KEY ("coach_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coaching_assignments" ADD CONSTRAINT "coaching_assignments_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "coaching_assignments_kind_target_idx" ON "coaching_assignments" USING btree ("kind","target_id");--> statement-breakpoint
CREATE INDEX "coaching_assignments_coach_idx" ON "coaching_assignments" USING btree ("coach_user_id");--> statement-breakpoint
CREATE INDEX "coach_notes_activity_idx" ON "coach_notes" USING btree ("activity_kind","activity_id");--> statement-breakpoint
ALTER TABLE "coach_notes" ADD CONSTRAINT "coach_notes_anchor_check" CHECK (("coach_notes"."team_id" IS NOT NULL AND "coach_notes"."activity_kind" IS NULL AND "coach_notes"."activity_id" IS NULL) OR ("coach_notes"."team_id" IS NULL AND "coach_notes"."activity_kind" IS NOT NULL AND "coach_notes"."activity_id" IS NOT NULL));