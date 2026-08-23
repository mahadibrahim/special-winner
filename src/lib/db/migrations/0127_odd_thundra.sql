DROP INDEX "memberships_one_active_per_user_org";--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "membership_id" uuid;--> statement-breakpoint
ALTER TABLE "membership_tiers" ADD COLUMN "annual_fee_cents" integer;--> statement-breakpoint
ALTER TABLE "membership_tiers" ADD COLUMN "tagline" text;--> statement-breakpoint
ALTER TABLE "membership_tiers" ADD COLUMN "stripe_price_id_fee" text;--> statement-breakpoint
ALTER TABLE "memberships" ADD COLUMN "family_member_id" uuid;--> statement-breakpoint
ALTER TABLE "memberships" ADD COLUMN "fee_next_due_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_membership_id_memberships_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."memberships"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_family_member_id_family_members_id_fk" FOREIGN KEY ("family_member_id") REFERENCES "public"."family_members"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payments_membership_idx" ON "payments" USING btree ("membership_id");--> statement-breakpoint
CREATE UNIQUE INDEX "memberships_one_active_per_child_org" ON "memberships" USING btree ("organization_id","family_member_id") WHERE status IN ('active', 'paused', 'past_due', 'incomplete') AND family_member_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX "memberships_family_member_idx" ON "memberships" USING btree ("family_member_id");--> statement-breakpoint
CREATE UNIQUE INDEX "memberships_one_active_per_user_org" ON "memberships" USING btree ("user_id","organization_id") WHERE status IN ('active', 'paused', 'past_due', 'incomplete') AND family_member_id IS NULL;