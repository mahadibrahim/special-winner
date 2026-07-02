DO $$ BEGIN CREATE TYPE "public"."feedback_request_kind" AS ENUM('nps_drop_in', 'nps_field_rental', 'nps_season', 'referee_rating'); EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."feedback_request_status" AS ENUM('pending', 'sent', 'responded', 'expired'); EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "feedback_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"brand" varchar(20) DEFAULT 'aspire' NOT NULL,
	"kind" "feedback_request_kind" NOT NULL,
	"target_id" uuid NOT NULL,
	"recipient_user_id" uuid NOT NULL,
	"game_official_id" uuid,
	"token_hash" varchar(255) NOT NULL,
	"status" "feedback_request_status" DEFAULT 'pending' NOT NULL,
	"sent_at" timestamp with time zone,
	"responded_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feedback_requests_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "nps_responses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"score" integer NOT NULL,
	"comment" text,
	"review_link_clicked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "nps_responses_request_id_unique" UNIQUE("request_id"),
	CONSTRAINT "nps_responses_score_range" CHECK ("nps_responses"."score" >= 0 AND "nps_responses"."score" <= 10)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "referee_ratings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"game_id" uuid NOT NULL,
	"referee_user_id" uuid NOT NULL,
	"overall" integer NOT NULL,
	"game_control" integer NOT NULL,
	"communication" integer NOT NULL,
	"fairness" integer NOT NULL,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "referee_ratings_request_id_unique" UNIQUE("request_id"),
	CONSTRAINT "referee_ratings_dimension_range" CHECK ("referee_ratings"."overall" BETWEEN 1 AND 5 AND "referee_ratings"."game_control" BETWEEN 1 AND 5 AND "referee_ratings"."communication" BETWEEN 1 AND 5 AND "referee_ratings"."fairness" BETWEEN 1 AND 5)
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "feedback_requests" ADD CONSTRAINT "feedback_requests_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "feedback_requests" ADD CONSTRAINT "feedback_requests_recipient_user_id_users_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "feedback_requests" ADD CONSTRAINT "feedback_requests_game_official_id_game_officials_id_fk" FOREIGN KEY ("game_official_id") REFERENCES "public"."game_officials"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "nps_responses" ADD CONSTRAINT "nps_responses_request_id_feedback_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."feedback_requests"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "referee_ratings" ADD CONSTRAINT "referee_ratings_request_id_feedback_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."feedback_requests"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "referee_ratings" ADD CONSTRAINT "referee_ratings_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "referee_ratings" ADD CONSTRAINT "referee_ratings_referee_user_id_users_id_fk" FOREIGN KEY ("referee_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "feedback_requests_dedupe_nps_uniq" ON "feedback_requests" USING btree ("kind","target_id","recipient_user_id") WHERE game_official_id IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "feedback_requests_dedupe_ref_uniq" ON "feedback_requests" USING btree ("kind","target_id","recipient_user_id","game_official_id") WHERE game_official_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "feedback_requests_recipient_kind_sent_idx" ON "feedback_requests" USING btree ("recipient_user_id","kind","sent_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "feedback_requests_org_kind_created_idx" ON "feedback_requests" USING btree ("organization_id","kind","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "feedback_requests_status_expires_idx" ON "feedback_requests" USING btree ("status","expires_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "referee_ratings_referee_created_idx" ON "referee_ratings" USING btree ("referee_user_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "referee_ratings_game_idx" ON "referee_ratings" USING btree ("game_id");
