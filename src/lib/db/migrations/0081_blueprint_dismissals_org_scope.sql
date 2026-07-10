-- Idempotent (0023/0024/0059/0073/0075/0076/0077/0078/0079/0080 convention).
-- Program Blueprint review fix (I2): blueprint_warning_dismissals is empty
-- in every environment (staging + prod) as of this migration -- the
-- dismissal-writing UI (Task 7) only just shipped on this branch -- so
-- adding organization_id needs no backfill and no legacy NULL row to
-- reconcile.
--
-- Closes a cross-tenant leak: a dismissal was keyed only by
-- (sequence_id, template_id). For a GLOBAL sequence (organization_id IS
-- NULL on curriculum_sequences, visible/attachable by every org), that meant
-- Org A dismissing a warning silently acknowledged it for every other org
-- that can see the same sequence too. organization_id records which org
-- actually clicked Acknowledge; dismissals.ts's write path and the
-- blueprint bootstrap's read path both scope by it now, so an org only
-- ever sees its own acknowledgements. Nullable (not backfilled to a
-- sentinel) because the column is new and there is nothing to backfill it
-- with -- every write from this point forward populates it.
ALTER TABLE "blueprint_warning_dismissals" ADD COLUMN IF NOT EXISTS "organization_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "blueprint_warning_dismissals" ADD CONSTRAINT "blueprint_warning_dismissals_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "blueprint_warning_dismissals_org_idx" ON "blueprint_warning_dismissals" USING btree ("organization_id");
