ALTER TABLE "seasons" ADD COLUMN IF NOT EXISTS "early_bird_team_price_cents" integer;--> statement-breakpoint

-- Rehome the misconfigured early-bird prices.
--
-- The Fall 2026 divisions carried an early-bird TEAM price ($1,000) in
-- early_bird_price_cents, which is the PER-PLAYER field. Because
-- effectivePriceCents() substitutes that field for price_cents on individual
-- registrations, every solo registrant was quoted and charged $1,000 against a
-- $120 list price (8.3x) until #392 added a guard. Now that a real team column
-- exists, move the value where it belongs and clear the per-player field.
--
-- Only touches rows that are provably misconfigured (early-bird >= the list
-- player price is never a valid per-player discount), and only fills the team
-- column when the value IS a valid team discount. Re-run safe: after the first
-- pass early_bird_price_cents is NULL on these rows, so the predicate no longer
-- matches and a repeat run is a no-op.
UPDATE "seasons"
SET "early_bird_team_price_cents" = "early_bird_price_cents"
WHERE "early_bird_price_cents" IS NOT NULL
  AND "early_bird_price_cents" >= "price_cents"
  AND "early_bird_team_price_cents" IS NULL
  AND "team_price_cents" IS NOT NULL
  AND "early_bird_price_cents" < "team_price_cents";--> statement-breakpoint

UPDATE "seasons"
SET "early_bird_price_cents" = NULL
WHERE "early_bird_price_cents" IS NOT NULL
  AND "early_bird_price_cents" >= "price_cents";
