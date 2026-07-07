# In-App Incident Reporting Implementation Plan

> **For agentic workers:** implement task-by-task with TDD; steps use `- [ ]`. This is product-backlog build #1 (top priority) from the 2026-07 SOP review (`docs/product/backlog-from-sop-review-2026-07.md` §3). Scope decision (owner-agreed 2026-07-07): **v1 = fast same-day capture only**; the full finalization (`act.incident_report_finalization`) and 48h follow-up (`act.incident_followup`) workflows are an immediate follow-on — but the `incidents` table reserves their columns so no second migration is needed.

**Goal:** Staff (venue manager / event-lead-as-coach) capture incidents (injury, altercation, medical event, property damage) digitally, same-day, on a phone — replacing the paper `frm.incident_response.yaml` process, satisfying Ohio's youth-concussion remove-from-play/written-clearance obligations (ORC 3707.511, see `docs/operations/reference/safety-and-policy-standards.md` §5), and auto-closing the game's `act.incident_response` activity-tracking row on submit.

**Architecture:** New org-scoped `incidents` table (`src/lib/db/schema/incidents.ts`). `POST /api/staff/incidents` (gated to `location_admin`/`coach`/`super_admin`) creates rows; the subject is keyed by `family_member_id` when a registered participant (COPPA) or free text for bystanders/staff, enforced by a DB CHECK. Submission fires `markCompleteBySystemEvent(gameId, "evt.incident_response_filed")`. `/admin/incidents` list+detail read surface reuses `requireOrgAdminAccess` + `getLocationIdsForUser` venue scoping.

## Global Constraints
- Tenant-scope every endpoint via `requireSameOrg*` / an org-id pin — never skip.
- Every `.limit(1)`/`findFirst` gets an explicit `orderBy` (shared-CI-DB hazard).
- Schema: `npm run db:generate` → commit migration → `db:migrate` (never `db:push` remote). Idempotent SQL (drizzle-kit emits `IF NOT EXISTS` / `EXCEPTION WHEN duplicate_object`; verify).
- People model: participant subjects keyed by existing `family_member_id`, never free text; `resolvePerson()` NOT used (subjects are existing registrants).
- Forms: react-hook-form + zod; `ErrorBanner`/`EmptyState`/`LoadingSkeleton` primitives; `useHydrationBeacon()` on `client:load` islands driven by e2e.
- The ops catalog is loaded+cached once per process (`src/lib/activity-tracking/catalog-cache.ts`) — restart the dev server after a catalog YAML edit; `npm run catalog:validate` must pass.
- Pre-push checklist: `catalog:validate` → `db:seed:e2e` → `test:api` (CRON_SECRET matched) → `build` → `tsc --noEmit`.

## Tasks (each ends with an independently testable deliverable; commit per task)

1. **`incidents` schema + migration** — `src/lib/db/schema/incidents.ts` (table + enums `incident_type`, `incident_status`, `incident_subject_type`, `concussion_clearance_status`); export from `schema/index.ts`; `db:generate` (next number, likely 0067) + review idempotency + `db:migrate`. Columns: org/venue/game/reportedByUser FKs; `subjectType`, nullable `subjectFamilyMemberId` (FK) + `subjectFreeTextName`; the `frm.incident_response.yaml` field set (incidentType, occurredAt timestamptz, peopleInvolved, firstResponderName, immediateCareGiven, emergencyServicesCalled + callTime, suspectedConcussion, removedFromPlay, parentNotifiedOnsite); reserved-for-follow-on nullable `concussionClearanceStatus`, `insuranceRelevant`, `directorConsulted`; `status` default `open`; timestamps. **DB CHECK `incidents_subject_shape`**: `(subjectType='participant' AND subjectFamilyMemberId IS NOT NULL) OR (subjectType<>'participant' AND subjectFreeTextName IS NOT NULL)`. Indexes on (org,createdAt), venue, game, subjectFamilyMember.

