DO $$ BEGIN CREATE TYPE "public"."curriculum_program_type" AS ENUM('league', 'class', 'camp', 'clinic'); EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "curriculum_sequences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid,
	"sport_id" uuid NOT NULL,
	"development_stage_id" uuid NOT NULL,
	"program_type" "curriculum_program_type" DEFAULT 'league' NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "curriculum_sequence_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sequence_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"template_id" uuid NOT NULL,
	"objectives" jsonb,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "seasons" ADD COLUMN IF NOT EXISTS "curriculum_sequence_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "curriculum_sequences" ADD CONSTRAINT "curriculum_sequences_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "curriculum_sequences" ADD CONSTRAINT "curriculum_sequences_sport_id_sports_id_fk" FOREIGN KEY ("sport_id") REFERENCES "public"."sports"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "curriculum_sequences" ADD CONSTRAINT "curriculum_sequences_development_stage_id_development_stages_id_fk" FOREIGN KEY ("development_stage_id") REFERENCES "public"."development_stages"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "curriculum_sequence_entries" ADD CONSTRAINT "curriculum_sequence_entries_sequence_id_curriculum_sequences_id_fk" FOREIGN KEY ("sequence_id") REFERENCES "public"."curriculum_sequences"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "curriculum_sequence_entries" ADD CONSTRAINT "curriculum_sequence_entries_template_id_practice_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."practice_templates"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
-- HAND-WRITTEN (drizzle does not know about this FK — seasons.curriculum_sequence_id
-- is declared without .references() in programs.ts to break a circular module
-- import). ON DELETE SET NULL: deleting a sequence detaches it from seasons;
-- generated drafts have no FK to sequences and are untouched by design.
DO $$ BEGIN
 ALTER TABLE "seasons" ADD CONSTRAINT "seasons_curriculum_sequence_id_curriculum_sequences_id_fk" FOREIGN KEY ("curriculum_sequence_id") REFERENCES "public"."curriculum_sequences"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "curriculum_sequences_sport_name_uniq" ON "curriculum_sequences" USING btree ("sport_id","name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "curriculum_sequences_org_idx" ON "curriculum_sequences" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "curriculum_sequence_entries_seq_position_uniq" ON "curriculum_sequence_entries" USING btree ("sequence_id","position");
