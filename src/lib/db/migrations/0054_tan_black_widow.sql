ALTER TABLE "payments" ALTER COLUMN "registration_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "team_registration_id" uuid;--> statement-breakpoint
ALTER TABLE "team_registrations" ADD COLUMN "brand" varchar(20);--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_team_registration_id_team_registrations_id_fk" FOREIGN KEY ("team_registration_id") REFERENCES "public"."team_registrations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payments_team_registration_idx" ON "payments" USING btree ("team_registration_id");