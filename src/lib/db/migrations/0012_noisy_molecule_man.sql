ALTER TABLE "family_members" ALTER COLUMN "parent_user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "family_members" ADD COLUMN "self_user_id" uuid;--> statement-breakpoint
ALTER TABLE "family_members" ADD CONSTRAINT "family_members_self_user_id_users_id_fk" FOREIGN KEY ("self_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "family_members_self_user_idx" ON "family_members" USING btree ("self_user_id");--> statement-breakpoint
ALTER TABLE "family_members" ADD CONSTRAINT "family_members_self_user_id_unique" UNIQUE("self_user_id");--> statement-breakpoint
ALTER TABLE "family_members"
ADD CONSTRAINT "family_members_self_xor_parent"
CHECK (
  (parent_user_id IS NOT NULL AND self_user_id IS NULL)
  OR
  (parent_user_id IS NULL AND self_user_id IS NOT NULL)
);