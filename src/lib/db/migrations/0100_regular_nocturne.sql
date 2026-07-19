CREATE TYPE "public"."field_rental_player_status" AS ENUM('pending', 'signed');--> statement-breakpoint
ALTER TYPE "public"."self_service_token_kind" ADD VALUE IF NOT EXISTS 'rental_player' BEFORE 'roster_entry';--> statement-breakpoint
CREATE TABLE "field_rental_players" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rental_id" uuid NOT NULL,
	"player_name" text NOT NULL,
	"is_minor" boolean DEFAULT false NOT NULL,
	"signer_email" text NOT NULL,
	"status" "field_rental_player_status" DEFAULT 'pending' NOT NULL,
	"signer_name" text,
	"waiver_id" uuid,
	"content_hash" text,
	"signed_at" timestamp with time zone,
	"signed_ip" text,
	"signed_ua" text,
	"reminder_sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "field_rental_players" ADD CONSTRAINT "field_rental_players_rental_id_field_rentals_id_fk" FOREIGN KEY ("rental_id") REFERENCES "public"."field_rentals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "field_rental_players_rental_idx" ON "field_rental_players" USING btree ("rental_id");--> statement-breakpoint
CREATE INDEX "field_rental_players_pending_idx" ON "field_rental_players" USING btree ("rental_id") WHERE status = 'pending';