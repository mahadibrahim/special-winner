CREATE UNIQUE INDEX IF NOT EXISTS "attendance_roster_session_uniq" ON "attendance" USING btree ("roster_id","session_plan_id") WHERE session_plan_id IS NOT NULL;
