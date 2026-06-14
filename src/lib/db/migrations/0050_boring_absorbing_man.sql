ALTER TABLE "team_groups" ADD COLUMN "whatsapp_chat_id" varchar(100);--> statement-breakpoint
CREATE UNIQUE INDEX "team_groups_whatsapp_chat_id_unique" ON "team_groups" USING btree ("whatsapp_chat_id");--> statement-breakpoint
ALTER TABLE "teams" DROP COLUMN "whatsapp_group_id";