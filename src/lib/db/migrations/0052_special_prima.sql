ALTER TABLE "seasons" ADD COLUMN IF NOT EXISTS "term_slug" varchar(64);--> statement-breakpoint
ALTER TABLE "seasons" ADD COLUMN IF NOT EXISTS "term_label" varchar(64);--> statement-breakpoint
ALTER TABLE "seasons" ADD COLUMN IF NOT EXISTS "division_gender" varchar(10);--> statement-breakpoint
ALTER TABLE "seasons" ADD COLUMN IF NOT EXISTS "skill_level" varchar(8);--> statement-breakpoint
ALTER TABLE "seasons" ADD COLUMN IF NOT EXISTS "day_of_week" varchar(3);--> statement-breakpoint
ALTER TABLE "seasons" ADD COLUMN IF NOT EXISTS "start_time" time;--> statement-breakpoint
ALTER TABLE "seasons" ADD COLUMN IF NOT EXISTS "end_time" time;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "seasons_term_idx" ON "seasons" USING btree ("term_slug");
