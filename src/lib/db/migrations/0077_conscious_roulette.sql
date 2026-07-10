-- Idempotent (0023/0024/0059/0073/0075/0076 convention): tolerate a
-- drifted DB that already carries the table/column/constraint/index.
CREATE TABLE IF NOT EXISTS "blueprint_warning_dismissals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sequence_entry_id" uuid NOT NULL,
	"dismissed_by" uuid NOT NULL,
	"dismissed_at" timestamp DEFAULT now() NOT NULL,
	"reason" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sequence_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sequence_id" uuid NOT NULL,
	"season_id" uuid NOT NULL,
	"distributed_by" uuid NOT NULL,
	"distributed_at" timestamp DEFAULT now() NOT NULL,
	"notes" text
);
--> statement-breakpoint
ALTER TABLE "session_plans" ADD COLUMN IF NOT EXISTS "sequence_attachment_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "blueprint_warning_dismissals" ADD CONSTRAINT "blueprint_warning_dismissals_sequence_entry_id_curriculum_sequence_entries_id_fk" FOREIGN KEY ("sequence_entry_id") REFERENCES "public"."curriculum_sequence_entries"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "blueprint_warning_dismissals" ADD CONSTRAINT "blueprint_warning_dismissals_dismissed_by_users_id_fk" FOREIGN KEY ("dismissed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sequence_attachments" ADD CONSTRAINT "sequence_attachments_sequence_id_curriculum_sequences_id_fk" FOREIGN KEY ("sequence_id") REFERENCES "public"."curriculum_sequences"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sequence_attachments" ADD CONSTRAINT "sequence_attachments_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sequence_attachments" ADD CONSTRAINT "sequence_attachments_distributed_by_users_id_fk" FOREIGN KEY ("distributed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "blueprint_warning_dismissals_entry_idx" ON "blueprint_warning_dismissals" USING btree ("sequence_entry_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sequence_attachments_season_idx" ON "sequence_attachments" USING btree ("season_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sequence_attachments_sequence_idx" ON "sequence_attachments" USING btree ("sequence_id");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "session_plans" ADD CONSTRAINT "session_plans_sequence_attachment_id_sequence_attachments_id_fk" FOREIGN KEY ("sequence_attachment_id") REFERENCES "public"."sequence_attachments"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "session_plans_sequence_attachment_idx" ON "session_plans" USING btree ("sequence_attachment_id");
