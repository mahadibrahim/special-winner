ALTER TABLE "class_credit_grants" DROP CONSTRAINT "class_credit_grants_pack_product_id_class_pack_products_id_fk";
--> statement-breakpoint
ALTER TABLE "class_credit_grants" DROP CONSTRAINT "class_credit_grants_block_id_class_blocks_id_fk";
--> statement-breakpoint
ALTER TABLE "class_credit_grants" ADD CONSTRAINT "class_credit_grants_pack_product_id_class_pack_products_id_fk" FOREIGN KEY ("pack_product_id") REFERENCES "public"."class_pack_products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_credit_grants" ADD CONSTRAINT "class_credit_grants_block_id_class_blocks_id_fk" FOREIGN KEY ("block_id") REFERENCES "public"."class_blocks"("id") ON DELETE restrict ON UPDATE no action;