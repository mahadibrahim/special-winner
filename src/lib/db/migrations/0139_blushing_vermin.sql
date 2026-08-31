-- Hand-adjusted for re-run safety (see the INVARIANT comment in
-- scripts/db-migrate.ts): the generated DDL is wrapped so a repeat run is a
-- no-op, and the backfill UPDATEs are naturally idempotent (WHERE
-- organization_id IS NULL).
ALTER TABLE "consents" ADD COLUMN IF NOT EXISTS "organization_id" uuid;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "consents" ADD CONSTRAINT "consents_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "consents_liability_validity_idx" ON "consents" USING btree ("family_member_id","organization_id","expires_at") WHERE "consents"."type" = 'liability';--> statement-breakpoint
-- Backfill 1: the waiver that was signed carries the owning org directly.
-- waivers.organization_id IS NULL means the global default waiver, which
-- names no legal entity — those rows stay NULL rather than being guessed.
UPDATE "consents" c SET "organization_id" = w."organization_id"
FROM "waivers" w
WHERE c."waiver_id" = w."id"
  AND c."organization_id" IS NULL
  AND w."organization_id" IS NOT NULL;--> statement-breakpoint
-- Backfill 2: remaining rows tied to a registration inherit the org that owns
-- the season. seasons has no organization_id — the real path is
-- registrations -> seasons -> programs -> locations.organization_id.
UPDATE "consents" c SET "organization_id" = l."organization_id"
FROM "registrations" r
  JOIN "seasons" s ON s."id" = r."season_id"
  JOIN "programs" p ON p."id" = s."program_id"
  JOIN "locations" l ON l."id" = p."location_id"
WHERE c."registration_id" = r."id"
  AND c."organization_id" IS NULL;
