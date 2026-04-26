ALTER TABLE "password_reset_tokens" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "password_reset_tokens" CASCADE;--> statement-breakpoint
ALTER TABLE "programs" ADD COLUMN "is_test" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "seasons" ADD COLUMN "is_test" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "discount_codes_org_code_unique" ON "discount_codes" USING btree ("organization_id","code");--> statement-breakpoint
CREATE INDEX "discount_usages_discount_code_idx" ON "discount_usages" USING btree ("discount_code_id");--> statement-breakpoint
CREATE INDEX "discount_usages_user_idx" ON "discount_usages" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "discount_usages_registration_idx" ON "discount_usages" USING btree ("registration_id");--> statement-breakpoint
CREATE INDEX "email_verification_tokens_user_idx" ON "email_verification_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_expires_at_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "user_roles_user_idx" ON "user_roles" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_roles_role_scope_idx" ON "user_roles" USING btree ("role_id","scope_type","scope_id");--> statement-breakpoint
CREATE INDEX "programs_location_idx" ON "programs" USING btree ("location_id");--> statement-breakpoint
CREATE INDEX "programs_sport_active_idx" ON "programs" USING btree ("sport_id","active");--> statement-breakpoint
CREATE INDEX "seasons_program_idx" ON "seasons" USING btree ("program_id");--> statement-breakpoint
CREATE INDEX "seasons_status_registration_opens_idx" ON "seasons" USING btree ("status","registration_opens");--> statement-breakpoint
CREATE INDEX "email_logs_user_idx" ON "email_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "email_logs_registration_idx" ON "email_logs" USING btree ("registration_id");--> statement-breakpoint
CREATE INDEX "family_members_parent_user_idx" ON "family_members" USING btree ("parent_user_id");--> statement-breakpoint
CREATE INDEX "registrations_season_idx" ON "registrations" USING btree ("season_id");--> statement-breakpoint
CREATE INDEX "registrations_family_member_idx" ON "registrations" USING btree ("family_member_id");--> statement-breakpoint
CREATE INDEX "registrations_registered_by_idx" ON "registrations" USING btree ("registered_by_user_id");--> statement-breakpoint
CREATE INDEX "registrations_status_payment_status_idx" ON "registrations" USING btree ("status","payment_status");--> statement-breakpoint
CREATE INDEX "registrations_season_status_idx" ON "registrations" USING btree ("season_id","status");--> statement-breakpoint
CREATE INDEX "payment_plans_registration_idx" ON "payment_plans" USING btree ("registration_id");--> statement-breakpoint
CREATE INDEX "payments_registration_idx" ON "payments" USING btree ("registration_id");--> statement-breakpoint
CREATE INDEX "payments_user_idx" ON "payments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "payments_stripe_payment_intent_idx" ON "payments" USING btree ("stripe_payment_intent_id");--> statement-breakpoint
CREATE INDEX "payments_stripe_charge_idx" ON "payments" USING btree ("stripe_charge_id");--> statement-breakpoint
CREATE INDEX "scheduled_payments_payment_plan_idx" ON "scheduled_payments" USING btree ("payment_plan_id");--> statement-breakpoint
CREATE INDEX "scheduled_payments_status_due_date_idx" ON "scheduled_payments" USING btree ("status","due_date");--> statement-breakpoint
CREATE INDEX "attendance_team_event_date_idx" ON "attendance" USING btree ("team_id","event_date");--> statement-breakpoint
CREATE INDEX "attendance_roster_idx" ON "attendance" USING btree ("roster_id");--> statement-breakpoint
CREATE INDEX "coach_notes_family_member_team_idx" ON "coach_notes" USING btree ("family_member_id","team_id");--> statement-breakpoint
CREATE INDEX "games_season_idx" ON "games" USING btree ("season_id");--> statement-breakpoint
CREATE INDEX "games_home_team_idx" ON "games" USING btree ("home_team_id");--> statement-breakpoint
CREATE INDEX "games_away_team_idx" ON "games" USING btree ("away_team_id");--> statement-breakpoint
CREATE INDEX "games_scheduled_at_idx" ON "games" USING btree ("scheduled_at");--> statement-breakpoint
CREATE INDEX "rosters_team_idx" ON "rosters" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "rosters_registration_idx" ON "rosters" USING btree ("registration_id");--> statement-breakpoint
CREATE INDEX "teams_season_idx" ON "teams" USING btree ("season_id");--> statement-breakpoint
CREATE INDEX "teams_coach_user_idx" ON "teams" USING btree ("coach_user_id");--> statement-breakpoint
CREATE INDEX "venues_location_idx" ON "venues" USING btree ("location_id");--> statement-breakpoint
-- Backfill is_test flag for fixtures so the public catalog hides them by default.
UPDATE "programs" SET "is_test" = TRUE
  WHERE "name" ILIKE '%E2E Test%'
     OR "name" ILIKE '%Clone Source%'
     OR "name" ILIKE '%Other Program Source%';--> statement-breakpoint
UPDATE "seasons" SET "is_test" = TRUE
  WHERE "name" ILIKE '%E2E Test%'
     OR "name" ILIKE '%Clone Source%'
     OR "name" ILIKE '%Other Program Source%';