CREATE INDEX "age_groups_org_idx" ON "age_groups" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_magic_links_expires_at" ON "magic_links" USING btree ("expires_at");