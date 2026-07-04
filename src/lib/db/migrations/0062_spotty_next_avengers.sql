-- Defensive dedupe before adding natural-key unique indexes (curriculum-recovery
-- Task 1). All target tables are empty on staging today; this is pure defense
-- against prod/CI drift where duplicate rows could already exist. Keeps the
-- oldest row (by created_at) per natural key, deletes the rest.

DELETE FROM "skills" a USING "skills" b
  WHERE a.sport_id = b.sport_id AND a.slug = b.slug
    AND a.created_at > b.created_at;--> statement-breakpoint

DELETE FROM "activities" a USING "activities" b
  WHERE a.sport_id = b.sport_id AND a.slug = b.slug
    AND a.created_at > b.created_at;--> statement-breakpoint

DELETE FROM "practice_templates" a USING "practice_templates" b
  WHERE a.sport_id = b.sport_id AND a.name = b.name
    AND a.created_at > b.created_at;--> statement-breakpoint

DELETE FROM "coach_prompts" a USING "coach_prompts" b
  WHERE a.content = b.content
    AND a.created_at > b.created_at;--> statement-breakpoint

DELETE FROM "coach_resources" a USING "coach_resources" b
  WHERE a.title = b.title
    AND a.created_at > b.created_at;--> statement-breakpoint

DELETE FROM "coaching_principles" a USING "coaching_principles" b
  WHERE a.title = b.title
    AND a.created_at > b.created_at;--> statement-breakpoint

DELETE FROM "assessment_snapshots" a USING "assessment_snapshots" b
  WHERE a.family_member_id = b.family_member_id
    AND a.season_id = b.season_id
    AND a.domain_id = b.domain_id
    AND a.created_at > b.created_at;--> statement-breakpoint

CREATE UNIQUE INDEX "assessment_snapshots_member_season_domain_uniq" ON "assessment_snapshots" USING btree ("family_member_id","season_id","domain_id");--> statement-breakpoint
CREATE UNIQUE INDEX "coach_prompts_content_uniq" ON "coach_prompts" USING btree ("content");--> statement-breakpoint
CREATE UNIQUE INDEX "coach_resources_title_uniq" ON "coach_resources" USING btree ("title");--> statement-breakpoint
CREATE UNIQUE INDEX "coaching_principles_title_uniq" ON "coaching_principles" USING btree ("title");--> statement-breakpoint
CREATE UNIQUE INDEX "skills_sport_slug_uniq" ON "skills" USING btree ("sport_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "activities_sport_slug_uniq" ON "activities" USING btree ("sport_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "practice_templates_sport_name_uniq" ON "practice_templates" USING btree ("sport_id","name");
