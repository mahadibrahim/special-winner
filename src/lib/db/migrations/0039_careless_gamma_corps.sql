-- Idempotent type statements (0023/0024 convention): tolerate a drifted
-- DB that already carries the type/value.
DO $$ BEGIN
 CREATE TYPE "public"."official_payment_status" AS ENUM('unpaid', 'paid');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
ALTER TYPE "public"."role_name" ADD VALUE IF NOT EXISTS 'referee';--> statement-breakpoint
CREATE TABLE "game_officials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"position" varchar(50) DEFAULT 'referee' NOT NULL,
	"fee_cents" integer DEFAULT 0 NOT NULL,
	"payment_status" "official_payment_status" DEFAULT 'unpaid' NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "game_officials_non_negative_fee" CHECK ("game_officials"."fee_cents" >= 0)
);
--> statement-breakpoint
ALTER TABLE "game_officials" ADD CONSTRAINT "game_officials_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_officials" ADD CONSTRAINT "game_officials_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "game_officials_game_user_uniq" ON "game_officials" USING btree ("game_id","user_id");--> statement-breakpoint
CREATE INDEX "game_officials_game_idx" ON "game_officials" USING btree ("game_id");--> statement-breakpoint
CREATE INDEX "game_officials_user_idx" ON "game_officials" USING btree ("user_id");