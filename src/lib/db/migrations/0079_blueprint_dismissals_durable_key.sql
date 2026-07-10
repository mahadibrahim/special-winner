-- Idempotent (0023/0024/0059/0073/0075/0076/0077/0078 convention).
-- blueprint_warning_dismissals is empty in every environment (staging +
-- prod) as of this migration -- Task 6 only wired the read path, no
-- dismissal-writing UI shipped before Task 7 -- so adding sequence_id /
-- template_id as NOT NULL needs no backfill.
--
-- Re-keys dismissals from sequence_entry_id (ephemeral: the entries PUT
-- delete-reinserts ALL entries with fresh UUIDs on every save) to
-- (sequence_id, template_id) -- a dismissal now survives arc reorders and
-- re-adds. sequence_entry_id becomes nullable, optional provenance only.
ALTER TABLE "blueprint_warning_dismissals" ALTER COLUMN "sequence_entry_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "blueprint_warning_dismissals" ADD COLUMN IF NOT EXISTS "sequence_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "blueprint_warning_dismissals" ADD COLUMN IF NOT EXISTS "template_id" uuid NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "blueprint_warning_dismissals" ADD CONSTRAINT "blueprint_warning_dismissals_sequence_id_curriculum_sequences_id_fk" FOREIGN KEY ("sequence_id") REFERENCES "public"."curriculum_sequences"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "blueprint_warning_dismissals" ADD CONSTRAINT "blueprint_warning_dismissals_template_id_practice_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."practice_templates"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "blueprint_warning_dismissals_sequence_template_idx" ON "blueprint_warning_dismissals" USING btree ("sequence_id","template_id");
