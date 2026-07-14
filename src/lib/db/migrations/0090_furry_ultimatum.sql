-- Links a drop-in booking to the person it is actually FOR.
--
-- NULL means "the booking's user IS the participant" — every adult walk-in and
-- every online drop-in. Non-NULL means the participant is a family_members row
-- (the COPPA / parent_user_id path) and the booking's user is the guardian.
--
-- Why this exists: walkin/start creates the child's family_members row via
-- resolvePerson() and books under the PARENT. Without this link the child was
-- unreachable from the booking, so resolveSigner returned isMinor:false for
-- every walk-in — a minor was shown the ADULT liability waiver (no guardian
-- consent, and the "player named above" was never actually named), and their
-- check-in photo was written to the parent's users.avatar_url.
--
-- Written idempotently per the 0023/0024 convention: prod has been `db:push`-ed
-- in the past, so a migration must tolerate an object that already exists.
ALTER TABLE "drop_in_bookings" ADD COLUMN IF NOT EXISTS "family_member_id" uuid;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "drop_in_bookings" ADD CONSTRAINT "drop_in_bookings_family_member_id_family_members_id_fk" FOREIGN KEY ("family_member_id") REFERENCES "public"."family_members"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
