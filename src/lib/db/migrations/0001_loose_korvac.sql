CREATE TYPE "public"."announcement_status" AS ENUM('draft', 'published', 'archived');--> statement-breakpoint
CREATE TYPE "public"."announcement_target" AS ENUM('all', 'parents', 'coaches', 'program', 'team');--> statement-breakpoint
CREATE TYPE "public"."coach_resource_type" AS ENUM('video', 'article', 'diagram', 'document', 'external_link');--> statement-breakpoint
CREATE TYPE "public"."discount_type" AS ENUM('percentage', 'fixed_amount');--> statement-breakpoint
CREATE TYPE "public"."attendance_status" AS ENUM('present', 'absent', 'late', 'excused');--> statement-breakpoint
CREATE TYPE "public"."event_type" AS ENUM('practice', 'game', 'other');--> statement-breakpoint
CREATE TABLE "announcements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"title" varchar(255) NOT NULL,
	"content" text NOT NULL,
	"target" "announcement_target" DEFAULT 'all' NOT NULL,
	"target_id" uuid,
	"status" "announcement_status" DEFAULT 'draft' NOT NULL,
	"send_email" boolean DEFAULT false NOT NULL,
	"email_sent_at" timestamp,
	"published_at" timestamp,
	"expires_at" timestamp,
	"pinned" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bot_actions_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"triggered_by_message_id" uuid,
	"action_type" varchar(50) NOT NULL,
	"action_params" jsonb,
	"success" boolean NOT NULL,
	"error_message" text,
	"reversible" boolean DEFAULT true NOT NULL,
	"reversed_at" timestamp,
	"reversed_by_user_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversation_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"direction" varchar(10) NOT NULL,
	"channel" varchar(20) NOT NULL,
	"sender_type" varchar(20) NOT NULL,
	"sender_user_id" uuid,
	"external_message_id" varchar(255),
	"body" text NOT NULL,
	"body_html" text,
	"attachments" jsonb,
	"intent_classification" jsonb,
	"bot_action_result" jsonb,
	"delivered_at" timestamp,
	"failed_at" timestamp,
	"failure_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"parent_user_id" uuid NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"assigned_staff_id" uuid,
	"assignment_role" varchar(20),
	"pending_confirmation" jsonb,
	"last_message_at" timestamp DEFAULT now() NOT NULL,
	"last_inbound_at" timestamp,
	"last_outbound_at" timestamp,
	"subject_context" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "curriculum_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"content_type" varchar(50) NOT NULL,
	"content_id" uuid NOT NULL,
	"content_name" varchar(255) NOT NULL,
	"sport_name" varchar(100),
	"reviewed_at" timestamp DEFAULT now() NOT NULL,
	"reviewer_type" varchar(50) DEFAULT 'automated' NOT NULL,
	"reviewer_id" uuid,
	"overall_score" numeric(3, 2) NOT NULL,
	"criteria_scores" jsonb NOT NULL,
	"anti_patterns_found" jsonb,
	"best_practices_found" jsonb,
	"strengths" jsonb,
	"improvements_needed" jsonb,
	"priority_fixes" jsonb,
	"status" varchar(50) DEFAULT 'completed' NOT NULL,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "discount_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"code" varchar(50) NOT NULL,
	"description" text,
	"discount_type" "discount_type" DEFAULT 'percentage' NOT NULL,
	"discount_value" integer NOT NULL,
	"min_purchase_cents" integer,
	"max_discount_cents" integer,
	"max_uses" integer,
	"used_count" integer DEFAULT 0 NOT NULL,
	"max_uses_per_user" integer DEFAULT 1,
	"season_id" uuid,
	"active" boolean DEFAULT true NOT NULL,
	"starts_at" timestamp,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "discount_usages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"discount_code_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"registration_id" uuid,
	"discount_amount_cents" integer NOT NULL,
	"used_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "family_member_parents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"family_member_id" uuid NOT NULL,
	"parent_user_id" uuid NOT NULL,
	"relationship" varchar(30),
	"is_primary" boolean DEFAULT false NOT NULL,
	"can_receive_messages" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attendance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"roster_id" uuid NOT NULL,
	"game_id" uuid,
	"event_date" timestamp NOT NULL,
	"event_type" "event_type" DEFAULT 'practice' NOT NULL,
	"status" "attendance_status" DEFAULT 'present' NOT NULL,
	"notes" text,
	"recorded_by_user_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "magic_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid,
	"user_id" uuid NOT NULL,
	"token_hash" varchar(255) NOT NULL,
	"purpose" varchar(50) NOT NULL,
	"purpose_context" jsonb,
	"expires_at" timestamp NOT NULL,
	"consumed_at" timestamp,
	"delivered_channel" varchar(20),
	"delivered_to" varchar(255),
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "magic_links_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "phone_opt_ins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid,
	"phone" varchar(20) NOT NULL,
	"status" varchar(20) NOT NULL,
	"opted_in_at" timestamp,
	"opted_out_at" timestamp,
	"opt_in_source" varchar(50),
	"stop_keyword_triggered" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "phone_verifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone" varchar(20) NOT NULL,
	"code_hash" varchar(255) NOT NULL,
	"purpose" varchar(50) NOT NULL,
	"purpose_context" jsonb,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"expires_at" timestamp NOT NULL,
	"consumed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "coach_resources" ALTER COLUMN "resource_type" SET DATA TYPE "public"."coach_resource_type" USING "resource_type"::text::"public"."coach_resource_type";--> statement-breakpoint
