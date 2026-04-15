CREATE TABLE "staff_notification_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"staff_user_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"notification_type" varchar(30) NOT NULL,
	"delivered_channel" varchar(20),
	"sent_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "staff_notification_log" ADD CONSTRAINT "staff_notification_log_staff_user_id_users_id_fk" FOREIGN KEY ("staff_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_notification_log" ADD CONSTRAINT "staff_notification_log_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_staff_notification_staff_recent" ON "staff_notification_log" USING btree ("staff_user_id","sent_at");--> statement-breakpoint
CREATE INDEX "idx_staff_notification_conversation" ON "staff_notification_log" USING btree ("conversation_id");