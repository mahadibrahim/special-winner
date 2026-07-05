-- Defensive dedupe before adding natural-key unique indexes (curriculum-recovery
-- Task 1). All target tables are empty on staging today; this is pure defense
-- against prod/CI drift where duplicate rows could already exist. Keeps the
-- oldest row per natural key, deletes the rest.
--
-- Survivor selection: ORDER BY created_at ASC, id ASC -- batch inserts share
-- one now(), so created_at alone does not uniquely order duplicates; the id
-- tiebreak (final review Finding 1) guarantees a single deterministic
-- survivor even when every duplicate in a group shares the same created_at,
-- so the CREATE UNIQUE INDEX statements below cannot still find a live
-- collision.
--
-- Before deleting duplicates on a parent table that has child rows
-- referencing it (final review Finding 2), a temp map re-points every child
-- FK from the losing row(s) to the one surviving row using the identical
-- (created_at, id) ordering, so no child data silently disappears via
-- ON DELETE CASCADE and no child row is left dangling by ON DELETE SET NULL.
-- Checked every schema file under src/lib/db/schema/ for
-- `references(() => <table>.id` to enumerate these; none of the child
-- tables below carry a unique constraint on the FK column being repointed,
-- so a plain UPDATE is safe (no ON CONFLICT handling needed).
--
-- Every statement here is idempotent: on an empty table or an
-- already-deduped table, the temp "map" tables select zero rows, so the
-- UPDATEs and DELETEs that follow affect zero rows.
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- skills (natural key: sport_id, slug)
-- Child FKs: skill_progressions.skill_id / .prerequisite_skill_id (cascade),
-- skill_category_assignments.skill_id (cascade), assessment_rubrics.skill_id
-- (cascade), player_assessments.skill_id (cascade),
-- player_skill_summary.skill_id (cascade), player_achievements.trigger_skill_id
-- (set null), coach_prompts.skill_id (set null), coach_resources.skill_id
-- (set null).
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE "_dedupe_skills" AS
SELECT r.id AS loser_id, s.survivor_id
FROM (
  SELECT id, sport_id, slug,
    ROW_NUMBER() OVER (PARTITION BY sport_id, slug ORDER BY created_at ASC, id ASC) AS rn
  FROM "skills"
) r
JOIN (
  SELECT sport_id, slug, id AS survivor_id
  FROM (
    SELECT id, sport_id, slug,
      ROW_NUMBER() OVER (PARTITION BY sport_id, slug ORDER BY created_at ASC, id ASC) AS rn
    FROM "skills"
  ) x
  WHERE x.rn = 1
) s ON r.sport_id = s.sport_id AND r.slug = s.slug
WHERE r.rn > 1;--> statement-breakpoint

UPDATE "skill_progressions" t SET skill_id = m.survivor_id
  FROM "_dedupe_skills" m WHERE t.skill_id = m.loser_id;--> statement-breakpoint

UPDATE "skill_progressions" t SET prerequisite_skill_id = m.survivor_id
  FROM "_dedupe_skills" m WHERE t.prerequisite_skill_id = m.loser_id;--> statement-breakpoint

UPDATE "skill_category_assignments" t SET skill_id = m.survivor_id
  FROM "_dedupe_skills" m WHERE t.skill_id = m.loser_id;--> statement-breakpoint

UPDATE "assessment_rubrics" t SET skill_id = m.survivor_id
  FROM "_dedupe_skills" m WHERE t.skill_id = m.loser_id;--> statement-breakpoint

UPDATE "player_assessments" t SET skill_id = m.survivor_id
  FROM "_dedupe_skills" m WHERE t.skill_id = m.loser_id;--> statement-breakpoint

UPDATE "player_skill_summary" t SET skill_id = m.survivor_id
  FROM "_dedupe_skills" m WHERE t.skill_id = m.loser_id;--> statement-breakpoint

UPDATE "player_achievements" t SET trigger_skill_id = m.survivor_id
  FROM "_dedupe_skills" m WHERE t.trigger_skill_id = m.loser_id;--> statement-breakpoint