ALTER TABLE "skills" ADD COLUMN "comprehensive_guide" jsonb;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "phone_verified" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "messaging_primary_channel" varchar(20);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "messaging_fallback_channel" varchar(20);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "telegram_chat_id" varchar(100);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "telegram_username" varchar(100);--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN "comprehensive_guide" jsonb;--> statement-breakpoint
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bot_actions_log" ADD CONSTRAINT "bot_actions_log_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bot_actions_log" ADD CONSTRAINT "bot_actions_log_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bot_actions_log" ADD CONSTRAINT "bot_actions_log_triggered_by_message_id_conversation_messages_id_fk" FOREIGN KEY ("triggered_by_message_id") REFERENCES "public"."conversation_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bot_actions_log" ADD CONSTRAINT "bot_actions_log_reversed_by_user_id_users_id_fk" FOREIGN KEY ("reversed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_sender_user_id_users_id_fk" FOREIGN KEY ("sender_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_parent_user_id_users_id_fk" FOREIGN KEY ("parent_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_assigned_staff_id_users_id_fk" FOREIGN KEY ("assigned_staff_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discount_codes" ADD CONSTRAINT "discount_codes_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discount_codes" ADD CONSTRAINT "discount_codes_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discount_usages" ADD CONSTRAINT "discount_usages_discount_code_id_discount_codes_id_fk" FOREIGN KEY ("discount_code_id") REFERENCES "public"."discount_codes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_member_parents" ADD CONSTRAINT "family_member_parents_family_member_id_family_members_id_fk" FOREIGN KEY ("family_member_id") REFERENCES "public"."family_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_member_parents" ADD CONSTRAINT "family_member_parents_parent_user_id_users_id_fk" FOREIGN KEY ("parent_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_roster_id_rosters_id_fk" FOREIGN KEY ("roster_id") REFERENCES "public"."rosters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_recorded_by_user_id_users_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "magic_links" ADD CONSTRAINT "magic_links_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "magic_links" ADD CONSTRAINT "magic_links_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "phone_opt_ins" ADD CONSTRAINT "phone_opt_ins_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "phone_opt_ins" ADD CONSTRAINT "phone_opt_ins_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_conversation_messages_conversation" ON "conversation_messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_conversation_messages_org" ON "conversation_messages" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_conversation_messages_external" ON "conversation_messages" USING btree ("external_message_id");--> statement-breakpoint
CREATE INDEX "idx_conversations_org_parent" ON "conversations" USING btree ("organization_id","parent_user_id");--> statement-breakpoint
CREATE INDEX "idx_conversations_assignment" ON "conversations" USING btree ("organization_id","assignment_role","assigned_staff_id");--> statement-breakpoint
CREATE INDEX "idx_conversations_last_message" ON "conversations" USING btree ("organization_id","last_message_at");--> statement-breakpoint
CREATE INDEX "idx_curriculum_reviews_content" ON "curriculum_reviews" USING btree ("content_type","content_id");--> statement-breakpoint
CREATE INDEX "idx_curriculum_reviews_score" ON "curriculum_reviews" USING btree ("overall_score");--> statement-breakpoint
CREATE INDEX "idx_curriculum_reviews_sport" ON "curriculum_reviews" USING btree ("sport_name");--> statement-breakpoint
CREATE INDEX "idx_family_member_parents_family" ON "family_member_parents" USING btree ("family_member_id");--> statement-breakpoint
CREATE INDEX "idx_family_member_parents_parent" ON "family_member_parents" USING btree ("parent_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_family_member_parents_unique" ON "family_member_parents" USING btree ("family_member_id","parent_user_id");--> statement-breakpoint
CREATE INDEX "idx_magic_links_token_hash" ON "magic_links" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "idx_magic_links_user_purpose" ON "magic_links" USING btree ("user_id","purpose","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_phone_opt_ins_org_phone" ON "phone_opt_ins" USING btree ("organization_id","phone");--> statement-breakpoint
CREATE INDEX "idx_phone_verifications_phone" ON "phone_verifications" USING btree ("phone","created_at");