-- Idempotent (0023/0024/0059/0073/0075/0076/0077 convention). Dedupe
-- concurrent-double-POST duplicates before creating the partial unique
-- index: only rows with sequence_attachment_id IS NOT NULL are prescribed
-- sessions and thus in scope -- coach-created sessions (null attachment)
-- may legitimately repeat a template on a date and are left untouched. For
-- each (team_id, template_id, scheduled_date) pair among prescribed rows,
-- keep the earliest created row (ties broken by smaller id) and delete
-- the rest -- mirrors 0075's self-join delete, but keeping the EARLIEST
-- row (the race's "real" write) rather than the most recent.
DELETE FROM "session_plans" a
USING "session_plans" b
WHERE a.sequence_attachment_id IS NOT NULL
  AND b.sequence_attachment_id IS NOT NULL
  AND a.team_id = b.team_id
  AND a.template_id = b.template_id
  AND a.scheduled_date = b.scheduled_date
  AND (a.created_at > b.created_at
    OR (a.created_at = b.created_at AND a.id > b.id));--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "session_plans_prescribed_dedupe_uniq" ON "session_plans" USING btree ("team_id","template_id","scheduled_date") WHERE sequence_attachment_id IS NOT NULL;
