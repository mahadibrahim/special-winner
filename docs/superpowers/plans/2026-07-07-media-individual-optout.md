# Media Individual Opt-Out (Do-Not-Publish) — Implementation Plan

Product backlog build #3, **revised per owner decision 2026-07-07**: *"Media consent is INDIVIDUAL. Teams do not opt-out and can't opt-out."*

**What this is (and is NOT):** A per-**individual** opt-out / takedown flag — an admin marks a specific person (`family_member`) as "do not publish media of this person." It is the operational record behind takedown-on-request and gives photographers/editors a reference list of who not to feature. It is **NOT** a team-level gate: it must **NOT** block a team/wide session's media just because one individual on a roster opted out (the earlier team-blocking design is explicitly rejected by the owner). Consent/opt-out is individual; teams have no opt-out.

**Behavior:** The existing `checkSessionPublishConsent()` face-tag path already gates individually face-tagged media on a scoped `media_authorization` grant. This build adds: an opted-out individual's **face-tagged/featured** media is suppressed (opt-out wins for that individual, even over a stale consent row) — while **team-tag media keeps publishing by default** (unchanged). No roster-level blocking anywhere.

## Global Constraints
- Individual-keyed only: the `media_do_not_publish` table keys on `family_member_id` (+ org). No team/roster concept in the gate.
- `family_members` has no `organizationId` — scope via registrations→seasons→programs→locations. `requireSameOrgFamilyMember` **already exists** in `src/lib/auth/require-resource-ownership.ts` (added by incident reporting) — REUSE it, do NOT re-add.
- Migration: this branch is off post-#2 main → next is **0069** (verify `ls src/lib/db/migrations | tail`). Idempotent (0063/0065 pattern). `db:generate` → review → `./scripts/with-bws.sh npm run db:migrate` (confirmed staging).
- **CI-robust fixtures**: self-seed deterministic org/family_member rows in tests (explicit orderBy on lookups); run tests twice on a fresh `db:seed:e2e` to confirm idempotency (lesson from build #1).
- Tenant-scope every endpoint (`requireOrgAdminAccess` + `requireSameOrgFamilyMember`); `EmptyState`/`ErrorBanner` primitives; unit tests mock `@/lib/db`, API tests hit the dev server.
- Do NOT touch the face-tag consent path's requirement (still needs an affirmative scoped grant). Do NOT add team/roster blocking.

## Tasks (TDD; commit per task)

1. **Schema** — `src/lib/db/schema/media-do-not-publish.ts`: `media_do_not_publish` (id, organizationId FK cascade, familyMemberId FK cascade, reason text, active bool default true, setByUserId FK, removedByUserId FK nullable, removedAt, timestamps; partial-unique index one-active-per (org, familyMember) `WHERE active`; indexes org, familyMember). Export from `schema/index.ts`. `db:generate` → 0069 → idempotent review → `db:migrate`. Smoke test the import + the partial-unique constraint.

2. **Domain lib** — `src/lib/consents/do-not-publish.ts`: `setDoNotPublish` (insert active; if an active row exists for (org,fm) just update reason — read-then-insert/update in a txn if `onConflictDoUpdate` with a partial-index target isn't supported by the installed drizzle-orm; verify), `clearDoNotPublish` (set active=false, removedBy/At), `isDoNotPublish(db, orgId, familyMemberId)` (bool), `getDoNotPublishForOrg(db, orgId)` (list of active opted-out individuals — the photographer reference list), `getFaceTaggedDoNotPublishForSession(db, sessionId)` (individuals face-tagged in the session who are on the active opt-out list — for the publish gate). Unit tests (mock db): set inserts active; clear deactivates; list returns actives.

3. **Admin toggle endpoint** — `src/pages/api/admin/compliance/family-members/[id]/do-not-publish.ts`: PUT (set, optional reason) / DELETE (clear), `requireOrgAdminAccess` + `requireSameOrgFamilyMember` (reuse). Extend `GET /api/admin/compliance/family-members` to include each member's `doNotPublish: {active, reason} | {active:false}` (bulk fetch alongside the existing consent bulk fetch). API tests (self-seeded): PUT sets (200); GET reflects it; DELETE clears; cross-org fm 404; unauth 401.

4. **Publish gate — individual only** — edit `src/lib/consents/publish-check.ts` `checkSessionPublishConsent()`: the FACE-TAG path additionally suppresses any face-tagged individual on the active opt-out list (opt-out wins even if a consent row exists) — fold `getFaceTaggedDoNotPublishForSession` results into the `missing`/blocked set with a distinguishable reason (add a `doNotPublish: DoNotPublishMatch[]` field OR mark those entries). **Leave the team-tag path exactly as today (publishes by default — NO roster blocking).** Update the return shape additively so callers distinguish "opted out" from "missing consent". Unit tests (mock db): face-tagged + opted-out → blocked with opt-out reason; face-tagged + consent + NOT opted-out → publishes; team-tag only (no face tags) → publishes regardless of any roster member's opt-out (prove no roster blocking); face-tag consent present but individual opted-out → still blocked (opt-out wins).

5. **Publish endpoint surfacing** — `src/pages/api/admin/media/shoots/[id].ts` publish/PATCH: when blocked, surface the opt-out matches distinctly from missing-consent (422 with both arrays under `MEDIA_AUTH_HARD_BLOCK`; soft-warn log otherwise). API/extend existing media-shoots test.

6. **Photographer reference list** — `GET /api/media/jobs/[id]/do-not-publish` (or a session-scoped read): via `requireMediaStaffAccess` + `loadAssignedSession`, return the org's active opt-out individuals relevant to the shoot (the "do not feature these people" list). API tests: assigned photographer gets the list; unassigned 403; unauth 401.

7. **Admin UI toggle** — a per-person "Do not publish media" toggle on the compliance/family list (`src/components/admin/compliance-list.tsx` or wherever family consent status shows) → PUT/DELETE the Task 3 endpoint; optimistic update + ErrorBanner on failure. (Simple toggle, not a workflow.)

8. **Tenant isolation + pre-push** — cross-org test (Org A admin can't set/read Org B individual's flag); full checklist (db:seed:e2e, media + compliance test files, build, tsc 0).

## Key decisions
- Standalone `media_do_not_publish` table, individual-keyed (not a repurposed consents row, not team-scoped).
- Opt-out is individual and governs FEATURED/face-tagged content; team/wide media is never blocked by an individual opt-out (owner: teams can't opt out).
- Opt-out WINS over a stale face-tag consent grant for that individual (takedown intent beats an old yes).
- `requireSameOrgFamilyMember` reused from build #1 (do not re-add).

## Honest limitation (surface at PR)
An individual's opt-out cannot be perfectly enforced inside a wide team/group photo that happens to include them (no per-face detection) — it cleanly governs content that *features* the individual (face-tagged) + is the takedown-on-request record + the photographer "don't feature" list. Excluding opted-out kids from group shots would need per-face detection — a much larger, separate effort, not built here.

## Follow-on (not this PR)
- Retroactive unpublish sweep when a flag is set (v1 is forward-looking only).
- Per-face detection to honor opt-outs inside group shots.