UPDATE "coach_prompts" t SET skill_id = m.survivor_id
  FROM "_dedupe_skills" m WHERE t.skill_id = m.loser_id;--> statement-breakpoint

UPDATE "coach_resources" t SET skill_id = m.survivor_id
  FROM "_dedupe_skills" m WHERE t.skill_id = m.loser_id;--> statement-breakpoint

DELETE FROM "skills" a USING "skills" b
  WHERE a.sport_id = b.sport_id AND a.slug = b.slug
    AND (a.created_at > b.created_at
      OR (a.created_at = b.created_at AND a.id > b.id));--> statement-breakpoint

DROP TABLE "_dedupe_skills";--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- activities (natural key: sport_id, slug)
-- Child FKs: session_activity_usage.activity_id (cascade),
-- activity_ratings.activity_id (cascade).
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE "_dedupe_activities" AS
SELECT r.id AS loser_id, s.survivor_id
FROM (
  SELECT id, sport_id, slug,
    ROW_NUMBER() OVER (PARTITION BY sport_id, slug ORDER BY created_at ASC, id ASC) AS rn
  FROM "activities"
) r
JOIN (
  SELECT sport_id, slug, id AS survivor_id
  FROM (
    SELECT id, sport_id, slug,
      ROW_NUMBER() OVER (PARTITION BY sport_id, slug ORDER BY created_at ASC, id ASC) AS rn
    FROM "activities"
  ) x
  WHERE x.rn = 1
) s ON r.sport_id = s.sport_id AND r.slug = s.slug
WHERE r.rn > 1;--> statement-breakpoint

UPDATE "session_activity_usage" t SET activity_id = m.survivor_id
  FROM "_dedupe_activities" m WHERE t.activity_id = m.loser_id;--> statement-breakpoint

UPDATE "activity_ratings" t SET activity_id = m.survivor_id
  FROM "_dedupe_activities" m WHERE t.activity_id = m.loser_id;--> statement-breakpoint

DELETE FROM "activities" a USING "activities" b
  WHERE a.sport_id = b.sport_id AND a.slug = b.slug
    AND (a.created_at > b.created_at
      OR (a.created_at = b.created_at AND a.id > b.id));--> statement-breakpoint

DROP TABLE "_dedupe_activities";--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- practice_templates (natural key: sport_id, name)
-- Child FK: session_plans.template_id (set null).
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE "_dedupe_practice_templates" AS
SELECT r.id AS loser_id, s.survivor_id
FROM (
  SELECT id, sport_id, name,
    ROW_NUMBER() OVER (PARTITION BY sport_id, name ORDER BY created_at ASC, id ASC) AS rn
  FROM "practice_templates"
) r
JOIN (
  SELECT sport_id, name, id AS survivor_id
  FROM (
    SELECT id, sport_id, name,
      ROW_NUMBER() OVER (PARTITION BY sport_id, name ORDER BY created_at ASC, id ASC) AS rn
    FROM "practice_templates"
  ) x
  WHERE x.rn = 1
) s ON r.sport_id = s.sport_id AND r.name = s.name
WHERE r.rn > 1;--> statement-breakpoint

UPDATE "session_plans" t SET template_id = m.survivor_id
  FROM "_dedupe_practice_templates" m WHERE t.template_id = m.loser_id;--> statement-breakpoint

DELETE FROM "practice_templates" a USING "practice_templates" b
  WHERE a.sport_id = b.sport_id AND a.name = b.name
    AND (a.created_at > b.created_at
      OR (a.created_at = b.created_at AND a.id > b.id));--> statement-breakpoint

DROP TABLE "_dedupe_practice_templates";--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- coach_prompts (natural key: content)
-- Child FK: coach_prompt_dismissals.prompt_id (cascade).
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE "_dedupe_coach_prompts" AS
SELECT r.id AS loser_id, s.survivor_id
FROM (
  SELECT id, content,
    ROW_NUMBER() OVER (PARTITION BY content ORDER BY created_at ASC, id ASC) AS rn
  FROM "coach_prompts"
) r
JOIN (
  SELECT content, id AS survivor_id
  FROM (
    SELECT id, content,
      ROW_NUMBER() OVER (PARTITION BY content ORDER BY created_at ASC, id ASC) AS rn
    FROM "coach_prompts"
  ) x
  WHERE x.rn = 1
) s ON r.content = s.content
WHERE r.rn > 1;--> statement-breakpoint

