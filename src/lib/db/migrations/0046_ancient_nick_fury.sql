DO $$ BEGIN
  CREATE TYPE "public"."drop_subscription_status" AS ENUM('incomplete', 'active', 'past_due', 'paused', 'cancelled');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "drop_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"drop_player_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"status" "drop_subscription_status" DEFAULT 'incomplete' NOT NULL,
	"registration_fee_paid" boolean DEFAULT false NOT NULL,
	"current_period_end" timestamp with time zone,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "drop_subscriptions" ADD CONSTRAINT "drop_subscriptions_drop_player_id_drop_players_id_fk" FOREIGN KEY ("drop_player_id") REFERENCES "public"."drop_players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drop_subscriptions" ADD CONSTRAINT "drop_subscriptions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drop_subscriptions" ADD CONSTRAINT "drop_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "drop_subscriptions_player_uniq" ON "drop_subscriptions" USING btree ("drop_player_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "drop_subscriptions_stripe_sub_uniq" ON "drop_subscriptions" USING btree ("stripe_subscription_id");
