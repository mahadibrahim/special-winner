-- Reconciles two pieces of out-of-band schema drift between staging and prod:
--
-- 1. `staff_notification_log` table — defined in
--    src/lib/db/schema/staff-notifications.ts and used by the messaging
--    code. An orphan migration file (0002_narrow_talkback.sql) existed on
--    disk but was never registered in meta/_journal.json, so drizzle-kit
--    skipped it on every fresh DB. Prod had the table from an out-of-band
--    run of that orphan SQL; staging never did.
--
-- 2. Two foreign-key constraints on `conversation_messages` that were
--    added by migration 0004_flaky_starfox but at some point dropped on
--    prod manually. schema.ts still declares them via `.references()`.
--
-- Both blocks are idempotent (IF NOT EXISTS + DO ... EXCEPTION guards)
-- so this migration is safe to re-run and a no-op against any DB that
-- already has the listed objects.

CREATE TABLE IF NOT EXISTS "staff_notification_log" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "staff_user_id" uuid NOT NULL,
  "conversation_id" uuid NOT NULL,
  "notification_type" varchar(30) NOT NULL,
  "delivered_channel" varchar(20),
  "sent_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "staff_notification_log"
    ADD CONSTRAINT "staff_notification_log_staff_user_id_users_id_fk"
    FOREIGN KEY ("staff_user_id") REFERENCES "public"."users"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "staff_notification_log"
    ADD CONSTRAINT "staff_notification_log_conversation_id_conversations_id_fk"
    FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_staff_notification_staff_recent"
  ON "staff_notification_log" USING btree ("staff_user_id", "sent_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_staff_notification_conversation"
  ON "staff_notification_log" USING btree ("conversation_id");
--> statement-breakpoint
-- Re-add the conversation_messages FKs that migration 0004 created but
-- were manually dropped on prod at some point. The corresponding TS
-- columns intentionally don't use `.references()` (to avoid circular
-- imports — see comment in src/lib/db/schema/conversations.ts), so
-- drizzle-kit never re-emits these — they have to be hand-rolled here.
DO $$ BEGIN
  ALTER TABLE "conversation_messages"
    ADD CONSTRAINT "conversation_messages_broadcast_id_fk"
    FOREIGN KEY ("broadcast_id") REFERENCES "broadcast_log"("id")
    ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "conversation_messages"
    ADD CONSTRAINT "conversation_messages_team_group_id_fk"
    FOREIGN KEY ("team_group_id") REFERENCES "team_groups"("id")
    ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
