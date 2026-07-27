-- "One book listing, two formats": links a lulu_pod (print) product to the
-- digital product it's sold alongside. Idempotent (re-run-safe), same
-- pattern as 0114/0115.
ALTER TABLE "merch_products" ADD COLUMN IF NOT EXISTS "digital_companion_id" uuid;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "merch_products" ADD CONSTRAINT "merch_products_digital_companion_id_merch_products_id_fk" FOREIGN KEY ("digital_companion_id") REFERENCES "public"."merch_products"("id") ON DELETE set null ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;
