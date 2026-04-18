CREATE TABLE "user_nudge_state" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"nudge_key" varchar(50) NOT NULL,
	"last_shown_at" timestamp with time zone,
	"last_dismissed_at" timestamp with time zone,
	"dismissal_count" integer DEFAULT 0 NOT NULL,
	"tapped_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "user_nudge_state" ADD CONSTRAINT "user_nudge_state_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "user_nudge_state_user_key_unique" ON "user_nudge_state" USING btree ("user_id","nudge_key");--> statement-breakpoint
CREATE INDEX "user_nudge_state_user_idx" ON "user_nudge_state" USING btree ("user_id");