-- 0082: Backfill org membership for organic customers. Data-only migration.
-- user_organization_access is the source of truth for "customer of this org"
-- (admin directory + role-assignment gate), but self-signed-up customers never
-- got a row — only invite/hire/walk-up flows wrote one. Derive membership from
-- historical transactions. Idempotent: NOT EXISTS guards re-runs.

-- Season registrations: registrant -> season -> program -> location -> org
INSERT INTO "user_organization_access" ("user_id", "organization_id", "role", "accepted_at")
SELECT DISTINCT r."registered_by_user_id", l."organization_id", 'parent'::"org_access_role", now()
FROM "registrations" r
JOIN "seasons" s ON s."id" = r."season_id"
JOIN "programs" p ON p."id" = s."program_id"
JOIN "locations" l ON l."id" = p."location_id"
WHERE r."registered_by_user_id" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "user_organization_access" uoa
    WHERE uoa."user_id" = r."registered_by_user_id"
      AND uoa."organization_id" = l."organization_id"
  );
--> statement-breakpoint
-- Drop-in bookings: booker -> session -> org
INSERT INTO "user_organization_access" ("user_id", "organization_id", "role", "accepted_at")
SELECT DISTINCT b."user_id", ds."organization_id", 'parent'::"org_access_role", now()
FROM "drop_in_bookings" b
JOIN "drop_in_sessions" ds ON ds."id" = b."session_id"
WHERE b."user_id" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "user_organization_access" uoa
    WHERE uoa."user_id" = b."user_id"
      AND uoa."organization_id" = ds."organization_id"
  );
