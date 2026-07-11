-- Idempotent (0023/0024/0059/0073/0075/0076/0077/0078/0079/0080/0081 convention).
-- Coach session lifecycle: session_captures is the field-mode quick-capture
-- inbox (glows/observations) that feeds the wrap-up flow. session_plans
-- gets started_at (stamped when field mode begins) and attendance gets
-- session_plan_id (lineage from a field-mode check-off to its practice
-- session).
DO $$ BEGIN
  CREATE TYPE "public"."capture_kind" AS ENUM('glow', 'observation');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "session_captures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_plan_id" uuid NOT NULL,
	"roster_id" uuid NOT NULL,
	"kind" "capture_kind" NOT NULL,
	"skill_id" uuid,
	"note" text,
	"client_id" text NOT NULL,
	"consumed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "attendance" ADD COLUMN IF NOT EXISTS "session_plan_id" uuid;--> statement-breakpoint
ALTER TABLE "session_plans" ADD COLUMN IF NOT EXISTS "started_at" timestamp;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "session_captures" ADD CONSTRAINT "session_captures_session_plan_id_session_plans_id_fk" FOREIGN KEY ("session_plan_id") REFERENCES "public"."session_plans"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "session_captures" ADD CONSTRAINT "session_captures_roster_id_rosters_id_fk" FOREIGN KEY ("roster_id") REFERENCES "public"."rosters"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "session_captures" ADD CONSTRAINT "session_captures_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "session_captures_session_client_uniq" ON "session_captures" USING btree ("session_plan_id","client_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "session_captures_session_idx" ON "session_captures" USING btree ("session_plan_id");--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "attendance" ADD CONSTRAINT "attendance_session_plan_id_session_plans_id_fk" FOREIGN KEY ("session_plan_id") REFERENCES "public"."session_plans"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
