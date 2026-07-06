ALTER TABLE "job_applications" ADD COLUMN IF NOT EXISTS "hired_user_id" uuid;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "job_applications" ADD CONSTRAINT "job_applications_hired_user_id_users_id_fk" FOREIGN KEY ("hired_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;
