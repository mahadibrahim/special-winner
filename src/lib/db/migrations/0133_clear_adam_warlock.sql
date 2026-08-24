-- Class rate source (SDD 2026-08-23-youth-classes-engine, final review I3).
-- Additive + idempotent (repo convention for possibly-drifted DBs): the
-- paid class make-up path had NO class rate to read, so it fell through to
-- drop_in_rate_card — the ADULT PICKUP card.
ALTER TABLE "class_slot_templates" ADD COLUMN IF NOT EXISTS "session_rate_cents" integer;--> statement-breakpoint
ALTER TABLE "class_slot_templates" ADD COLUMN IF NOT EXISTS "member_rate_cents" integer;
