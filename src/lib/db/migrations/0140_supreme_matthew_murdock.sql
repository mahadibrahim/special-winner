-- Hand-adjusted for re-run safety (see the INVARIANT comment in
-- scripts/db-migrate.ts): IF NOT EXISTS so a repeat run is a no-op.
-- Serves the annual-waiver legacy fallback query in
-- src/lib/consents/liability.ts; no other index on this table leads with
-- family_member_id, so the fallback would otherwise seq-scan on the hot path.
CREATE INDEX IF NOT EXISTS "drop_in_bookings_waiver_signature_idx" ON "drop_in_bookings" USING btree ("family_member_id","waiver_signed_at") WHERE waiver_signed = true AND waiver_signed_at IS NOT NULL AND family_member_id IS NOT NULL;
