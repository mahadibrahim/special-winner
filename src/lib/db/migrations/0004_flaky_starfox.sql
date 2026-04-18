CREATE TABLE "broadcast_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"initiator_id" uuid,
	"initiator_type" varchar(20) NOT NULL,
	"target_type" varchar(30) NOT NULL,
	"team_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"message_type" varchar(50) NOT NULL,
	"body" text NOT NULL,
	"is_urgent" boolean DEFAULT false NOT NULL,
	"scheduled_for" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"channels_used" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"delivery_summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"nonce" varchar(100),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scheduled_broadcasts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"team_id" uuid,
	"initiator_id" uuid,
	"message_type" varchar(50) NOT NULL,
	"body" text NOT NULL,
	"is_urgent" boolean DEFAULT false NOT NULL,
	"scheduled_for" timestamp with time zone NOT NULL,
	"cancel_if" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"fired_at" timestamp with time zone,
	"resulting_broadcast_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team_group_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_group_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" varchar(20) DEFAULT 'parent' NOT NULL,
	"joined_at" timestamp with time zone,
	"opted_out_at" timestamp with time zone,
	"removed_at" timestamp with time zone,
	"last_synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"program_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"telegram_chat_id" varchar(100),
	"audience_type" varchar(20) DEFAULT 'parents' NOT NULL,
	"name" varchar(128) NOT NULL,
	"invite_link" text,
	"status" varchar(30) DEFAULT 'scheduled' NOT NULL,
	"creation_scheduled_for" timestamp with time zone,
	"created_at" timestamp with time zone,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "reconciliation_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ran_at" timestamp with time zone DEFAULT now() NOT NULL,
	"team_group_id" uuid NOT NULL,
	"drift_detected" jsonb DEFAULT '{"added":[],"removed":[]}'::jsonb NOT NULL,
	"fixes_applied" jsonb DEFAULT '{"invited":[],"removed":[]}'::jsonb NOT NULL,
	"errors" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "conversation_messages" ADD COLUMN "team_group_id" uuid;--> statement-breakpoint
ALTER TABLE "conversation_messages" ADD COLUMN "broadcast_id" uuid;--> statement-breakpoint
ALTER TABLE "conversation_messages" ADD COLUMN "target_type" varchar(20) DEFAULT 'user' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "also_email_copy" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "programs" ADD COLUMN "audience_type" varchar(20) DEFAULT 'parents' NOT NULL;--> statement-breakpoint
ALTER TABLE "broadcast_log" ADD CONSTRAINT "broadcast_log_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "broadcast_log" ADD CONSTRAINT "broadcast_log_initiator_id_users_id_fk" FOREIGN KEY ("initiator_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_broadcasts" ADD CONSTRAINT "scheduled_broadcasts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_broadcasts" ADD CONSTRAINT "scheduled_broadcasts_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_broadcasts" ADD CONSTRAINT "scheduled_broadcasts_initiator_id_users_id_fk" FOREIGN KEY ("initiator_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_broadcasts" ADD CONSTRAINT "scheduled_broadcasts_resulting_broadcast_id_broadcast_log_id_fk" FOREIGN KEY ("resulting_broadcast_id") REFERENCES "public"."broadcast_log"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_group_memberships" ADD CONSTRAINT "team_group_memberships_team_group_id_team_groups_id_fk" FOREIGN KEY ("team_group_id") REFERENCES "public"."team_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_group_memberships" ADD CONSTRAINT "team_group_memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_groups" ADD CONSTRAINT "team_groups_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_groups" ADD CONSTRAINT "team_groups_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_groups" ADD CONSTRAINT "team_groups_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliation_log" ADD CONSTRAINT "reconciliation_log_team_group_id_team_groups_id_fk" FOREIGN KEY ("team_group_id") REFERENCES "public"."team_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "broadcast_log_org_idx" ON "broadcast_log" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "broadcast_log_initiator_idx" ON "broadcast_log" USING btree ("initiator_id");--> statement-breakpoint
CREATE INDEX "broadcast_log_nonce_idx" ON "broadcast_log" USING btree ("nonce");--> statement-breakpoint
CREATE INDEX "broadcast_log_sent_at_idx" ON "broadcast_log" USING btree ("sent_at");--> statement-breakpoint
CREATE INDEX "scheduled_broadcasts_org_idx" ON "scheduled_broadcasts" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "scheduled_broadcasts_team_idx" ON "scheduled_broadcasts" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "scheduled_broadcasts_status_idx" ON "scheduled_broadcasts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "scheduled_broadcasts_scheduled_for_idx" ON "scheduled_broadcasts" USING btree ("scheduled_for");--> statement-breakpoint
CREATE UNIQUE INDEX "team_group_memberships_group_user_unique" ON "team_group_memberships" USING btree ("team_group_id","user_id");--> statement-breakpoint
CREATE INDEX "team_group_memberships_group_idx" ON "team_group_memberships" USING btree ("team_group_id");--> statement-breakpoint
CREATE INDEX "team_group_memberships_user_idx" ON "team_group_memberships" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "team_groups_team_id_idx" ON "team_groups" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "team_groups_org_id_idx" ON "team_groups" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "team_groups_status_idx" ON "team_groups" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "team_groups_telegram_chat_id_unique" ON "team_groups" USING btree ("telegram_chat_id");--> statement-breakpoint
CREATE INDEX "reconciliation_log_team_group_idx" ON "reconciliation_log" USING btree ("team_group_id");--> statement-breakpoint
CREATE INDEX "reconciliation_log_ran_at_idx" ON "reconciliation_log" USING btree ("ran_at");

-- Manually added FKs (schema defined without .references() to avoid circular imports)
ALTER TABLE "conversation_messages"
  ADD CONSTRAINT "conversation_messages_team_group_id_fk"
  FOREIGN KEY ("team_group_id") REFERENCES "team_groups"("id") ON DELETE SET NULL;

ALTER TABLE "conversation_messages"
  ADD CONSTRAINT "conversation_messages_broadcast_id_fk"
  FOREIGN KEY ("broadcast_id") REFERENCES "broadcast_log"("id") ON DELETE SET NULL;