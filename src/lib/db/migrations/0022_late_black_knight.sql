-- ────────────────────────────────────────────────────────────────────────────
-- Schema: dual-pricing for seasons
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE "seasons" ADD COLUMN "team_price_cents" integer;--> statement-breakpoint
ALTER TABLE "seasons" ADD COLUMN "signup_modes" varchar(20)[] DEFAULT ARRAY['individual']::varchar[] NOT NULL;--> statement-breakpoint

-- ────────────────────────────────────────────────────────────────────────────
-- Data backfill: populate signup_modes + team_price_cents for existing seasons
-- so the catalog displays correctly without manual intervention.
--
--   • Team-only programs (Greek/IM, Corporate): the existing price_cents
--     IS the team price. Mirror it into team_price_cents and flip
--     signup_modes to {team}.
--   • All other adult programs: dual-mode. Default team_price_cents to
--     8 × individual price (a sensible default; operators can override
--     in admin once they decide their team-fee model).
--   • Youth programs: keep the default {individual} and team_price_cents NULL.
-- ────────────────────────────────────────────────────────────────────────────

-- Team-only programs
UPDATE "seasons" s
SET
  "signup_modes" = ARRAY['team']::varchar[],
  "team_price_cents" = s."price_cents",
  "pricing_mode" = 'per_team'
FROM "programs" p
WHERE s."program_id" = p."id"
  AND p."slug" IN ('do-greek-im', 'do-corporate');--> statement-breakpoint

-- Dual-mode adult programs (everything else with audience_type='adults')
UPDATE "seasons" s
SET
  "signup_modes" = ARRAY['individual','team']::varchar[],
  "team_price_cents" = s."price_cents" * 8
FROM "programs" p
WHERE s."program_id" = p."id"
  AND p."audience_type" = 'adults'
  AND p."slug" NOT IN ('do-greek-im', 'do-corporate');
