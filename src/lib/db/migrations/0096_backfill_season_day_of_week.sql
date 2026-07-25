-- Data-only backfill. RE-RUN-SAFE (see db-migrate.ts invariant): the
-- `day_of_week IS NULL` guard makes re-execution a no-op and never overwrites a
-- day an admin already set. Sets each division's play day from its start-date
-- weekday (Postgres EXTRACT(DOW): 0 = Sunday).
UPDATE "seasons"
SET "day_of_week" = (ARRAY['sun','mon','tue','wed','thu','fri','sat'])[
      EXTRACT(DOW FROM "start_date")::int + 1]
WHERE "day_of_week" IS NULL
  AND "start_date" IS NOT NULL;
