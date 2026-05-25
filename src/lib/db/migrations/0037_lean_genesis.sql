-- Per-location scope on announcements (backlog #28).
-- NULL = org-wide (super-admin only); non-null = scoped to that location
-- (venue manager surface). Additive + idempotent — see 0023/0024/0036
-- pattern for why every column/constraint touch is guarded.

ALTER TABLE "announcements" ADD COLUMN IF NOT EXISTS "location_id" uuid;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "announcements" ADD CONSTRAINT "announcements_location_id_locations_id_fk"
    FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
