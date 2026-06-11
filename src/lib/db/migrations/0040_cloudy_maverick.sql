CREATE TYPE "public"."block_source" AS ENUM('game', 'drop_in', 'rental', 'external', 'maintenance', 'practice');--> statement-breakpoint
CREATE TABLE "resource_blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"resource_id" uuid NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"source_type" "block_source" NOT NULL,
	"source_id" uuid,
	"label" varchar(200) NOT NULL,
	"notes" text,
	"expires_at" timestamp with time zone,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "resource_blocks_valid_range" CHECK ("resource_blocks"."ends_at" > "resource_blocks"."starts_at")
);
--> statement-breakpoint
CREATE TABLE "venue_resources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"venue_id" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"field_number" integer NOT NULL,
	"parent_resource_id" uuid,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "resource_blocks" ADD CONSTRAINT "resource_blocks_resource_id_venue_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."venue_resources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_blocks" ADD CONSTRAINT "resource_blocks_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venue_resources" ADD CONSTRAINT "venue_resources_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venue_resources" ADD CONSTRAINT "venue_resources_parent_resource_id_venue_resources_id_fk" FOREIGN KEY ("parent_resource_id") REFERENCES "public"."venue_resources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "resource_blocks_resource_starts_idx" ON "resource_blocks" USING btree ("resource_id","starts_at");--> statement-breakpoint
CREATE INDEX "resource_blocks_starts_idx" ON "resource_blocks" USING btree ("starts_at");--> statement-breakpoint
CREATE UNIQUE INDEX "resource_blocks_source_uniq" ON "resource_blocks" USING btree ("source_type","source_id") WHERE "resource_blocks"."source_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "venue_resources_venue_field_uniq" ON "venue_resources" USING btree ("venue_id","field_number") WHERE "venue_resources"."parent_resource_id" IS NULL;--> statement-breakpoint
CREATE INDEX "venue_resources_venue_idx" ON "venue_resources" USING btree ("venue_id");--> statement-breakpoint
-- bookable_resource_id was a soft (FK-less) column; clear any value that
-- doesn't resolve before attaching the constraint.
UPDATE "drop_in_sessions" SET "bookable_resource_id" = NULL
WHERE "bookable_resource_id" IS NOT NULL
  AND "bookable_resource_id" NOT IN (SELECT "id" FROM "venue_resources");--> statement-breakpoint
ALTER TABLE "drop_in_sessions" ADD CONSTRAINT "drop_in_sessions_bookable_resource_id_venue_resources_id_fk" FOREIGN KEY ("bookable_resource_id") REFERENCES "public"."venue_resources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- ============================================================
-- Hand-written portion (drizzle cannot express EXCLUDE or backfill).
-- Idempotent per the 0023/0024 convention.
-- ============================================================
CREATE EXTENSION IF NOT EXISTS btree_gist;--> statement-breakpoint
-- DB-level double-booking protection: no two blocks may overlap on the
-- same resource. Family (parent/child) conflicts are enforced by the
-- scheduling library under an advisory lock.
DO $$ BEGIN
 ALTER TABLE "resource_blocks" ADD CONSTRAINT "resource_blocks_no_overlap"
   EXCLUDE USING gist ("resource_id" WITH =, tstzrange("starts_at", "ends_at") WITH &&);
EXCEPTION
 WHEN duplicate_object THEN null;
 WHEN duplicate_table THEN null;
END $$;--> statement-breakpoint
-- Seed: one top-level resource per field per venue ("Field N").
INSERT INTO "venue_resources" ("venue_id", "name", "field_number", "sort_order")
SELECT v."id", 'Field ' || gs.n, gs.n, gs.n
FROM "venues" v
CROSS JOIN LATERAL generate_series(1, GREATEST(COALESCE(v."field_count", 1), 1)) AS gs(n)
ON CONFLICT DO NOTHING;--> statement-breakpoint
-- Backfill: pre-ledger drop-in sessions get the venue's Field 1.
-- (Founder corrects per session in the admin where that's wrong.)
UPDATE "drop_in_sessions" s
SET "bookable_resource_id" = vr."id"
FROM "venue_resources" vr
WHERE s."bookable_resource_id" IS NULL
  AND vr."venue_id" = s."venue_id"
  AND vr."field_number" = 1
  AND vr."parent_resource_id" IS NULL;--> statement-breakpoint
-- Ledger backfill: FUTURE occupancy only (history stays in source tables).
-- Bare ON CONFLICT DO NOTHING tolerates BOTH the per-source unique index
-- and the exclusion constraint — pre-existing real-world double-bookings
-- (possible: drop-ins were invisible to availability) must not fail the
-- deploy; they surface on the admin calendar via their source tables.
INSERT INTO "resource_blocks" ("resource_id", "starts_at", "ends_at", "source_type", "source_id", "label")
SELECT vr."id", g."scheduled_at",
       g."scheduled_at" + (COALESCE(g."duration_minutes", 60) * interval '1 minute'),
       'game', g."id",
       LEFT(COALESCE(ht."name", 'TBD') || ' vs ' || COALESCE(at_."name", 'TBD'), 200)
FROM "games" g
JOIN "venue_resources" vr ON vr."venue_id" = g."venue_id"
  AND vr."parent_resource_id" IS NULL
  AND g."field_number" ~ '^[0-9]+$'
  AND vr."field_number" = g."field_number"::int
LEFT JOIN "teams" ht ON ht."id" = g."home_team_id"
LEFT JOIN "teams" at_ ON at_."id" = g."away_team_id"
WHERE g."status" IN ('scheduled', 'in_progress')
  AND g."scheduled_at" > now()
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "resource_blocks" ("resource_id", "starts_at", "ends_at", "source_type", "source_id", "label", "expires_at")
SELECT vr."id", r."starts_at", r."ends_at", 'rental', r."id", 'Rental',
       CASE WHEN r."status" = 'pending_payment' THEN r."payment_expires_at" ELSE NULL END
FROM "field_rentals" r
JOIN "venue_resources" vr ON vr."venue_id" = r."venue_id"
  AND vr."field_number" = r."field_number"
  AND vr."parent_resource_id" IS NULL
WHERE r."status" IN ('pending_payment', 'confirmed')
  AND r."ends_at" > now()
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "resource_blocks" ("resource_id", "starts_at", "ends_at", "source_type", "source_id", "label")
SELECT s."bookable_resource_id", s."starts_at", s."ends_at", 'drop_in', s."id",
       LEFT(s."sport_or_class_label", 200)
FROM "drop_in_sessions" s
WHERE s."bookable_resource_id" IS NOT NULL
  AND s."status" = 'scheduled'
  AND s."starts_at" > now()
ON CONFLICT DO NOTHING;
