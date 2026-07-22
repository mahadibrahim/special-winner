ALTER TABLE "family_members" ALTER COLUMN "birth_date" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "registrations" ADD COLUMN IF NOT EXISTS "age_review_needed" boolean DEFAULT false NOT NULL;