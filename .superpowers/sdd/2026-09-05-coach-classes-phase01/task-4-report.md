# Task 4 report — admin staffing UI for class templates

## Files

- `src/lib/admin/coach-candidates.ts` — new. `getOrgCoachCandidates(organizationId)`,
  based on the two-lookup-merged-and-deduped recipe at
  `src/pages/admin/teams/index.astro:34-95`. `src/pages/admin/teams/index.astro` itself
  is untouched (`git diff --stat` on it is empty).
- `src/components/admin/classes/template-staffing.tsx` — new client island: template
  default lead/assistants pickers + Save (with an "apply to already-scheduled
  sessions" checkbox and inline warning that it overwrites per-session overrides),
  and a list of future materialized sessions each with a "Change" action that opens
  an inline per-session lead/assistants editor. Toasts via sonner, `ErrorBanner` for
  load/save failures, `LoadingSkeleton` while loading. Calls `useHydrationBeacon()` —
  no other client:load component on this page carried it yet.
- `src/pages/admin/classes/[id].astro` — wired `TemplateStaffing` in alongside the
  existing `TemplateRoster`/`TemplateForm` islands; fetches `coachCandidates` via the
  new lib function and passes them as a prop.
- `tests/e2e/coach-classes.spec.ts` — new e2e spec.

## Deviation from the brief (found during TDD, fixed)

The brief said to extract the teams-page recipe "verbatim." I did, initially — and the
first e2e run failed for a **data** reason, not a test-authoring bug: the recipe's
"coach role" lookup scopes candidates via `inArray(users.id, orgUserIds)`, where
`orgUserIds` comes from `user_organization_access` membership. `coach@test.aspiresports.com`
(and `training+coach@test.aspiresports.com`) hold a real org-scoped `coach` role but have
**zero** `user_organization_access` rows — confirmed with a throwaway diagnostic script
against the running dev server's DB. The literal recipe silently omitted them from the
picker entirely, so the `<select>` never had an option for the exact fixture the brief's
own e2e scenario needs to pick.

Fix: the coach-role half of `getOrgCoachCandidates` now scopes via
`userRoles.scopeType === "organization"` AND `userRoles.scopeId === organizationId` —
the same condition `isOrgCoachingStaff` (the staffing PUT endpoints' actual write-time
gate) uses — instead of `user_organization_access` membership. This guarantees every id
surfaced by that half of the picker will pass server-side validation if selected. The
second half ("also include admins" / other org members via `user_organization_access`,
capped at 100) is left exactly as the teams page has it — that pool was never the
problem and isn't guaranteed-valid either way (a non-coach org member from it can still
422 if picked, same rough edge the teams page already has). `teams/index.astro` itself
is untouched, so this is a one-way improvement in the extracted copy, not a behavior
change to the page it was extracted from. Documented in `coach-candidates.ts`'s header
comment.

## TDD

Wrote `tests/e2e/coach-classes.spec.ts` and the UI together (component didn't exist
yet, so the first real run was the "does this fail for the right reason" check): first
run failed inside `selectOption` because the candidate `<select>` had no option for
either seeded coach — the data-scoping bug above, not a missing feature. Fixed
`coach-candidates.ts`, reran → green.

## Test evidence

```
$ ./scripts/with-bws.sh env PLAYWRIGHT_BASE_URL=http://localhost:4331 \
    npx playwright test tests/e2e/coach-classes.spec.ts --workers=1

  1 passed (23.5s)
```

Regression:

```
$ ./scripts/with-bws.sh env TEST_BASE_URL=http://localhost:4331 CRON_SECRET=classes-dash-cron \
    npx vitest run tests/api/coaching/ --config vitest.config.ts --project api

 Test Files  3 passed (3)
      Tests  36 passed (36)
```

- Grepped `tests/e2e/` for specs touching `/admin/classes` or `TemplateRoster`:
  `person-360.spec.ts` only mentions an unrelated endpoint (`admin/classes/credits/grant.ts`)
  in a comment — no page-level overlap, not run.
- `offering-wizard-camp.spec.ts` (flagged in the brief) drives `/admin/seasons`'s
  offering wizard — unrelated to `/admin/classes/[id]`, confirmed by inspection, not run.
- `npx tsc --noEmit` — clean, no output (checked before and after the coach-candidates
  fix).

## Notes

- Coach candidate cap: assistants capped at 2 client-side (`MAX_ASSISTANTS`, mirrors
  server's `MAX_ASSISTANT_COACHES`) with a toast if exceeded — the server 422 remains
  the actual enforcement point, this is just to avoid a round-trip for the common case.
- `applyToMaterialized` checkbox renders the brief-mandated warning inline (amber
  callout: "Overwrites the coach set on EVERY upcoming session... does not merge —
  it replaces") rather than a separate confirm dialog — kept consistent with this
  page's existing pattern (`template-form.tsx`'s inline cancel-sessions warning uses
  the same amber-callout-not-dialog convention).
- Testids implemented exactly as specified: `staffing-panel`, `staffing-lead-select`,
  `staffing-save`, `session-staffing-row`, `session-staffing-change`. Added a few
  unrequested extras for e2e/manual-test robustness (`session-staffing-lead-select`,
  `session-staffing-save`, `staffing-apply-to-materialized`,
  `staffing-assistant-checkbox-{id}`, `session-staffing-assistant-checkbox-{id}`).

## No other brief conflicts found.
