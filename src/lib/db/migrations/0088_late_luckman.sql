-- Who the walk-in booking is actually FOR. A kiosk walk-in for a minor books
-- under the parent (user_id = parent, who pays and gets the pay link) while the
-- player is a family_members row on the parent_user_id (COPPA) path. Without
-- this link the child was unreachable from the booking, so resolveSigner()
-- reported the parent as the participant: guardians signed the ADULT waiver and
-- children's kiosk photos were written to the parent's users.avatar_url.
-- NULL = the booking's user IS the participant (adult walk-ins, online drop-ins).
-- Written idempotently (repo convention: migrations must be re-run-safe).
ALTER TABLE "drop_in_bookings" ADD COLUMN IF NOT EXISTS "family_member_id" uuid;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "drop_in_bookings" ADD CONSTRAINT "drop_in_bookings_family_member_id_family_members_id_fk" FOREIGN KEY ("family_member_id") REFERENCES "public"."family_members"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
