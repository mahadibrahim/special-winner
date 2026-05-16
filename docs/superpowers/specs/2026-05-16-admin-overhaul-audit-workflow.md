# Admin overhaul · stale-data cleanup workflow

**Phase 4 task 4.2.** Gated on running `scripts/admin-overhaul-audit.ts`
against a non-prod database with up-to-date prod-replica data.

The audit script alone is committed (Phase 4.1). The actual cleanup SQL
migration depends on the audit output and founder review — it can't be
written speculatively. This doc captures the workflow so the migration
can land before the PR merges.

## Workflow

1. **Run the audit against staging** (or a prod replica):
   ```bash
   DATABASE_URL=$STAGING_DATABASE_URL tsx scripts/admin-overhaul-audit.ts \
     > docs/superpowers/specs/2026-05-16-admin-overhaul-audit-output.md
   ```

2. **Founder reviews the output file.** Each section lists candidate
   orphan rows. Mark each row as `delete` or `keep` (e.g., a Sport with
   zero programs might still be intentional for an upcoming launch). The
   only sections that are safe to bulk-delete without judgment are the
   "should be impossible per schema" ones — those would represent real
   data-model violations and should be investigated, not deleted.

3. **Write the migration.** Create
   `src/lib/db/migrations/NNNN_phase4_stale_data_cleanup.sql` with
   explicit `DELETE … WHERE id IN (...)` statements per the founder's
   annotated list. Wrap the whole thing in a transaction. Each delete
   gets a comment naming what was removed:
   ```sql
   BEGIN;

   -- Sports with zero programs (founder-approved deletion list)
   DELETE FROM sports WHERE id IN (
     -- '00000000-…', -- "Old Sport Name"
   );

   COMMIT;
   ```

4. **Apply to staging first**, re-run the audit, confirm 0 rows in each
   targeted section.

5. **Commit the migration** in the same PR as the other admin-overhaul
   work; CI's `migrate-prod.yml` applies it on merge to main.

## Why this is gated

The plan §8 says the cleanup runs *before* the page consolidations (4.3
onward) so the new merged pages start clean. In practice, the page
consolidations don't break if orphan rows linger — they just look weird
("Sport with no programs" shows up in the new Programs page sport filter
with no associated rows underneath). So this can land either before or
after the consolidations, but should not slip past the PR merge.

## What if the founder is unavailable?

Skip the bulk-delete sections entirely and ship only the audit script.
The "should be impossible" assertions are still useful — they'll surface
any data-model violations the next time someone runs the audit.
