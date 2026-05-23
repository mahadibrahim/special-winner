ALTER TABLE "venues" ADD COLUMN "slug" varchar(64);--> statement-breakpoint
CREATE UNIQUE INDEX "venues_slug_unique" ON "venues" USING btree ("slug");