-- Camp day-sessions (Phase 4 Task 1): the columns/index/FK that consume the
-- enum values added in 0148. Split out of the same drizzle-kit generate run
-- so the enum ADD VALUE statements could live alone (see 0148's header).
--
-- Written idempotent from the start per CLAUDE.md's rule (0146 staging-
-- journal-rebuild incident) — every statement below is guarded so a re-run
-- against a DB that already has some/all of these objects is a no-op
-- instead of erroring.
ALTER TABLE "drop_in_sessions" ADD COLUMN IF NOT EXISTS "camp_season_id" uuid;--> statement-breakpoint
ALTER TABLE "seasons" ADD COLUMN IF NOT EXISTS "formation_strategy" varchar(16);--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "drop_in_sessions" ADD CONSTRAINT "drop_in_sessions_camp_season_id_seasons_id_fk" FOREIGN KEY ("camp_season_id") REFERENCES "public"."seasons"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "drop_in_sessions_one_per_camp_day" ON "drop_in_sessions" USING btree ("camp_season_id","starts_at") WHERE camp_season_id IS NOT NULL;
