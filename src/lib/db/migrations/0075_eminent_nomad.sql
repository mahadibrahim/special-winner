-- Idempotent (0023/0024/0044/0070/0073 convention). Dedupe existing rows
-- before creating the unique index: for each (family_member_id, skill_id)
-- pair keep the most recently updated row (ties broken by larger id) and
-- delete the rest — race-created duplicates otherwise abort index creation.
DELETE FROM "player_skill_summary" a
USING "player_skill_summary" b
WHERE a.family_member_id = b.family_member_id
  AND a.skill_id = b.skill_id
  AND (a.updated_at < b.updated_at
    OR (a.updated_at = b.updated_at AND a.id < b.id));--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "player_skill_summary_member_skill_uniq" ON "player_skill_summary" USING btree ("family_member_id","skill_id");
