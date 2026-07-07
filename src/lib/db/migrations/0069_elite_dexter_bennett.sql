CREATE TABLE IF NOT EXISTS "media_do_not_publish" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"family_member_id" uuid NOT NULL,
	"reason" text,
	"active" boolean DEFAULT true NOT NULL,
	"set_by_user_id" uuid NOT NULL,
	"removed_by_user_id" uuid,
	"removed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "media_do_not_publish" ADD CONSTRAINT "media_do_not_publish_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "media_do_not_publish" ADD CONSTRAINT "media_do_not_publish_family_member_id_family_members_id_fk" FOREIGN KEY ("family_member_id") REFERENCES "public"."family_members"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "media_do_not_publish" ADD CONSTRAINT "media_do_not_publish_set_by_user_id_users_id_fk" FOREIGN KEY ("set_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "media_do_not_publish" ADD CONSTRAINT "media_do_not_publish_removed_by_user_id_users_id_fk" FOREIGN KEY ("removed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "media_do_not_publish_one_active_per_org_fm" ON "media_do_not_publish" USING btree ("organization_id","family_member_id") WHERE "media_do_not_publish"."active";--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "media_do_not_publish_org_idx" ON "media_do_not_publish" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "media_do_not_publish_family_member_idx" ON "media_do_not_publish" USING btree ("family_member_id");
