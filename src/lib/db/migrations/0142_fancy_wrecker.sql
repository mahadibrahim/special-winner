-- Comp-credit grants: an admin issues goodwill credits directly, so there is
-- no Checkout Session behind them. Three coupled changes, hand-adjusted for
-- re-run safety (see the INVARIANT comment in scripts/db-migrate.ts):
--   1. stripe_checkout_session_id becomes nullable;
--   2. the unique index that made the pack/block webhooks idempotent is
--      REPLACED by a PARTIAL one over the non-null rows;
--   3. granted_by_user_id records which admin issued a comp grant.
--
-- The index is renamed to _v2 rather than dropped and recreated under the
-- same name: db-migrate-bootstrap.ts verifies index migrations by NAME only,
-- so a same-name drop+recreate is silently skipped on an already-populated
-- DB and the old TOTAL index survives — which would reject the second comp
-- grant (two NULL session ids are distinct under a plain unique index, so
-- this is belt-and-braces intent rather than a live break, but the rule is
-- absolute: any change to an index's columns or predicate bumps its name).
-- See the same note on drop_in_bookings_one_active_per_participant_session_v3.
DROP INDEX IF EXISTS "class_credit_grants_checkout_session_uq";--> statement-breakpoint
ALTER TABLE "class_credit_grants" ALTER COLUMN "stripe_checkout_session_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "class_credit_grants" ADD COLUMN IF NOT EXISTS "granted_by_user_id" uuid;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "class_credit_grants" ADD CONSTRAINT "class_credit_grants_granted_by_user_id_users_id_fk" FOREIGN KEY ("granted_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "class_credit_grants_checkout_session_uq_v2" ON "class_credit_grants" USING btree ("stripe_checkout_session_id") WHERE stripe_checkout_session_id IS NOT NULL;
