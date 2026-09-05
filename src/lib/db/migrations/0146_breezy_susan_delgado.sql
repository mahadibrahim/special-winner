-- Made idempotent by hand (2026-09-05, ship-gate fix): staging's journal was
-- rebuilt without this migration's tracking row even though its objects
-- were already applied (the documented 0024-incident drift class — see
-- CLAUDE.md's idempotent-migration rule). Every statement below is guarded
-- so a re-run against a DB that already has some/all of these objects is a
-- no-op instead of erroring. Semantically identical to the originally
-- generated statements otherwise.
DO $$ BEGIN CREATE TYPE "public"."coaching_assignment_kind" AS ENUM('team', 'class_template', 'class_session'); EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."coaching_role" AS ENUM('lead', 'assistant'); EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "coaching_assignments" (
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
ALTER TABLE "coach_notes" ADD COLUMN IF NOT EXISTS "activity_kind" varchar(32);--> statement-breakpoint
ALTER TABLE "coach_notes" ADD COLUMN IF NOT EXISTS "activity_id" uuid;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "coaching_assignments" ADD CONSTRAINT "coaching_assignments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "coaching_assignments" ADD CONSTRAINT "coaching_assignments_coach_user_id_users_id_fk" FOREIGN KEY ("coach_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "coaching_assignments" ADD CONSTRAINT "coaching_assignments_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action; EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "coaching_assignments_kind_target_idx" ON "coaching_assignments" USING btree ("kind","target_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "coaching_assignments_coach_idx" ON "coaching_assignments" USING btree ("coach_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "coach_notes_activity_idx" ON "coach_notes" USING btree ("activity_kind","activity_id");--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "coach_notes" ADD CONSTRAINT "coach_notes_anchor_check" CHECK (("coach_notes"."team_id" IS NOT NULL AND "coach_notes"."activity_kind" IS NULL AND "coach_notes"."activity_id" IS NULL) OR ("coach_notes"."team_id" IS NULL AND "coach_notes"."activity_kind" IS NOT NULL AND "coach_notes"."activity_id" IS NOT NULL)); EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;