2. **Auth + ownership helpers** — add `requireStaffAccess(context)` to `src/lib/auth/roles.ts` (mirror `requireCoachPortalAccess`; admits `super_admin`/`location_admin`/`coach`; returns `{authorized,user,roles,organizationId}`); add `requireSameOrgIncident(orgId,id)` and `requireSameOrgFamilyMember(orgId,familyMemberId)` (family_member → registrations → seasons → programs → locations.organizationId) to `require-resource-ownership.ts`. Unit tests: 401 no-session, 403 parent.

3. **Shared zod schema** — `src/lib/incidents/incident-schema.ts`: `createIncidentSchema` with a `subject` discriminated union (participant→familyMemberId uuid; bystander/staff/other→freeTextName). Consumed by the API route and the React form. Unit tests: valid bystander, valid participant, participant-without-id rejected, bad type rejected.

4. **Wire the activity** — set `act.incident_response.yaml` `tracking_method: system_event`, `tracking_artifact.event_type: evt.incident_response_filed`; add `docs/operations/catalog/artifacts/evt.incident_response_filed.yaml` (kind system_event). `catalog:validate` clean; restart dev server (cache).

5. **`POST /api/staff/incidents`** — `requireStaffAccess` → parse `createIncidentSchema` → `requireSameOrgVenue` (+ `requireSameOrgGame` if gameId, `requireSameOrgFamilyMember` if participant) → insert (concussionClearanceStatus='pending' when suspectedConcussion) → fire-and-forget `markCompleteBySystemEvent(gameId,"evt.incident_response_filed").catch(log)` → `201 {incident}`. API tests: 401; bystander create; participant keyed by family_member_id; suspected-concussion→pending; gameId auto-completes the activity_completions row; 400 malformed.

6. **`GET /api/staff/incidents/participants?q=`** — name search over org's family_members (≥2 chars, ilike first/last, de-dupe, cap 10), `requireStaffAccess`. API tests: 401; <2 chars empty; capped results.

7. **`GET /api/admin/incidents` + `/[id]`** — `requireOrgAdminAccess`; super_admin sees all org incidents, location_admin scoped to `getLocationIdsForUser` venues; `?status=` filter; detail via `requireSameOrgIncident` + venue-scope check + 404 unknown. API tests: 401; parent 403; list contains fixture; status filter; detail; 404.

8. **Middleware `/staff` route rule** — add `{kind:"role", pattern:/^\/staff(\/|$)/, roles:["location_admin","coach","super_admin"]}` to `ROUTE_RULES`. Unit test: matches `/staff` and `/staff/incidents/new`, admits the three roles.

9. **Mobile form + `/staff/incidents/new`** — `src/lib/incidents/incident-form-data.ts` (`getIncidentFormOptions`: scoped venues + games within ±12h); `src/components/staff/incident-report-form.tsx` (`client:load`, react-hook-form, participant-search picker, concussion→removed-from-play conditional with the Ohio note, confirmation state); the Astro page. Manual verify as coach@test.

10. **Admin list + detail pages** — `incidents-list.tsx` (status filter, table, concussion flag, EmptyState/LoadingSkeleton), `incident-detail.tsx` (definition list), the two Astro pages under `/admin/incidents` (NOT super-admin-only, so venue managers see their own). Manual verify as admin@test.

11. **Tenant-isolation + gating API tests** — staff cannot POST against another org's venue (404); Org A admin list never contains an Org B incident; Org A 404s reading an Org B incident by id. Then the full pre-push checklist.

## Key decisions (reviewed & accepted)
- Schema carries the full response-form field set + reserved Ohio-clearance columns now, but v1 builds only create/read for the fast form (finalization/follow-up follow-on, no new migration needed).
- Participant subjects keyed to `family_member_id` (DB CHECK enforced), validated tenant-owned; bystanders/staff free text.
- `role.event_lead` → app role `coach` (no dedicated role exists); `requireStaffAccess` admits location_admin/coach/super_admin.
- `act.incident_response` switches from `form` to `system_event` tracking so the dedicated endpoint auto-closes it via `markCompleteBySystemEvent`.

## Follow-on (not this PR)
- Finalization workflow (`act.incident_report_finalization`: witness statements, photos, post-event status) + follow-up (`act.incident_followup`: 48h outreach, goodwill coupon).
- An admin action to flip `concussionClearanceStatus` pending→received once written clearance is provided.
