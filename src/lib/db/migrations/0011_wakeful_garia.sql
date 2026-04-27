ALTER TABLE "family_members" ADD COLUMN "parental_consent_given_at" timestamp;--> statement-breakpoint
ALTER TABLE "family_members" ADD COLUMN "parental_consent_given_by" uuid;--> statement-breakpoint
ALTER TABLE "family_members" ADD COLUMN "parental_consent_ip" varchar(64);--> statement-breakpoint
ALTER TABLE "family_members" ADD COLUMN "photo_consent_given_at" timestamp;--> statement-breakpoint
ALTER TABLE "family_members" ADD COLUMN "photo_consent_given_by" uuid;--> statement-breakpoint
ALTER TABLE "family_members" ADD COLUMN "photo_consent_ip" varchar(64);--> statement-breakpoint
ALTER TABLE "family_members" ADD CONSTRAINT "family_members_parental_consent_given_by_users_id_fk" FOREIGN KEY ("parental_consent_given_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_members" ADD CONSTRAINT "family_members_photo_consent_given_by_users_id_fk" FOREIGN KEY ("photo_consent_given_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;