UPDATE "coach_prompt_dismissals" t SET prompt_id = m.survivor_id
  FROM "_dedupe_coach_prompts" m WHERE t.prompt_id = m.loser_id;--> statement-breakpoint

DELETE FROM "coach_prompts" a USING "coach_prompts" b
  WHERE a.content = b.content
    AND (a.created_at > b.created_at
      OR (a.created_at = b.created_at AND a.id > b.id));--> statement-breakpoint

DROP TABLE "_dedupe_coach_prompts";--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- coach_resources (natural key: title)
-- Child FK: coach_resource_views.resource_id (cascade).
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE "_dedupe_coach_resources" AS
SELECT r.id AS loser_id, s.survivor_id
FROM (
  SELECT id, title,
    ROW_NUMBER() OVER (PARTITION BY title ORDER BY created_at ASC, id ASC) AS rn
  FROM "coach_resources"
) r
JOIN (
  SELECT title, id AS survivor_id
  FROM (
    SELECT id, title,
      ROW_NUMBER() OVER (PARTITION BY title ORDER BY created_at ASC, id ASC) AS rn
    FROM "coach_resources"
  ) x
  WHERE x.rn = 1
) s ON r.title = s.title
WHERE r.rn > 1;--> statement-breakpoint

UPDATE "coach_resource_views" t SET resource_id = m.survivor_id
  FROM "_dedupe_coach_resources" m WHERE t.resource_id = m.loser_id;--> statement-breakpoint

DELETE FROM "coach_resources" a USING "coach_resources" b
  WHERE a.title = b.title
    AND (a.created_at > b.created_at
      OR (a.created_at = b.created_at AND a.id > b.id));--> statement-breakpoint

DROP TABLE "_dedupe_coach_resources";--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- coaching_principles (natural key: title) -- no child FKs reference this
-- table anywhere in src/lib/db/schema/, so no re-point step is needed.
-- ---------------------------------------------------------------------------
DELETE FROM "coaching_principles" a USING "coaching_principles" b
  WHERE a.title = b.title
    AND (a.created_at > b.created_at
      OR (a.created_at = b.created_at AND a.id > b.id));--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- assessment_snapshots (natural key: family_member_id, season_id, domain_id)
-- -- no child FKs reference this table anywhere in src/lib/db/schema/, so no
-- re-point step is needed.
-- ---------------------------------------------------------------------------
DELETE FROM "assessment_snapshots" a USING "assessment_snapshots" b
  WHERE a.family_member_id = b.family_member_id
    AND a.season_id = b.season_id
    AND a.domain_id = b.domain_id
    AND (a.created_at > b.created_at
      OR (a.created_at = b.created_at AND a.id > b.id));--> statement-breakpoint

-- Drift-idempotent (final review Finding 3): IF NOT EXISTS so a re-run
-- against a DB where these indexes already landed (e.g. a prior partial
-- migration run, or drift from a manual push) does not fail the deploy.
CREATE UNIQUE INDEX IF NOT EXISTS "assessment_snapshots_member_season_domain_uniq" ON "assessment_snapshots" USING btree ("family_member_id","season_id","domain_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "coach_prompts_content_uniq" ON "coach_prompts" USING btree ("content");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "coach_resources_title_uniq" ON "coach_resources" USING btree ("title");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "coaching_principles_title_uniq" ON "coaching_principles" USING btree ("title");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "skills_sport_slug_uniq" ON "skills" USING btree ("sport_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "activities_sport_slug_uniq" ON "activities" USING btree ("sport_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "practice_templates_sport_name_uniq" ON "practice_templates" USING btree ("sport_id","name");
