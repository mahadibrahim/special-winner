CREATE TABLE "program_gear" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"program_id" uuid,
	"season_id" uuid,
	"required" boolean DEFAULT false NOT NULL,
	"price_cents" integer,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "program_gear_exactly_one_target" CHECK ((program_id IS NOT NULL)::int + (season_id IS NOT NULL)::int = 1)
);
--> statement-breakpoint
ALTER TABLE "program_gear" ADD CONSTRAINT "program_gear_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_gear" ADD CONSTRAINT "program_gear_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_gear" ADD CONSTRAINT "program_gear_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_program_gear_program" ON "program_gear" USING btree ("program_id");--> statement-breakpoint
CREATE INDEX "idx_program_gear_season" ON "program_gear" USING btree ("season_id");--> statement-breakpoint
CREATE INDEX "idx_program_gear_product" ON "program_gear" USING btree ("product_id");