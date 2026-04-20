CREATE TYPE "public"."media_tag_scope" AS ENUM('player', 'team', 'both_teams');--> statement-breakpoint
CREATE TYPE "public"."media_tag_source" AS ENUM('manual_staff', 'manual_offshore', 'manual_admin', 'auto_jersey_ocr', 'auto_face', 'burst_propagated');--> statement-breakpoint
CREATE TABLE "media_tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"media_asset_id" uuid NOT NULL,
	"family_member_id" uuid,
	"team_id" uuid,
	"tag_scope" "media_tag_scope" NOT NULL,
	"source" "media_tag_source" NOT NULL,
	"confidence" numeric(3, 2) DEFAULT '1.00' NOT NULL,
	"tagged_by_user_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "media_tags" ADD CONSTRAINT "media_tags_media_asset_id_media_assets_id_fk" FOREIGN KEY ("media_asset_id") REFERENCES "public"."media_assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_tags" ADD CONSTRAINT "media_tags_family_member_id_family_members_id_fk" FOREIGN KEY ("family_member_id") REFERENCES "public"."family_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_tags" ADD CONSTRAINT "media_tags_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_tags" ADD CONSTRAINT "media_tags_tagged_by_user_id_users_id_fk" FOREIGN KEY ("tagged_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "media_tags_unique_player" ON "media_tags" USING btree ("media_asset_id","family_member_id") WHERE "media_tags"."family_member_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "media_tags_unique_team" ON "media_tags" USING btree ("media_asset_id","team_id") WHERE "media_tags"."team_id" IS NOT NULL AND "media_tags"."family_member_id" IS NULL;--> statement-breakpoint
CREATE INDEX "media_tags_asset_idx" ON "media_tags" USING btree ("media_asset_id");--> statement-breakpoint
CREATE INDEX "media_tags_family_member_idx" ON "media_tags" USING btree ("family_member_id");--> statement-breakpoint
CREATE INDEX "media_tags_team_idx" ON "media_tags" USING btree ("team_id");