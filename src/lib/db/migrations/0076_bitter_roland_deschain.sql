-- Idempotent (0023/0024/0059/0073/0075 convention): tolerate a drifted DB
-- that already carries the column / constraint / index.
ALTER TABLE "coach_notes" ADD COLUMN IF NOT EXISTS "session_plan_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "coach_notes" ADD CONSTRAINT "coach_notes_session_plan_id_session_plans_id_fk" FOREIGN KEY ("session_plan_id") REFERENCES "public"."session_plans"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "coach_notes_session_plan_idx" ON "coach_notes" USING btree ("session_plan_id");
