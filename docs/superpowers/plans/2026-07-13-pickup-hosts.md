# Pickup Hosts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** GoodRec-style pickup hosts — a host application (careers ATS), an approve→host-profile lifecycle, a phone-first `/host` portal (claim, roster/check-in, teams, share, wrap-up), fill-state tracking, and SMS "game needs players" alert subscriptions with a 15-minute cron.

**Architecture:** New `host_profiles` table is the source of truth for who may host; `drop_in_sessions.hostUserId` links a host to a game; a `host_comp` $0 booking makes the host a real (capacity-counted) player. Alerts ride the existing `sendSms` opt-in pipeline via a new cron. The application extends `job_applications` with a `host` role plus R2 media uploads (presigned PUT — Netlify functions cap request bodies well under video size).

**Tech Stack:** Astro 5 + React 19, Drizzle/PostgreSQL, Lucia auth, Tailwind 4, R2 (S3 SDK presigner), Twilio/Zernio via `sendSms`, Vitest (tests/api, tests/unit), Playwright (tests/e2e).

**Spec:** `docs/superpowers/specs/2026-07-13-pickup-hosts-design.md` (owner-approved). Read it before starting any task.

## Global Constraints

- Branch: all work on `feat/pickup-hosts`. Run `git branch --show-current` before every edit session. If executing with subagents, use an isolated worktree (superpowers:using-git-worktrees) and pass its ABSOLUTE path in every subagent dispatch.
- Schema changes ship as ONE migration via `npm run db:generate` (expected `0087_*`). Never `db:push` against Railway. Edit generated `ALTER TYPE ... ADD VALUE` statements to `ADD VALUE IF NOT EXISTS`.
- Enum additions (values used only by later code, never by a later migration file in this PR) are safe under the per-file migration runner.
- Every admin endpoint: `requireOrgAdminAccess(context)` + pin resources to `auth.organizationId` (404 on cross-tenant, never 403). Every `findFirst`/`.limit(1)` on a multi-row-possible set gets an explicit `orderBy` (CI DB accumulates rows).
- Every host endpoint: `requireActiveHost`/`requireHostOfSession` from Task 2 — host powers exist ONLY on sessions where `hostUserId` = caller.
- All outbound SMS through `sendSms` (`src/lib/sms/send.ts`) — never call providers directly. `MESSAGING_MOCK=1` must keep working.
- UI: BaseLayout for pages; `ErrorBanner`/`EmptyState`/`LoadingSkeleton` from `src/components/ui/`; sonner `toast.error` for transient errors; `useHydrationBeacon()` on top-level `client:load` components of e2e-driven pages.
- Dev server for API tests: `R2_MOCK=1 MESSAGING_MOCK=1 E2E_TEST_ENDPOINTS=yes CRON_SECRET=test-cron-secret ./scripts/with-bws.sh npm run dev`. Test runs: `CRON_SECRET=test-cron-secret TEST_BASE_URL=http://localhost:4321 npm run test:api -- <file>`.
- Commit after every task (frequent small commits). Commit messages end with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Copy discipline: no eyebrow/kicker labels; no pay promises (hosting is unpaid — "play for free" is the only benefit claimed).

## File Structure

New files:
- `src/lib/db/schema/hosts.ts` — hostProfiles, pickupAlertSubscriptions, pickupAlertSends, hostGameReports (+ enums, types)
- `src/lib/auth/host.ts` — getHostProfile, requireActiveHost, requireHostOfSession
- `src/lib/dropin/host-assignment.ts` — assignHostToSession, removeHostFromSession (comp-booking lifecycle)
- `src/lib/dropin/attendance.ts` — applyAttendanceEntries (shared by admin + host endpoints)
- `src/lib/dropin/fill-state.ts` — deriveFillState (pure)
- `src/lib/dropin/share-blurb.ts` — buildShareBlurb (pure)
- `src/lib/dropin/fill-alerts.ts` — runFillAlertSweep (cron core)
- `src/pages/api/public/careers/upload-url.ts` — presigned PUT issuer
- `src/pages/api/admin/applications/[id]/approve-host.ts`
- `src/pages/api/admin/applications/[id]/media/[kind].ts`
- `src/pages/api/admin/dropin/sessions/[id]/host.ts` — PUT/DELETE host assignment
- `src/pages/api/admin/hosts/index.ts` (GET) and `src/pages/api/admin/hosts/[id].ts` (PATCH pause/revoke/reactivate)
- `src/pages/api/host/games/index.ts`, `.../games/[id]/index.ts`, `.../[id]/claim.ts`, `.../[id]/unclaim.ts`, `.../[id]/attendance.ts`, `.../[id]/teams.ts`, `.../[id]/report.ts`
- `src/pages/api/dropin/alerts/subscriptions/index.ts`, `.../subscriptions/[id].ts`
- `src/pages/api/cron/check-fill-alerts.ts` + `netlify/functions/scheduled-check-fill-alerts.ts`
- `src/pages/host/index.astro`, `src/pages/host/games/[id].astro`
- `src/components/host/HostDashboard.tsx`, `src/components/host/HostGameDay.tsx`
- `src/components/dropin/PickupAlertSignup.tsx`
- `src/components/admin/dropin/HostsPanel.tsx`
- Tests: `tests/api/host/*.test.ts`, `tests/api/careers/host-apply.test.ts`, `tests/api/cron/fill-alerts.test.ts`, `tests/api/dropin/alert-subscriptions.test.ts`, `tests/unit/dropin-fill-state.test.ts`, `tests/unit/dropin-share-blurb.test.ts`, `tests/e2e/host-portal.spec.ts`, `tests/utils/host-helpers.ts`

Modified files:
- `src/lib/db/schema/drop-in.ts` (host_comp enum value; sessions.hostUserId + fillAlertSentAt; bookings.referralSource; rate card fillAlert* columns)
- `src/lib/db/schema/job-applications.ts` (host enum value + host media/answer columns)
- `src/lib/db/schema/ops-pings.ts` + `src/lib/ops/format.ts` (host_incident ping kind)
- `src/lib/db/schema/index.ts` (export hosts)
- `src/lib/storage/r2.ts` (getSignedPutUrl)
- `src/lib/careers/application-schema.ts`, `src/lib/careers/roles.ts`, `src/pages/api/public/careers/apply.ts`, `src/components/careers/application-form.tsx`
- `src/middleware.ts` (ROUTE_RULES /host)
- `src/pages/api/admin/dropin/sessions/[id]/attendance.ts` (extract shared core)
- `src/pages/api/admin/dropin/sessions/[id]/cancel.ts` (host notify + comp cancel)
- `src/pages/api/dropin/sessions/index.ts` + `[id].ts` (fill config in defaults; host block)
- `src/pages/api/dropin/bookings/index.ts`, `src/lib/dropin/booking.ts`, `src/lib/dropin/create-checkout.ts` + Stripe webhook booking insert (referralSource)
- `src/components/dropin/SessionCard.tsx` (fill chip), `SessionDetail.tsx` (host block), `BookButton.tsx` (src param)
- `src/components/admin/dropin/SessionForm.tsx`, `AdminSessionDetail.tsx`, `src/pages/admin/dropins.astro`, `src/components/admin/applications-list.tsx`
- `src/pages/adult/pickup.astro`, `src/pages/soccerone/pickup.astro`, `src/pages/dropin/index.astro`, `src/pages/dashboard/play.astro` (alert signup card)
- `src/lib/db/seeds/seed-e2e-tests.ts` (host fixture)

---

### Task 1: Schema — hosts tables, drop-in columns, application columns, one migration

**Files:**
- Create: `src/lib/db/schema/hosts.ts`
- Modify: `src/lib/db/schema/drop-in.ts`, `src/lib/db/schema/job-applications.ts`, `src/lib/db/schema/ops-pings.ts`, `src/lib/ops/format.ts`, `src/lib/db/schema/index.ts`
- Create (generated): `src/lib/db/migrations/0087_*.sql`

**Interfaces:**
- Produces: `hostProfiles`, `hostProfileStatusEnum`, `pickupAlertSubscriptions`, `pickupAlertSends`, `hostGameReports` tables + `HostProfile`, `PickupAlertSubscription`, `HostGameReport` types; `dropInSessions.hostUserId`, `dropInSessions.fillAlertSentAt`, `dropInBookings.referralSource`, `dropInRateCard.fillAlertWindowHours` (default 24), `dropInRateCard.fillAlertThresholdPct` (default 60); `drop_in_payment_method` gains `host_comp`; `job_application_role` gains `host`; `jobApplications` gains `dateOfBirth`, `gamesPlayed`, `weeklyCommitment`, `photoKey`, `motivationVideoKey`, `demoVideoKey`; `ops_ping_kind` gains `host_incident`.
- Note: host application **bio** is stored in the existing `jobApplications.experience` column (form labels it "Bio"); approval copies it to `hostProfiles.bio`.

- [ ] **Step 1: Create `src/lib/db/schema/hosts.ts`**

```typescript
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  varchar,
  timestamp,
  boolean,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { venues } from "./teams";
import { users } from "./users";
import { jobApplications } from "./job-applications";
import { dropInSessions } from "./drop-in";

/**
 * Pickup hosts — GoodRec-style community volunteers. A host_profiles row is
 * the source of truth for "this user may host pickup games in this org";
 * the session link is drop_in_sessions.host_user_id. Hosts are unpaid and
 * play free in games they host (a $0 `host_comp` booking).
 * See docs/superpowers/specs/2026-07-13-pickup-hosts-design.md.
 */

export const hostProfileStatusEnum = pgEnum("host_profile_status", [
  "active",
  "paused",
  "revoked",
]);

export const hostProfiles = pgTable(
  "host_profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    status: hostProfileStatusEnum("status").notNull().default("active"),
    preferredVenueId: uuid("preferred_venue_id").references(() => venues.id, {
      onDelete: "set null",
    }),
    bio: text("bio"),
    // R2 object key, not a URL (signed URLs expire) — same convention as
    // job_applications.resume_key.
    photoKey: text("photo_key"),
    applicationId: uuid("application_id").references(() => jobApplications.id, {
      onDelete: "set null",
    }),
    approvedByUserId: uuid("approved_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("host_profiles_user_org_unique").on(table.userId, table.organizationId),
    index("host_profiles_org_status_idx").on(table.organizationId, table.status),
  ],
);

/**
 * "Text me when games need players" subscriptions. venueId/sport NULL =
 * all locations / all sports. Uniqueness is enforced at the API layer
 * (lookup-then-insert) rather than a partial NULLS NOT DISTINCT index;
 * the fill-alert dispatcher additionally dedupes per user per session.
 */
export const pickupAlertSubscriptions = pgTable(
  "pickup_alert_subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    venueId: uuid("venue_id").references(() => venues.id, { onDelete: "cascade" }),
    // Matches drop_in_sessions.sport_or_class_label (no sport FK exists).
    sport: varchar("sport", { length: 100 }),
    active: boolean("active").notNull().default(true),
    unsubscribedAt: timestamp("unsubscribed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("pickup_alert_subs_user_idx").on(table.userId, table.organizationId),
    index("pickup_alert_subs_org_active_idx").on(table.organizationId, table.active),
  ],
);

/**
 * One row per fill-alert SMS actually dispatched. Backs the per-user daily
 * cap (max 2/day) and post-hoc attribution.
 */
export const pickupAlertSends = pgTable(
  "pickup_alert_sends",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => dropInSessions.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("pickup_alert_sends_user_sent_idx").on(table.userId, table.sentAt),
    index("pickup_alert_sends_session_idx").on(table.sessionId),
  ],
);

/**
 * Host wrap-up report — one per session. No-show marking is NOT here (it
 * reuses drop_in_bookings.status = 'no_show').
 */
export const hostGameReports = pgTable(
  "host_game_reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => dropInSessions.id, { onDelete: "cascade" }),
    hostProfileId: uuid("host_profile_id")
      .notNull()
      .references(() => hostProfiles.id, { onDelete: "cascade" }),
    summary: text("summary").notNull(),
    incidentFlagged: boolean("incident_flagged").notNull().default(false),
    incidentDetails: text("incident_details"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("host_game_reports_session_unique").on(table.sessionId)],
);

export type HostProfile = typeof hostProfiles.$inferSelect;
export type NewHostProfile = typeof hostProfiles.$inferInsert;
export type PickupAlertSubscription = typeof pickupAlertSubscriptions.$inferSelect;
export type NewPickupAlertSubscription = typeof pickupAlertSubscriptions.$inferInsert;
export type HostGameReport = typeof hostGameReports.$inferSelect;
```

- [ ] **Step 2: Modify `src/lib/db/schema/drop-in.ts`**

Add `"host_comp"` to `dropInPaymentMethodEnum` (after `"member_allotment"`):

```typescript
export const dropInPaymentMethodEnum = pgEnum("drop_in_payment_method", [
  "card_online",
  "card_present",
  "member_unlimited",
  "member_allotment",
  // Host's free seat in a game they host (GoodRec model) — created/cancelled
  // by src/lib/dropin/host-assignment.ts, always amount_paid_cents = 0.
  "host_comp",
]);
```

In `dropInSessions`, after `createdByUserId`:

```typescript
    // Community host running this game (GoodRec model). Writes must verify
    // the user holds an ACTIVE host_profiles row in this org — enforced in
    // src/lib/dropin/host-assignment.ts, never set this column directly.
    hostUserId: uuid("host_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    // Stamped when the one-and-only "needs players" alert blast for this
    // session is claimed by the cron (stamp-then-send; see fill-alerts.ts).
    fillAlertSentAt: timestamp("fill_alert_sent_at", { withTimezone: true }),
```

In `dropInBookings`, after `brand`:

```typescript
    // ?src= attribution present at booking time (host-share | fill-alert | …).
    referralSource: varchar("referral_source", { length: 40 }),
```

In `dropInRateCard`, after `checkInWindowMinutes`:

```typescript
  // Fill-alert config: a scheduled pickup session qualifies for the alert
  // blast when it starts within `fillAlertWindowHours` and its seat count is
  // under `fillAlertThresholdPct` % of capacity.
  fillAlertWindowHours: integer("fill_alert_window_hours").notNull().default(24),
  fillAlertThresholdPct: integer("fill_alert_threshold_pct").notNull().default(60),
```

- [ ] **Step 3: Modify `src/lib/db/schema/job-applications.ts`**

Add `"host"` to `jobApplicationRoleEnum`; add columns after `resumeKey`:

```typescript
export const jobApplicationRoleEnum = pgEnum("job_application_role", [
  "referee",
  "coach",
  "staff",
  "host",
]);
```

```typescript
  // --- Host-application-only fields (null for other roles) ---------------
  // Bio lives in `experience` (the form labels it "Bio" for hosts).
  dateOfBirth: varchar("date_of_birth", { length: 10 }), // YYYY-MM-DD
  gamesPlayed: varchar("games_played", { length: 10 }), // 0 | 1-3 | 3-5 | 5+
  weeklyCommitment: boolean("weekly_commitment"),
  photoKey: text("photo_key"), // R2 keys under careers/hosts/
  motivationVideoKey: text("motivation_video_key"),
  demoVideoKey: text("demo_video_key"),
```

- [ ] **Step 4: Add `host_incident` ops-ping kind**

In `src/lib/db/schema/ops-pings.ts`, add `"host_incident"` to `opsPingKindEnum` (before `"test"`). In `src/lib/ops/format.ts`:
- Add to `OpsPingEvent` union: `| { kind: "host_incident"; brand: string; eventId: string; label: string }`
- Add `"host_incident"` to `INSTANT_KINDS`.
- Add to `OPS_PING_KIND_LABELS`: `host_incident: "Host incident",` and to `KIND_EMOJI`: `host_incident: "🚨",`.

- [ ] **Step 5: Export from schema index**

In `src/lib/db/schema/index.ts`, after `export * from "./drop-in";` add:

```typescript
export * from "./hosts";
```

- [ ] **Step 6: Generate + review the migration**

Run: `./scripts/with-bws.sh npm run db:generate`
Expected: one new file `src/lib/db/migrations/0087_<name>.sql` containing CREATE TYPE `host_profile_status`, 4 CREATE TABLEs, ALTER TABLE adds for `drop_in_sessions`/`drop_in_bookings`/`drop_in_rate_card`/`job_applications`, and `ALTER TYPE` ADD VALUEs for `drop_in_payment_method`, `job_application_role`, `ops_ping_kind`.

Edit every `ALTER TYPE ... ADD VALUE 'x';` to `ALTER TYPE ... ADD VALUE IF NOT EXISTS 'x';` (drifted-DB safety, 0023/0024 pattern). Verify no `DROP` statements were generated (a DROP means the local schema drifted — stop and investigate, do not commit a destructive migration).

- [ ] **Step 7: Type check + commit**

Run: `npx tsc --noEmit`
Expected: 0 errors.

```bash
git add src/lib/db/schema/ src/lib/db/migrations/ src/lib/ops/format.ts
git commit -m "feat(hosts): schema — host profiles, alert subscriptions, host columns + migration 0087"
```

---

### Task 2: Host auth helpers

**Files:**
- Create: `src/lib/auth/host.ts`
- Test: covered by the first consuming endpoints (Task 3 + Task 7 API tests — this repo has no DB-connected unit tier; helpers are exercised over HTTP).

**Interfaces:**
- Consumes: `hostProfiles` (Task 1), `context.locals.user` / `context.locals.organization` (middleware).
- Produces:
  - `getHostProfile(userId: string, organizationId: string): Promise<HostProfile | null>`
  - `requireActiveHost(context: APIContext): Promise<HostAuth>` where `HostAuth = { authorized: true; userId: string; organizationId: string; profile: HostProfile } | { authorized: false; response: Response }`
  - `requireHostOfSession(context: APIContext, sessionId: string): Promise<HostSessionAuth>` where the success arm additionally carries `session: DropInSession`

- [ ] **Step 1: Write `src/lib/auth/host.ts`**

```typescript
import type { APIContext } from "astro";
import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { hostProfiles, type HostProfile } from "@/lib/db/schema/hosts";
import { dropInSessions, type DropInSession } from "@/lib/db/schema/drop-in";

/**
 * Host authorization helpers (coach-helper pattern, src/lib/auth/roles.ts).
 * A "host" is not an RBAC role: authorization = an ACTIVE host_profiles row
 * in the request org, and per-session powers require additionally that
 * drop_in_sessions.host_user_id = the caller. 404 (not 403) on wrong-session
 * access, mirroring require-resource-ownership's cross-tenant convention.
 */

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export async function getHostProfile(
  userId: string,
  organizationId: string,
): Promise<HostProfile | null> {
  const [profile] = await getDb()
    .select()
    .from(hostProfiles)
    .where(
      and(
        eq(hostProfiles.userId, userId),
        eq(hostProfiles.organizationId, organizationId),
      ),
    )
    .orderBy(asc(hostProfiles.createdAt))
    .limit(1);
  return profile ?? null;
}

export type HostAuth =
  | {
      authorized: true;
      userId: string;
      organizationId: string;
      profile: HostProfile;
    }
  | { authorized: false; response: Response };

export async function requireActiveHost(context: APIContext): Promise<HostAuth> {
  const user = context.locals.user;
  if (!user) {
    return { authorized: false, response: json({ error: "Unauthorized" }, 401) };
  }
  const org = context.locals.organization;
  if (!org) {
    return {
      authorized: false,
      response: json({ error: "No organization context" }, 400),
    };
  }
  const profile = await getHostProfile(user.id, org.id);
  if (!profile || profile.status !== "active") {
    return {
      authorized: false,
      response: json(
        { error: "Not an active host", hostStatus: profile?.status ?? null },
        403,
      ),
    };
  }
  return { authorized: true, userId: user.id, organizationId: org.id, profile };
}

export type HostSessionAuth =
  | {
      authorized: true;
      userId: string;
      organizationId: string;
      profile: HostProfile;
      session: DropInSession;
    }
  | { authorized: false; response: Response };

export async function requireHostOfSession(
  context: APIContext,
  sessionId: string,
): Promise<HostSessionAuth> {
  const base = await requireActiveHost(context);
  if (!base.authorized) return base;

  const [session] = await getDb()
    .select()
    .from(dropInSessions)
    .where(
      and(
        eq(dropInSessions.id, sessionId),
        eq(dropInSessions.organizationId, base.organizationId),
        eq(dropInSessions.hostUserId, base.userId),
      ),
    )
    .limit(1);
  if (!session) {
    return {
      authorized: false,
      response: json({ error: "Session not found" }, 404),
    };
  }
  return { ...base, session };
}
```

- [ ] **Step 2: Type check + commit**

Run: `npx tsc --noEmit` — expected 0 errors.

```bash
git add src/lib/auth/host.ts
git commit -m "feat(hosts): host auth helpers (requireActiveHost, requireHostOfSession)"
```

---

### Task 3: Host assignment lib + admin assign/remove endpoint

**Files:**
- Create: `src/lib/dropin/host-assignment.ts`, `src/pages/api/admin/dropin/sessions/[id]/host.ts`, `tests/utils/host-helpers.ts`
- Test: `tests/api/host/admin-assign.test.ts`

**Interfaces:**
- Consumes: `hostProfiles`, `dropInSessions.hostUserId`, `host_comp` payment method (Task 1); `requireOrgAdminAccess` + `callerCanActOnVenue` (existing).
- Produces:
  - `assignHostToSession(opts: { sessionId: string; hostUserId: string; allowReplace?: boolean }): Promise<AssignHostResult>` with `AssignHostResult = { ok: true; compBookingId: string | null } | { ok: false; code: "session_not_found" | "session_not_scheduled" | "not_active_host" | "already_hosted"; message: string }`
  - `removeHostFromSession(opts: { sessionId: string; reason: "admin_removed" | "host_unclaimed" | "session_cancelled" | "host_revoked" }): Promise<{ removedHostUserId: string | null; cancelledCompBookingId: string | null }>`
  - HTTP: `PUT /api/admin/dropin/sessions/:id/host` body `{ hostUserId }` → 200 `{ ok: true }` | 409 `{ code: "already_hosted" }` | 400 `{ code: "not_active_host" }`; `DELETE` → 200 `{ ok: true }`
  - Test helper: `createTestHost(opts: { organizationId: string; preferredVenueId?: string | null; status?: "active" | "paused" | "revoked" }): Promise<{ userId: string; profileId: string; email: string }>`

- [ ] **Step 1: Write the failing test `tests/api/host/admin-assign.test.ts`**

First create `tests/utils/host-helpers.ts`:

```typescript
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema/users";
import { hostProfiles } from "@/lib/db/schema/hosts";

export async function createTestHost(opts: {
  organizationId: string;
  preferredVenueId?: string | null;
  status?: "active" | "paused" | "revoked";
}) {
  const db = getDb();
  const email = `host-${Date.now()}-${Math.random().toString(36).slice(2)}@t.example`;
  const [u] = await db
    .insert(users)
    .values({ email, firstName: "Test", lastName: "Host" })
    .returning();
  const [profile] = await db
    .insert(hostProfiles)
    .values({
      userId: u.id,
      organizationId: opts.organizationId,
      status: opts.status ?? "active",
      preferredVenueId: opts.preferredVenueId ?? null,
      bio: "Test host bio",
    })
    .returning();
  return { userId: u.id, profileId: profile.id, email };
}
```

Then the test (lib-level, like `book-confirmed.test.ts`):

```typescript
import { describe, it, expect } from "vitest";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { dropInSessions, dropInBookings } from "@/lib/db/schema/drop-in";
import { assignHostToSession, removeHostFromSession } from "@/lib/dropin/host-assignment";
import { createTestDropInSession } from "../../utils/dropin-helpers";
import { createTestHost } from "../../utils/host-helpers";

describe("assignHostToSession", () => {
  it("sets hostUserId and creates a confirmed $0 host_comp booking", async () => {
    const ctx = await createTestDropInSession({ capacity: 10 });
    const host = await createTestHost({ organizationId: ctx.organizationId });

    const result = await assignHostToSession({
      sessionId: ctx.sessionId,
      hostUserId: host.userId,
    });
    expect(result.ok).toBe(true);

    const [session] = await getDb()
      .select()
      .from(dropInSessions)
      .where(eq(dropInSessions.id, ctx.sessionId));
    expect(session.hostUserId).toBe(host.userId);

    const [comp] = await getDb()
      .select()
      .from(dropInBookings)
      .where(
        and(
          eq(dropInBookings.sessionId, ctx.sessionId),
          eq(dropInBookings.userId, host.userId),
        ),
      );
    expect(comp.status).toBe("confirmed");
    expect(comp.paymentMethod).toBe("host_comp");
    expect(comp.amountPaidCents).toBe(0);
  });

  it("assigns even when the session is full (comp booking bypasses capacity)", async () => {
    const ctx = await createTestDropInSession({ capacity: 0 });
    const host = await createTestHost({ organizationId: ctx.organizationId });
    const result = await assignHostToSession({
      sessionId: ctx.sessionId,
      hostUserId: host.userId,
    });
    expect(result.ok).toBe(true);
  });

  it("rejects a non-active host profile", async () => {
    const ctx = await createTestDropInSession({});
    const host = await createTestHost({
      organizationId: ctx.organizationId,
      status: "paused",
    });
    const result = await assignHostToSession({
      sessionId: ctx.sessionId,
      hostUserId: host.userId,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("not_active_host");
  });

  it("rejects when already hosted (without allowReplace) and replaces with it", async () => {
    const ctx = await createTestDropInSession({});
    const hostA = await createTestHost({ organizationId: ctx.organizationId });
    const hostB = await createTestHost({ organizationId: ctx.organizationId });

    expect((await assignHostToSession({ sessionId: ctx.sessionId, hostUserId: hostA.userId })).ok).toBe(true);

    const conflict = await assignHostToSession({ sessionId: ctx.sessionId, hostUserId: hostB.userId });
    expect(conflict.ok).toBe(false);
    if (!conflict.ok) expect(conflict.code).toBe("already_hosted");

    const replaced = await assignHostToSession({
      sessionId: ctx.sessionId,
      hostUserId: hostB.userId,
      allowReplace: true,
    });
    expect(replaced.ok).toBe(true);

    // Host A's comp booking is cancelled by the replacement.
    const [aComp] = await getDb()
      .select()
      .from(dropInBookings)
      .where(
        and(
          eq(dropInBookings.sessionId, ctx.sessionId),
          eq(dropInBookings.userId, hostA.userId),
        ),
      );
    expect(aComp.status).toBe("cancelled");
  });

  it("cross-org host is rejected", async () => {
    const ctx = await createTestDropInSession({});
    const otherOrg = await createTestDropInSession({});
    const foreignHost = await createTestHost({ organizationId: otherOrg.organizationId });
    const result = await assignHostToSession({
      sessionId: ctx.sessionId,
      hostUserId: foreignHost.userId,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("not_active_host");
  });
});

describe("removeHostFromSession", () => {
  it("clears hostUserId and cancels the comp booking", async () => {
    const ctx = await createTestDropInSession({});
    const host = await createTestHost({ organizationId: ctx.organizationId });
    await assignHostToSession({ sessionId: ctx.sessionId, hostUserId: host.userId });

    const removed = await removeHostFromSession({
      sessionId: ctx.sessionId,
      reason: "admin_removed",
    });
    expect(removed.removedHostUserId).toBe(host.userId);

    const [session] = await getDb()
      .select()
      .from(dropInSessions)
      .where(eq(dropInSessions.id, ctx.sessionId));
    expect(session.hostUserId).toBeNull();

    const [comp] = await getDb()
      .select()
      .from(dropInBookings)
      .where(
        and(
          eq(dropInBookings.sessionId, ctx.sessionId),
          eq(dropInBookings.userId, host.userId),
        ),
      );
    expect(comp.status).toBe("cancelled");
    expect(comp.cancellationReason).toBe("admin_override");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `CRON_SECRET=test-cron-secret TEST_BASE_URL=http://localhost:4321 npm run test:api -- tests/api/host/admin-assign.test.ts`
Expected: FAIL — cannot resolve `@/lib/dropin/host-assignment`.

- [ ] **Step 3: Write `src/lib/dropin/host-assignment.ts`**

```typescript
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { dropInSessions, dropInBookings } from "@/lib/db/schema/drop-in";
import { hostProfiles } from "@/lib/db/schema/hosts";

/**
 * Host↔session lifecycle. The ONLY writers of drop_in_sessions.host_user_id.
 *
 * Comp booking: assigning creates a confirmed $0 `host_comp` booking so the
 * host occupies a real seat in every capacity count — but creation BYPASSES
 * the capacity gate (owner decision: the host runs the game either way, so a
 * full game may overfill by exactly one). If the host already holds an
 * active booking on the session (booked as a player first), we keep that
 * booking and create nothing — compBookingId is null in that case.
 *
 * Both functions lock the session row FOR UPDATE: claim races resolve to
 * one winner, and remove-vs-assign can't interleave.
 */

export type AssignHostResult =
  | { ok: true; compBookingId: string | null }
  | {
      ok: false;
      code:
        | "session_not_found"
        | "session_not_scheduled"
        | "not_active_host"
        | "already_hosted";
      message: string;
    };

export async function assignHostToSession(opts: {
  sessionId: string;
  hostUserId: string;
  allowReplace?: boolean;
}): Promise<AssignHostResult> {
  const db = getDb();
  return await db.transaction(async (tx): Promise<AssignHostResult> => {
    const [session] = await tx
      .select()
      .from(dropInSessions)
      .where(eq(dropInSessions.id, opts.sessionId))
      .for("update");
    if (!session) {
      return { ok: false, code: "session_not_found", message: "Session not found" };
    }
    if (session.status !== "scheduled") {
      return {
        ok: false,
        code: "session_not_scheduled",
        message: "Session is not open for hosting",
      };
    }
    if (session.hostUserId && session.hostUserId !== opts.hostUserId) {
      if (!opts.allowReplace) {
        return {
          ok: false,
          code: "already_hosted",
          message: "Session already has a host",
        };
      }
      await cancelCompBookingTx(tx, opts.sessionId, session.hostUserId);
    }

    const [profile] = await tx
      .select({ id: hostProfiles.id, status: hostProfiles.status })
      .from(hostProfiles)
      .where(
        and(
          eq(hostProfiles.userId, opts.hostUserId),
          eq(hostProfiles.organizationId, session.organizationId),
        ),
      )
      .limit(1);
    if (!profile || profile.status !== "active") {
      return {
        ok: false,
        code: "not_active_host",
        message: "User is not an active host in this organization",
      };
    }

    await tx
      .update(dropInSessions)
      .set({ hostUserId: opts.hostUserId, updatedAt: new Date() })
      .where(eq(dropInSessions.id, opts.sessionId));

    // Comp booking — skip if the host already holds an active booking
    // (unique partial index would reject the insert anyway; this keeps the
    // player-then-host path clean).
    const existing = await tx
      .select({ id: dropInBookings.id })
      .from(dropInBookings)
      .where(
        and(
          eq(dropInBookings.sessionId, opts.sessionId),
          eq(dropInBookings.userId, opts.hostUserId),
          sql`${dropInBookings.status} IN ('confirmed', 'waitlisted', 'pending_claim', 'pending_payment')`,
        ),
      );
    if (existing.length > 0) {
      return { ok: true, compBookingId: null };
    }

    const [comp] = await tx
      .insert(dropInBookings)
      .values({
        sessionId: opts.sessionId,
        userId: opts.hostUserId,
        status: "confirmed",
        source: "online_booking",
        paymentMethod: "host_comp",
        amountPaidCents: 0,
      })
      .returning();
    return { ok: true, compBookingId: comp.id };
  });
}

export async function removeHostFromSession(opts: {
  sessionId: string;
  reason: "admin_removed" | "host_unclaimed" | "session_cancelled" | "host_revoked";
}): Promise<{ removedHostUserId: string | null; cancelledCompBookingId: string | null }> {
  const db = getDb();
  return await db.transaction(async (tx) => {
    const [session] = await tx
      .select({ hostUserId: dropInSessions.hostUserId })
      .from(dropInSessions)
      .where(eq(dropInSessions.id, opts.sessionId))
      .for("update");
    if (!session?.hostUserId) {
      return { removedHostUserId: null, cancelledCompBookingId: null };
    }
    await tx
      .update(dropInSessions)
      .set({ hostUserId: null, updatedAt: new Date() })
      .where(eq(dropInSessions.id, opts.sessionId));
    const cancelledCompBookingId = await cancelCompBookingTx(
      tx,
      opts.sessionId,
      session.hostUserId,
    );
    return { removedHostUserId: session.hostUserId, cancelledCompBookingId };
  });
}

type Tx = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];

/** Cancel the host's comp booking (only host_comp rows — a paid player
 * booking held by the same user is never touched). */
async function cancelCompBookingTx(
  tx: Tx,
  sessionId: string,
  hostUserId: string,
): Promise<string | null> {
  const [cancelled] = await tx
    .update(dropInBookings)
    .set({
      status: "cancelled",
      cancellationReason: "admin_override",
      cancelledAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(dropInBookings.sessionId, sessionId),
        eq(dropInBookings.userId, hostUserId),
        eq(dropInBookings.paymentMethod, "host_comp"),
        sql`${dropInBookings.status} IN ('confirmed', 'waitlisted', 'pending_claim', 'pending_payment')`,
      ),
    )
    .returning({ id: dropInBookings.id });
  return cancelled?.id ?? null;
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `CRON_SECRET=test-cron-secret TEST_BASE_URL=http://localhost:4321 npm run test:api -- tests/api/host/admin-assign.test.ts`
Expected: PASS (all 7).

- [ ] **Step 5: Write `src/pages/api/admin/dropin/sessions/[id]/host.ts`**

```typescript
import type { APIRoute } from "astro";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { dropInSessions } from "@/lib/db/schema/drop-in";
import { requireOrgAdminAccess } from "@/lib/auth/roles";
import { callerCanActOnVenue } from "@/lib/admin/require-location-scope";
import {
  assignHostToSession,
  removeHostFromSession,
} from "@/lib/dropin/host-assignment";

export const prerender = false;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

/** Tenant + location guard shared by PUT and DELETE. */
async function guardSession(context: Parameters<APIRoute>[0], orgId: string) {
  const id = context.params.id;
  if (!id) return { error: json({ error: "session id required" }, 400) };
  const [session] = await getDb()
    .select({ id: dropInSessions.id, venueId: dropInSessions.venueId })
    .from(dropInSessions)
    .where(and(eq(dropInSessions.id, id), eq(dropInSessions.organizationId, orgId)))
    .limit(1);
  if (!session) return { error: json({ error: "Session not found" }, 404) };
  if (!(await callerCanActOnVenue(context, session.venueId))) {
    return { error: json({ error: "Session not found" }, 404) };
  }
  return { id };
}

// PUT /api/admin/dropin/sessions/:id/host  { hostUserId, replace? }
export const PUT: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;
  const guard = await guardSession(context, auth.organizationId);
  if ("error" in guard) return guard.error;

  let body: { hostUserId?: string; replace?: boolean };
  try {
    body = await context.request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  if (!body.hostUserId) return json({ error: "hostUserId required" }, 400);

  const result = await assignHostToSession({
    sessionId: guard.id,
    hostUserId: body.hostUserId,
    allowReplace: body.replace === true,
  });
  if (!result.ok) {
    const status =
      result.code === "already_hosted" ? 409 :
      result.code === "session_not_found" ? 404 : 400;
    return json({ error: result.message, code: result.code }, status);
  }
  return json({ ok: true, compBookingId: result.compBookingId }, 200);
};

// DELETE /api/admin/dropin/sessions/:id/host
export const DELETE: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;
  const guard = await guardSession(context, auth.organizationId);
  if ("error" in guard) return guard.error;

  const result = await removeHostFromSession({
    sessionId: guard.id,
    reason: "admin_removed",
  });
  return json({ ok: true, removedHostUserId: result.removedHostUserId }, 200);
};
```

- [ ] **Step 6: Add HTTP-level tests to `tests/api/host/admin-assign.test.ts`**

Append a describe block. Fixtures must live under the default HQ org for HTTP (use `resolveDefaultOrgForHttpTests` from `tests/utils/dropin-helpers`):

```typescript
import { getAuthCookie, apiFetch } from "../setup/test-helpers";
import { resolveDefaultOrgForHttpTests } from "../../utils/dropin-helpers";

describe("PUT/DELETE /api/admin/dropin/sessions/:id/host", () => {
  it("admin assigns and removes a host over HTTP; cross-org session 404s", async () => {
    const cookie = await getAuthCookie("admin@test.aspiresports.com", "TestAdmin123!");
    const { organizationId, venueId } = await resolveDefaultOrgForHttpTests();
    const ctx = await createTestDropInSession({ organizationId, venueId });
    const host = await createTestHost({ organizationId });

    const put = await apiFetch(`/api/admin/dropin/sessions/${ctx.sessionId}/host`, {
      method: "PUT",
      cookie,
      body: JSON.stringify({ hostUserId: host.userId }),
      headers: { "Content-Type": "application/json" },
    });
    expect(put.status).toBe(200);

    const del = await apiFetch(`/api/admin/dropin/sessions/${ctx.sessionId}/host`, {
      method: "DELETE",
      cookie,
    });
    expect(del.status).toBe(200);

    // Cross-org: a session in a fresh (non-HQ) org must 404 for this admin.
    const foreign = await createTestDropInSession({});
    const crossOrg = await apiFetch(`/api/admin/dropin/sessions/${foreign.sessionId}/host`, {
      method: "PUT",
      cookie,
      body: JSON.stringify({ hostUserId: host.userId }),
      headers: { "Content-Type": "application/json" },
    });
    expect(crossOrg.status).toBe(404);
  });
});
```

(Check `tests/api/setup/test-helpers.ts` for `apiFetch`'s exact option shape before writing — if `cookie` is passed differently, match the existing usage in `tests/api/admin-tenant-scoping.test.ts`.)

- [ ] **Step 7: Run, verify pass, commit**

Run: `CRON_SECRET=test-cron-secret TEST_BASE_URL=http://localhost:4321 npm run test:api -- tests/api/host/admin-assign.test.ts`
Expected: PASS.

```bash
git add src/lib/dropin/host-assignment.ts "src/pages/api/admin/dropin/sessions/[id]/host.ts" tests/api/host/ tests/utils/host-helpers.ts
git commit -m "feat(hosts): host assignment lib with comp booking + admin assign endpoint"
```

---

### Task 4: Careers backend — host role, schema, presigned uploads, apply endpoint

**Files:**
- Modify: `src/lib/careers/roles.ts`, `src/lib/careers/application-schema.ts`, `src/pages/api/public/careers/apply.ts`, `src/lib/storage/r2.ts`
- Create: `src/pages/api/public/careers/upload-url.ts`
- Test: `tests/api/careers/host-apply.test.ts`

**Interfaces:**
- Consumes: `jobApplications` host columns (Task 1); existing `putObject`, `verifyTurnstile`, `rateLimit`.
- Produces:
  - `getSignedPutUrl(key: string, contentType: string, expiresInSeconds?: number): Promise<string>` in r2.ts
  - `POST /api/public/careers/upload-url` body `{ kind: "photo" | "motivation_video" | "demo_video"; contentType: string; sizeBytes: number }` → 200 `{ url: string; key: string }`
  - `jobApplicationSchema` accepts role `"host"` + fields `dateOfBirth` (YYYY-MM-DD), `gamesPlayed` (`"0" | "1-3" | "3-5" | "5+"`), `weeklyCommitment` (`"yes" | "no"`), `photoKey`, `motivationVideoKey`, `demoVideoKey` (strings starting `careers/hosts/`), all required when role === "host" (enforced via `superRefine`). The bio goes into the existing `experience` field.
  - `HOST_UPLOAD_LIMITS` export: `{ photo: { maxBytes: 5MB, types: [jpeg,png,webp] }, video: { maxBytes: 100MB, types: [mp4,quicktime,webm] } }`

- [ ] **Step 1: Write the failing test `tests/api/careers/host-apply.test.ts`**

Follow the existing `tests/api/careers/apply.test.ts` conventions (read it first for the FormData/fetch pattern). Cover:

```typescript
import { describe, it, expect } from "vitest";
import { apiFetch } from "../setup/test-helpers";

function hostForm(overrides: Record<string, string> = {}) {
  const form = new FormData();
  const base: Record<string, string> = {
    role: "host",
    firstName: "Hope",
    lastName: "Hoster",
    email: `host-apply-${Date.now()}@t.example`,
    phone: "6145550100",
    preferredLocation: "worthington",
    experience: "I bring the energy. Four sentences of bio.",
    dateOfBirth: "1998-04-02",
    gamesPlayed: "5+",
    weeklyCommitment: "yes",
    photoKey: "careers/hosts/test-photo.jpg",
    motivationVideoKey: "careers/hosts/test-motivation.mp4",
    demoVideoKey: "careers/hosts/test-demo.mp4",
    ...overrides,
  };
  for (const [k, v] of Object.entries(base)) form.set(k, v);
  return form;
}

describe("POST /api/public/careers/apply — host role", () => {
  it("accepts a complete host application", async () => {
    const res = await apiFetch("/api/public/careers/apply", {
      method: "POST",
      body: hostForm(),
    });
    expect(res.status).toBe(200);
  });

  it("rejects a host application missing host-required fields", async () => {
    const form = hostForm();
    form.delete("motivationVideoKey");
    const res = await apiFetch("/api/public/careers/apply", { method: "POST", body: form });
    expect(res.status).toBe(400);
  });

  it("rejects media keys outside the careers/hosts/ prefix", async () => {
    const res = await apiFetch("/api/public/careers/apply", {
      method: "POST",
      body: hostForm({ photoKey: "../../etc/passwd" }),
    });
    expect(res.status).toBe(400);
  });

  it("referee applications still work without host fields", async () => {
    const form = new FormData();
    form.set("role", "referee");
    form.set("firstName", "Ref");
    form.set("lastName", "Eree");
    form.set("email", `ref-${Date.now()}@t.example`);
    form.set("experience", "USSF grade 8, two seasons.");
    const res = await apiFetch("/api/public/careers/apply", { method: "POST", body: form });
    expect(res.status).toBe(200);
  });
});

describe("POST /api/public/careers/upload-url", () => {
  it("issues a key + url for a valid video request (R2_MOCK)", async () => {
    const res = await apiFetch("/api/public/careers/upload-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "motivation_video",
        contentType: "video/mp4",
        sizeBytes: 50 * 1024 * 1024,
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.key).toMatch(/^careers\/hosts\/[0-9a-f-]+\.mp4$/);
    expect(typeof body.url).toBe("string");
  });

  it("rejects oversize and wrong-type uploads", async () => {
    const over = await apiFetch("/api/public/careers/upload-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "photo", contentType: "image/jpeg", sizeBytes: 6 * 1024 * 1024 }),
    });
    expect(over.status).toBe(400);
    const wrongType = await apiFetch("/api/public/careers/upload-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "demo_video", contentType: "application/x-msdownload", sizeBytes: 1024 }),
    });
    expect(wrongType.status).toBe(400);
  });
});
```

Note: the apply test relies on Turnstile being open in dev (no `TURNSTILE_SECRET_KEY` on the test dev server) — same assumption the existing apply tests make; verify against `tests/api/careers/apply.test.ts` and mirror however it handles the token.

- [ ] **Step 2: Run to verify failure**

Run: `CRON_SECRET=test-cron-secret TEST_BASE_URL=http://localhost:4321 npm run test:api -- tests/api/careers/host-apply.test.ts`
Expected: FAIL — host role 400s (enum rejects "host") and upload-url 404s.

- [ ] **Step 3: Add `getSignedPutUrl` to `src/lib/storage/r2.ts`**

After `putObject`:

```typescript
export async function getSignedPutUrl(
  key: string,
  contentType: string,
  expiresInSeconds = 900
): Promise<string> {
  if (process.env.R2_MOCK === "1") return `https://mock-r2.local/put/${key}`;
  return getSignedUrl(
    client(),
    new PutObjectCommand({ Bucket: bucket(), Key: key, ContentType: contentType }),
    { expiresIn: expiresInSeconds }
  );
}
```

- [ ] **Step 4: Update `src/lib/careers/application-schema.ts`**

```typescript
import { z } from "zod";

export const APPLICATION_ROLES = ["referee", "coach", "staff", "host"] as const;
export const APPLICATION_LOCATIONS = ["worthington", "downtown", "either"] as const;
export const APPLICATION_AVAILABILITY = ["weeknights", "weekends", "mornings"] as const;
export const APPLICATION_GAMES_PLAYED = ["0", "1-3", "3-5", "5+"] as const;

/**
 * Server-issued R2 keys handed back by the form — never client-invented
 * paths. The https URL arm is the no-R2 degrade path (spec: when R2 env is
 * absent, upload fields become link inputs — YouTube/Loom/Drive links).
 */
const hostMediaKey = z.union([
  z.string().regex(/^careers\/hosts\/[A-Za-z0-9._-]+$/, "Invalid upload reference"),
  z.string().url().startsWith("https://").max(500),
]);

export const jobApplicationSchema = z
  .object({
    role: z.enum(APPLICATION_ROLES),
    firstName: z.string().trim().min(1).max(100),
    lastName: z.string().trim().min(1).max(100),
    email: z.string().trim().toLowerCase().email().max(320),
    phone: z.string().trim().max(30).optional(),
    preferredLocation: z.enum(APPLICATION_LOCATIONS).optional(),
    certifications: z.string().trim().max(2000).optional(),
    experience: z.string().trim().min(1).max(5000),
    availability: z.array(z.enum(APPLICATION_AVAILABILITY)).max(3).default([]),
    source: z.string().trim().max(200).optional(),
    // Host-only (validated required for role === "host" below)
    dateOfBirth: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
      .optional(),
    gamesPlayed: z.enum(APPLICATION_GAMES_PLAYED).optional(),
    weeklyCommitment: z.enum(["yes", "no"]).optional(),
    photoKey: hostMediaKey.optional(),
    motivationVideoKey: hostMediaKey.optional(),
    demoVideoKey: hostMediaKey.optional(),
  })
  .superRefine((data, ctx) => {
    if (data.role !== "host") return;
    const required: Array<keyof typeof data> = [
      "phone",
      "dateOfBirth",
      "gamesPlayed",
      "weeklyCommitment",
      "photoKey",
      "motivationVideoKey",
      "demoVideoKey",
    ];
    for (const field of required) {
      if (!data[field]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [field],
          message: "Required for host applications",
        });
      }
    }
  });

export type JobApplicationInput = z.infer<typeof jobApplicationSchema>;
```

- [ ] **Step 5: Create `src/pages/api/public/careers/upload-url.ts`**

```typescript
import type { APIRoute } from "astro";
import { randomUUID } from "node:crypto";
import { getSignedPutUrl } from "@/lib/storage/r2";
import { rateLimit, rateLimitedResponse } from "@/lib/auth/rate-limit";

export const prerender = false;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

/**
 * POST /api/public/careers/upload-url
 *
 * Issues a short-lived presigned R2 PUT for host-application media. Direct-
 * to-R2 because Netlify function bodies cap far below video size (~6MB).
 * The returned `key` is what the apply form submits back (validated against
 * the careers/hosts/ prefix by jobApplicationSchema).
 *
 * NOTE (ops, one-time): the R2 bucket needs a CORS rule allowing PUT from
 * the app origins for browser uploads to succeed. Documented in the PR.
 */
const LIMITS = {
  photo: {
    maxBytes: 5 * 1024 * 1024,
    types: { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" },
  },
  motivation_video: {
    maxBytes: 100 * 1024 * 1024,
    types: { "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm" },
  },
  demo_video: {
    maxBytes: 100 * 1024 * 1024,
    types: { "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm" },
  },
} as const;

export const POST: APIRoute = async ({ request, clientAddress }) => {
  const ip = clientAddress ?? "unknown";
  const limit = rateLimit(`careers-upload-url:ip:${ip}`, 10, 60_000);
  if (!limit.allowed) return rateLimitedResponse(limit.retryAfter ?? 60);

  let body: { kind?: string; contentType?: string; sizeBytes?: number };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const kind = body.kind as keyof typeof LIMITS;
  const spec = LIMITS[kind];
  if (!spec) return json({ error: "Unknown upload kind" }, 400);

  const ext = spec.types[body.contentType as keyof typeof spec.types];
  if (!ext) return json({ error: "Unsupported file type" }, 400);

  const size = Number(body.sizeBytes);
  if (!Number.isFinite(size) || size <= 0 || size > spec.maxBytes) {
    return json(
      { error: `File must be ${Math.round(spec.maxBytes / 1024 / 1024)} MB or smaller` },
      400,
    );
  }

  const key = `careers/hosts/${randomUUID()}.${ext}`;
  let url: string;
  try {
    url = await getSignedPutUrl(key, String(body.contentType));
  } catch (err) {
    // R2 env absent (local dev without storage config) — tell the client to
    // degrade to link inputs. Never a 500: this is an expected local state.
    console.warn("[careers] upload-url unavailable (R2 not configured)", err);
    return json({ error: "Uploads unavailable", code: "storage_unavailable" }, 503);
  }
  return json({ url, key }, 200);
};
```

- [ ] **Step 6: Update `src/pages/api/public/careers/apply.ts`**

In the `jobApplicationSchema.safeParse({...})` call, add the new fields:

```typescript
    dateOfBirth: form.get("dateOfBirth") || undefined,
    gamesPlayed: form.get("gamesPlayed") || undefined,
    weeklyCommitment: form.get("weeklyCommitment") || undefined,
    photoKey: form.get("photoKey") || undefined,
    motivationVideoKey: form.get("motivationVideoKey") || undefined,
    demoVideoKey: form.get("demoVideoKey") || undefined,
```

The insert currently spreads `...parsed.data` — `weeklyCommitment` is `"yes" | "no"` but the column is boolean, so destructure before insert. Replace the `.values({...})` block with:

```typescript
    const { weeklyCommitment, ...rest } = parsed.data;
    [application] = await getDb()
      .insert(jobApplications)
      .values({
        organizationId: locals.organization?.id ?? null,
        brand,
        ...rest,
        weeklyCommitment:
          weeklyCommitment === undefined ? null : weeklyCommitment === "yes",
        resumeKey,
      })
      .returning();
```

- [ ] **Step 7: Add the host entry to `src/lib/careers/roles.ts`**

Change the interface id union to `"referee" | "coach" | "staff" | "host"` and append:

```typescript
  {
    id: "host",
    title: "Pickup Host",
    timing: "Ongoing — volunteer role",
    blurb:
      "Lead the pickup games you already love. Hosts greet players, run check-in, split the teams, and set the tone — and play free in every game they host.",
    points: [
      "Unpaid community role — your game is on us whenever you host",
      "Commit to hosting at least once a week at your home facility",
      "Application includes a short intro video — show us your energy",
    ],
  },
```

- [ ] **Step 8: Run tests, verify pass, commit**

Run: `CRON_SECRET=test-cron-secret TEST_BASE_URL=http://localhost:4321 npm run test:api -- tests/api/careers/host-apply.test.ts tests/api/careers/apply.test.ts`
Expected: PASS (new + pre-existing apply tests — the schema change must not break referee/coach/staff).

```bash
git add src/lib/careers/ src/lib/storage/r2.ts src/pages/api/public/careers/ tests/api/careers/host-apply.test.ts
git commit -m "feat(hosts): host career role, application schema, presigned media uploads"
```

---

### Task 5: Application form UI — host fields + direct uploads

**Files:**
- Modify: `src/components/careers/application-form.tsx`

**Interfaces:**
- Consumes: `POST /api/public/careers/upload-url` (Task 4), `APPLICATION_GAMES_PLAYED` (Task 4).
- Produces: when role `host` is selected the form shows DOB, games played, weekly commitment, bio (relabeled `experience`), photo + two video upload fields; on submit it uploads each file to its presigned URL first, then posts keys with the form.

- [ ] **Step 1: Read `src/components/careers/application-form.tsx` fully** (246 lines) to learn its react-hook-form + zod resolver wiring, role selector state, and submit handler.

- [ ] **Step 2: Add an upload helper + field component in the same file**

```tsx
type UploadKind = "photo" | "motivation_video" | "demo_video";

async function uploadHostMedia(kind: UploadKind, file: File): Promise<string> {
  const res = await fetch("/api/public/careers/upload-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind, contentType: file.type, sizeBytes: file.size }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? "Could not start the upload");
  }
  const { url, key } = await res.json();
  const put = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": file.type },
    body: file,
  });
  if (!put.ok) throw new Error("Upload failed — please try again");
  return key;
}

function HostMediaField(props: {
  label: string;
  hint: string;
  kind: UploadKind;
  accept: string;
  value: string | null; // uploaded key
  uploading: boolean;
  error: string | null;
  onFile: (file: File) => void;
}) {
  return (
    <div>
      <label className="block text-sm font-medium">{props.label}</label>
      <p className="text-sm text-muted-foreground">{props.hint}</p>
      <input
        type="file"
        accept={props.accept}
        disabled={props.uploading}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) props.onFile(file);
        }}
      />
      {props.uploading && <p className="text-sm">Uploading…</p>}
      {props.value && !props.uploading && <p className="text-sm">✓ Uploaded</p>}
      {props.error && <p className="text-sm text-destructive">{props.error}</p>}
    </div>
  );
}
```

Match the file's existing class names / input styling — the snippet above is the logic; restyle its wrappers to whatever the surrounding fields use.

- [ ] **Step 3: Wire host-only fields into the form**

- Keep media keys + upload state in component state: `const [hostMedia, setHostMedia] = useState<Record<UploadKind, { key: string | null; uploading: boolean; error: string | null }>>(...)`. Per-file retry = the user just picks the file again (state is per-kind, answers persist because they live in react-hook-form).
- When the selected role is `"host"`, render (in this order): phone becomes required (asterisk + validation via the shared schema), date of birth (`<input type="date">` → YYYY-MM-DD string), games played select from `APPLICATION_GAMES_PLAYED`, weekly commitment yes/no radio ("Can you commit to hosting at least once a week?"), relabel the experience textarea to "Bio — 3–4 sentences, this is shown to players", photo `HostMediaField` (accept `image/jpeg,image/png,image/webp`), motivation video (accept `video/mp4,video/quicktime,video/webm`, hint: "1–2 minutes: why do you want to host, and how would you handle a heated argument between players?"), demo video (same accept, hint: "Film yourself greeting a group and explaining the game rules — like it's game day").
- On submit for role host: block submit if any upload is in-flight or any key missing (surface via the form's existing error summary / `ErrorBanner` pattern); append `photoKey`, `motivationVideoKey`, `demoVideoKey`, `dateOfBirth`, `gamesPlayed`, `weeklyCommitment` to the FormData the form already builds.
- **Degrade path:** when `uploadHostMedia` gets a 503 `storage_unavailable` from upload-url, flip that field (all three fields — track a single `linksMode` boolean set on first 503) to a plain `https://` URL text input ("Paste a link — YouTube, Loom, or Drive") whose value is submitted in the same `photoKey`/`motivationVideoKey`/`demoVideoKey` FormData fields (the schema's URL arm accepts it).

- [ ] **Step 4: Manual verification**

Run: dev server up → open `http://localhost:4321/careers`, pick Pickup Host, fill the form, attach small test files (any jpg + mp4). With `R2_MOCK=1` the presigned PUT goes to `mock-r2.local` and fails — verify the failure is caught and shown per-field (that IS the degrade path working); then verify a submit with missing uploads is blocked with a visible message. Verify referee form is unchanged.

- [ ] **Step 5: Build + commit**

Run: `npm run build` (SSR/prerender regressions) and `npx tsc --noEmit`.

```bash
git add src/components/careers/application-form.tsx
git commit -m "feat(hosts): host application form fields + direct R2 uploads"
```

---

### Task 6: Approve-host endpoint + admin applications review UI

**Files:**
- Create: `src/pages/api/admin/applications/[id]/approve-host.ts`, `src/pages/api/admin/applications/[id]/media/[kind].ts`
- Modify: `src/components/admin/applications-list.tsx`
- Test: `tests/api/host/approve-host.test.ts`

**Interfaces:**
- Consumes: `hostProfiles` (Task 1), `createMagicLink`/`buildMagicLinkUrl`, `ensureCustomerOrgMembership(db, userId, organizationId)` (`src/lib/organization/ensure-membership.ts`), `sendEmail`/`fromForBrand`/`isEmailConfigured` (`@/lib/email`), `getSignedGetUrl` (r2.ts).
- Produces:
  - `POST /api/admin/applications/:id/approve-host` → 200 `{ approved: true, userId, hostProfileId, createdNewUser }` | 409 if already hired/approved | 400 if role !== "host"
  - `GET /api/admin/applications/:id/media/:kind` (`kind` ∈ `photo | motivation | demo`) → 302 to signed R2 URL (mock: `https://mock-r2.local/<key>`)

- [ ] **Step 1: Write the failing test `tests/api/host/approve-host.test.ts`**

```typescript
import { describe, it, expect, beforeAll } from "vitest";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { jobApplications } from "@/lib/db/schema/job-applications";
import { hostProfiles } from "@/lib/db/schema/hosts";
import { getAuthCookie, apiFetch } from "../setup/test-helpers";
import { resolveDefaultOrgForHttpTests } from "../../utils/dropin-helpers";

let cookie: string;
let organizationId: string;

beforeAll(async () => {
  cookie = await getAuthCookie("admin@test.aspiresports.com", "TestAdmin123!");
  ({ organizationId } = await resolveDefaultOrgForHttpTests());
});

async function insertHostApplication(email: string) {
  const [app] = await getDb()
    .insert(jobApplications)
    .values({
      organizationId,
      role: "host",
      firstName: "Hope",
      lastName: "Hoster",
      email,
      phone: "+16145550100",
      preferredLocation: "worthington",
      experience: "Short bio for the game page.",
      gamesPlayed: "5+",
      weeklyCommitment: true,
      photoKey: "careers/hosts/p.jpg",
      motivationVideoKey: "careers/hosts/m.mp4",
      demoVideoKey: "careers/hosts/d.mp4",
    })
    .returning();
  return app;
}

describe("POST /api/admin/applications/:id/approve-host", () => {
  it("creates the user + active host profile, stamps hired; second call 409s", async () => {
    const email = `approve-${Date.now()}@t.example`;
    const app = await insertHostApplication(email);

    const res = await apiFetch(`/api/admin/applications/${app.id}/approve-host`, {
      method: "POST",
      cookie,
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.approved).toBe(true);

    const [profile] = await getDb()
      .select()
      .from(hostProfiles)
      .where(
        and(
          eq(hostProfiles.userId, body.userId),
          eq(hostProfiles.organizationId, organizationId),
        ),
      );
    expect(profile.status).toBe("active");
    expect(profile.bio).toBe("Short bio for the game page.");
    expect(profile.photoKey).toBe("careers/hosts/p.jpg");
    expect(profile.applicationId).toBe(app.id);

    const [stamped] = await getDb()
      .select({ status: jobApplications.status })
      .from(jobApplications)
      .where(eq(jobApplications.id, app.id));
    expect(stamped.status).toBe("hired");

    const again = await apiFetch(`/api/admin/applications/${app.id}/approve-host`, {
      method: "POST",
      cookie,
    });
    expect(again.status).toBe(409);
  });

  it("rejects non-host applications", async () => {
    const [refApp] = await getDb()
      .insert(jobApplications)
      .values({
        organizationId,
        role: "referee",
        firstName: "R",
        lastName: "E",
        email: `ref-${Date.now()}@t.example`,
        experience: "x",
      })
      .returning();
    const res = await apiFetch(`/api/admin/applications/${refApp.id}/approve-host`, {
      method: "POST",
      cookie,
    });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run to verify failure** — expected 404 (endpoint missing).

- [ ] **Step 3: Write `src/pages/api/admin/applications/[id]/approve-host.ts`**

Mirror `hire.ts` structure (read it side-by-side). Differences from hire.ts, in full:

```typescript
import type { APIRoute } from "astro";
import crypto from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { jobApplications, users } from "@/lib/db/schema";
import { hostProfiles } from "@/lib/db/schema/hosts";
import { venues } from "@/lib/db/schema/teams";
import { locations } from "@/lib/db/schema/organizations";
import { requireOrgAdminAccess } from "@/lib/auth";
import { hashPassword } from "@/lib/auth/password";
import { normalizeForUniqueness } from "@/lib/auth/email-normalize";
import { createMagicLink, buildMagicLinkUrl } from "@/lib/auth/magic-link";
import { ensureCustomerOrgMembership } from "@/lib/organization/ensure-membership";
import { sendEmail, fromForBrand, isEmailConfigured } from "@/lib/email";
import { brandFromHost } from "@/lib/organization/soccerone-routing";
import { escapeHtml } from "@/lib/activity-tracking/messages/types";

export const prerender = false;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

/**
 * POST /api/admin/applications/[id]/approve-host
 *
 * Host analog of hire.ts: creates/links the applicant's account, creates an
 * ACTIVE host_profiles row (bio/photo/preferred venue copied from the
 * application), stamps status='hired' + hiredUserId, and emails a 72-hour
 * magic-link invite landing on /host. Unlike coach hire, NO RBAC role and
 * NO staff org-membership is granted — hosts are community volunteers
 * (customer-tier membership only).
 */
export const POST: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;

  const id = context.params.id;
  if (!id) return json(400, { error: "id required" });

  const db = getDb();
  const [application] = await db
    .select()
    .from(jobApplications)
    .where(
      and(
        eq(jobApplications.id, id),
        eq(jobApplications.organizationId, auth.organizationId),
      ),
    )
    .orderBy(asc(jobApplications.createdAt))
    .limit(1);
  if (!application) return json(404, { error: "Resource not found" });
  if (application.role !== "host") {
    return json(400, { error: "Not a host application — use hire instead" });
  }
  if (application.hiredUserId) {
    return json(409, {
      error: "Application already approved",
      hiredUserId: application.hiredUserId,
    });
  }

  const email = normalizeForUniqueness(application.email);
  const [existingUser] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .orderBy(asc(users.createdAt))
    .limit(1);

  let hostUser = existingUser;
  const createdNewUser = !existingUser;
  if (!hostUser) {
    const passwordHash = await hashPassword(
      crypto.randomBytes(32).toString("base64url"),
    );
    [hostUser] = await db
      .insert(users)
      .values({
        email,
        passwordHash,
        firstName: application.firstName,
        lastName: application.lastName,
        phone: application.phone ?? null,
        emailVerified: false,
      })
      .returning();
  }

  // Customer-tier org membership (idempotent inside the helper).
  await ensureCustomerOrgMembership(db, hostUser.id, auth.organizationId);

  // Preferred venue: application stores a location slug; resolve to the
  // oldest venue at that location. "either"/unknown → null (all venues).
  let preferredVenueId: string | null = null;
  if (application.preferredLocation && application.preferredLocation !== "either") {
    const [venue] = await db
      .select({ id: venues.id })
      .from(venues)
      .innerJoin(locations, eq(locations.id, venues.locationId))
      .where(
        and(
          eq(locations.organizationId, auth.organizationId),
          eq(locations.slug, application.preferredLocation),
        ),
      )
      .orderBy(asc(venues.createdAt))
      .limit(1);
    preferredVenueId = venue?.id ?? null;
  }

  // Idempotent per (user, org) — re-approval of a different application for
  // the same person reactivates rather than duplicating.
  const [existingProfile] = await db
    .select()
    .from(hostProfiles)
    .where(
      and(
        eq(hostProfiles.userId, hostUser.id),
        eq(hostProfiles.organizationId, auth.organizationId),
      ),
    )
    .orderBy(asc(hostProfiles.createdAt))
    .limit(1);

  let hostProfileId: string;
  if (existingProfile) {
    hostProfileId = existingProfile.id;
    await db
      .update(hostProfiles)
      .set({
        status: "active",
        bio: application.experience,
        photoKey: application.photoKey,
        preferredVenueId,
        applicationId: application.id,
        approvedByUserId: auth.user.id,
        updatedAt: new Date(),
      })
      .where(eq(hostProfiles.id, existingProfile.id));
  } else {
    const [profile] = await db
      .insert(hostProfiles)
      .values({
        userId: hostUser.id,
        organizationId: auth.organizationId,
        status: "active",
        bio: application.experience,
        photoKey: application.photoKey,
        preferredVenueId,
        applicationId: application.id,
        approvedByUserId: auth.user.id,
      })
      .returning();
    hostProfileId = profile.id;
  }

  await db
    .update(jobApplications)
    .set({ status: "hired", hiredUserId: hostUser.id })
    .where(eq(jobApplications.id, application.id));

  // Welcome email with magic link to /host. Failure must not roll back.
  try {
    const brand = brandFromHost(context.request.headers.get("host") ?? "");
    if (isEmailConfigured()) {
      const { token } = await createMagicLink({
        userId: hostUser.id,
        organizationId: auth.organizationId,
        purpose: "login",
        expiresInSeconds: 72 * 60 * 60,
        deliveredChannel: "email",
        deliveredTo: hostUser.email,
        purposeContext: { redirectTo: "/host" },
      });
      await sendEmail({
        from: fromForBrand(brand),
        to: hostUser.email,
        subject: "You're approved to host pickup games 🎉",
        html: `<p>Hey ${escapeHtml(application.firstName)},</p>
<p>You're in — you're now an approved pickup host. Hosts play free in every game they host.</p>
<p><a href="${buildMagicLinkUrl(token, { origin: new URL(context.request.url).origin })}">Open your host dashboard</a> to claim your first game. This link works for 72 hours; after that, sign in normally.</p>`,
      });
    }
  } catch (err) {
    console.error("[admin/applications/approve-host] welcome email failed:", err);
  }

  return json(200, { approved: true, userId: hostUser.id, hostProfileId, createdNewUser });
};
```

Check the actual success-arm shape of `requireOrgAdminAccess` for the approver's user id (`auth.user.id` vs `auth.userId`) in `src/lib/auth/roles.ts:569` and match it. Check `ensureCustomerOrgMembership`'s exact signature at `src/lib/organization/ensure-membership.ts:25` before calling.

- [ ] **Step 4: Write `src/pages/api/admin/applications/[id]/media/[kind].ts`**

Mirror `resume.ts` (same file, one param more):

```typescript
import type { APIRoute } from "astro";
import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { jobApplications } from "@/lib/db/schema/job-applications";
import { requireOrgAdminAccess } from "@/lib/auth";
import { getSignedGetUrl } from "@/lib/storage/r2";

export const prerender = false;

const COLUMN_BY_KIND = {
  photo: "photoKey",
  motivation: "motivationVideoKey",
  demo: "demoVideoKey",
} as const;

/** GET /api/admin/applications/:id/media/:kind → 302 signed R2 URL. */
export const GET: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;

  const { id, kind } = context.params;
  const column = COLUMN_BY_KIND[kind as keyof typeof COLUMN_BY_KIND];
  if (!id || !column) {
    return new Response(JSON.stringify({ error: "Unknown media kind" }), { status: 400 });
  }

  const [row] = await getDb()
    .select({
      photoKey: jobApplications.photoKey,
      motivationVideoKey: jobApplications.motivationVideoKey,
      demoVideoKey: jobApplications.demoVideoKey,
    })
    .from(jobApplications)
    .where(
      and(eq(jobApplications.id, id), eq(jobApplications.organizationId, auth.organizationId)),
    )
    .orderBy(asc(jobApplications.createdAt))
    .limit(1);
  const key = row?.[column];
  if (!key) {
    return new Response(JSON.stringify({ error: "No media on this application" }), { status: 404 });
  }
  // Link-mode applications (no-R2 degrade path) store a full URL — pass through.
  if (key.startsWith("https://")) {
    return context.redirect(key, 302);
  }
  if (process.env.R2_MOCK === "1") {
    return context.redirect(`https://mock-r2.local/${key}`, 302);
  }
  return context.redirect(await getSignedGetUrl(key), 302);
};
```

(Compare with `resume.ts` before writing — copy its exact mock/redirect handling if it differs.)

- [ ] **Step 5: Run tests to verify pass**

Run: `CRON_SECRET=test-cron-secret TEST_BASE_URL=http://localhost:4321 npm run test:api -- tests/api/host/approve-host.test.ts`
Expected: PASS.

- [ ] **Step 6: Update `src/components/admin/applications-list.tsx`**

Read the file first (154 lines). Add:
- `host` to whatever role filter list it renders.
- On host-application rows/detail: render the photo inline (`<img src={`/api/admin/applications/${app.id}/media/photo`} className="h-24 w-24 rounded-full object-cover" />` — media elements follow the 302) and the two videos inline (`<video controls preload="none" src={`/api/admin/applications/${app.id}/media/motivation`} />`, same for `demo`), each with an "open in new tab" link fallback (covers link-mode applications where the stored value is a YouTube/Loom URL that won't play in a `<video>` tag — on the video element's `onError`, show the link).
- An **Approve as host** button (visible when `role === "host" && status !== "hired"`) calling `POST /api/admin/applications/${app.id}/approve-host`, with `toast.error` on failure and a list refresh on success (match how the existing hire/archive buttons in this component do it).

- [ ] **Step 7: Verify + commit**

Run: `npx tsc --noEmit` and manual check: `/admin/applications` shows the host filter and buttons.

```bash
git add "src/pages/api/admin/applications/[id]/approve-host.ts" "src/pages/api/admin/applications/[id]/media/[kind].ts" src/components/admin/applications-list.tsx tests/api/host/approve-host.test.ts
git commit -m "feat(hosts): approve-host flow + application media review"
```

---

### Task 7: Middleware rule + host games list / claim / unclaim APIs

**Files:**
- Modify: `src/middleware.ts`
- Create: `src/pages/api/host/games/index.ts`, `src/pages/api/host/games/[id]/claim.ts`, `src/pages/api/host/games/[id]/unclaim.ts`
- Test: `tests/api/host/claim.test.ts`

**Interfaces:**
- Consumes: `requireActiveHost`, `requireHostOfSession` (Task 2); `assignHostToSession`, `removeHostFromSession` (Task 3).
- Produces:
  - `GET /api/host/games` → `{ mine: HostGameSummary[], claimable: HostGameSummary[] }` where `HostGameSummary = { id, sportOrClassLabel, formatLabel, startsAt, endsAt, capacity, confirmedCount, venueName, teamCount, teamColors }`
  - `POST /api/host/games/:id/claim` → 200 `{ ok: true }` | 409 `{ code: "already_hosted" }` | 403 non-host
  - `POST /api/host/games/:id/unclaim` → 200 `{ ok: true }` | 409 `{ code: "cutoff_passed", cancelWindowHours }`

- [ ] **Step 1: Add the middleware rule**

In `src/middleware.ts` `ROUTE_RULES`, after the `/staff` rule add:

```typescript
  // Host portal — any authenticated user may hit the URL; active-host
  // enforcement happens in the pages/APIs via requireActiveHost (a paused
  // host gets a friendly explanation page, not a redirect).
  { kind: "authed", pattern: /^\/host(\/|$)/ },
```

- [ ] **Step 2: Write the failing test `tests/api/host/claim.test.ts`**

Hosts need to sign in over HTTP. `getAuthCookie` needs a password — `createTestHost` creates users without one, so add a variant in `tests/utils/host-helpers.ts`:

```typescript
import { hashPassword } from "@/lib/auth/password";

export async function createTestHostWithPassword(opts: {
  organizationId: string;
  preferredVenueId?: string | null;
  status?: "active" | "paused" | "revoked";
}) {
  const db = getDb();
  const email = `host-${Date.now()}-${Math.random().toString(36).slice(2)}@t.example`;
  const password = "TestHost123!";
  const [u] = await db
    .insert(users)
    .values({
      email,
      firstName: "Test",
      lastName: "Host",
      passwordHash: await hashPassword(password),
      emailVerified: true,
    })
    .returning();
  const [profile] = await db
    .insert(hostProfiles)
    .values({
      userId: u.id,
      organizationId: opts.organizationId,
      status: opts.status ?? "active",
      preferredVenueId: opts.preferredVenueId ?? null,
    })
    .returning();
  return { userId: u.id, profileId: profile.id, email, password };
}
```

(Confirm the `users` insert columns against how seed-e2e-tests.ts creates password users — mirror any extra required fields, e.g. `emailVerified`.)

Test file:

```typescript
import { describe, it, expect, beforeAll } from "vitest";
import { getAuthCookie, apiFetch } from "../setup/test-helpers";
import { createTestDropInSession, resolveDefaultOrgForHttpTests } from "../../utils/dropin-helpers";
import { createTestHostWithPassword } from "../../utils/host-helpers";

let organizationId: string;
let venueId: string;

beforeAll(async () => {
  ({ organizationId, venueId } = await resolveDefaultOrgForHttpTests());
});

async function hostCookie() {
  const host = await createTestHostWithPassword({ organizationId, preferredVenueId: venueId });
  return { host, cookie: await getAuthCookie(host.email, host.password) };
}

describe("host claim/unclaim", () => {
  it("active host claims an unhosted game; it appears in mine; unclaim releases it", async () => {
    const { cookie } = await hostCookie();
    const ctx = await createTestDropInSession({ organizationId, venueId });

    const claim = await apiFetch(`/api/host/games/${ctx.sessionId}/claim`, {
      method: "POST",
      cookie,
    });
    expect(claim.status).toBe(200);

    const list = await apiFetch(`/api/host/games`, { cookie });
    expect(list.status).toBe(200);
    const body = await list.json();
    expect(body.mine.map((g: { id: string }) => g.id)).toContain(ctx.sessionId);

    const unclaim = await apiFetch(`/api/host/games/${ctx.sessionId}/unclaim`, {
      method: "POST",
      cookie,
    });
    expect(unclaim.status).toBe(200);
  });

  it("claim race: two hosts, one winner", async () => {
    const a = await hostCookie();
    const b = await hostCookie();
    const ctx = await createTestDropInSession({ organizationId, venueId });

    const [resA, resB] = await Promise.all([
      apiFetch(`/api/host/games/${ctx.sessionId}/claim`, { method: "POST", cookie: a.cookie }),
      apiFetch(`/api/host/games/${ctx.sessionId}/claim`, { method: "POST", cookie: b.cookie }),
    ]);
    const statuses = [resA.status, resB.status].sort();
    expect(statuses).toEqual([200, 409]);
  });

  it("claiming a FULL game still succeeds (host comp bypasses capacity)", async () => {
    const { cookie } = await hostCookie();
    const ctx = await createTestDropInSession({ organizationId, venueId, capacity: 0 });
    const res = await apiFetch(`/api/host/games/${ctx.sessionId}/claim`, {
      method: "POST",
      cookie,
    });
    expect(res.status).toBe(200);
  });

  it("paused host gets 403; plain parent gets 403", async () => {
    const paused = await createTestHostWithPassword({ organizationId, status: "paused" });
    const pausedCookie = await getAuthCookie(paused.email, paused.password);
    const ctx = await createTestDropInSession({ organizationId, venueId });
    const res = await apiFetch(`/api/host/games/${ctx.sessionId}/claim`, {
      method: "POST",
      cookie: pausedCookie,
    });
    expect(res.status).toBe(403);

    const parentCookie = await getAuthCookie("parent@test.aspiresports.com", "TestParent123!");
    const res2 = await apiFetch(`/api/host/games/${ctx.sessionId}/claim`, {
      method: "POST",
      cookie: parentCookie,
    });
    expect(res2.status).toBe(403);
  });

  it("unclaim past the cancel-window cutoff 409s", async () => {
    const { cookie } = await hostCookie();
    // Session starting in 1 hour — inside the default 24h cancel window.
    const ctx = await createTestDropInSession({
      organizationId,
      venueId,
      startsAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    const claim = await apiFetch(`/api/host/games/${ctx.sessionId}/claim`, {
      method: "POST",
      cookie,
    });
    expect(claim.status).toBe(200);
    const unclaim = await apiFetch(`/api/host/games/${ctx.sessionId}/unclaim`, {
      method: "POST",
      cookie,
    });
    expect(unclaim.status).toBe(409);
    expect((await unclaim.json()).code).toBe("cutoff_passed");
  });

  it("host of session A cannot unclaim session B they don't host", async () => {
    const a = await hostCookie();
    const b = await hostCookie();
    const ctx = await createTestDropInSession({ organizationId, venueId });
    await apiFetch(`/api/host/games/${ctx.sessionId}/claim`, { method: "POST", cookie: a.cookie });
    const res = await apiFetch(`/api/host/games/${ctx.sessionId}/unclaim`, {
      method: "POST",
      cookie: b.cookie,
    });
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 3: Run to verify failure** — expected 404s (endpoints missing).

- [ ] **Step 4: Write `src/pages/api/host/games/index.ts`**

```typescript
import type { APIRoute } from "astro";
import { and, asc, eq, gte, isNull, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { dropInSessions, dropInBookings } from "@/lib/db/schema/drop-in";
import { venues } from "@/lib/db/schema/teams";
import { requireActiveHost } from "@/lib/auth/host";

export const prerender = false;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

/**
 * GET /api/host/games — the host dashboard feed.
 *   mine:      my hosted sessions from 4h ago onward (still-visible during play)
 *   claimable: unhosted upcoming pickup sessions, filtered to my preferred
 *              venue when the profile has one.
 */
export const GET: APIRoute = async (context) => {
  const auth = await requireActiveHost(context);
  if (!auth.authorized) return auth.response;

  const db = getDb();
  const confirmedCount = sql<number>`(
    SELECT COUNT(*)::int FROM ${dropInBookings}
    WHERE ${dropInBookings.sessionId} = ${dropInSessions.id}
      AND ${dropInBookings.status} IN ('confirmed', 'pending_payment', 'pending_claim')
  )`;
  const summary = {
    id: dropInSessions.id,
    sportOrClassLabel: dropInSessions.sportOrClassLabel,
    formatLabel: dropInSessions.formatLabel,
    startsAt: dropInSessions.startsAt,
    endsAt: dropInSessions.endsAt,
    capacity: dropInSessions.capacity,
    teamCount: dropInSessions.teamCount,
    teamColors: dropInSessions.teamColors,
    venueName: venues.name,
    confirmedCount,
  };

  const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000);
  const mine = await db
    .select(summary)
    .from(dropInSessions)
    .leftJoin(venues, eq(venues.id, dropInSessions.venueId))
    .where(
      and(
        eq(dropInSessions.organizationId, auth.organizationId),
        eq(dropInSessions.hostUserId, auth.userId),
        eq(dropInSessions.status, "scheduled"),
        gte(dropInSessions.startsAt, fourHoursAgo),
      ),
    )
    .orderBy(asc(dropInSessions.startsAt));

  const claimableConds = [
    eq(dropInSessions.organizationId, auth.organizationId),
    eq(dropInSessions.kind, "pickup"),
    eq(dropInSessions.status, "scheduled"),
    isNull(dropInSessions.hostUserId),
    gte(dropInSessions.startsAt, new Date()),
  ];
  if (auth.profile.preferredVenueId) {
    claimableConds.push(eq(dropInSessions.venueId, auth.profile.preferredVenueId));
  }
  const claimable = await db
    .select(summary)
    .from(dropInSessions)
    .leftJoin(venues, eq(venues.id, dropInSessions.venueId))
    .where(and(...claimableConds))
    .orderBy(asc(dropInSessions.startsAt))
    .limit(25);

  return json({ mine, claimable }, 200);
};
```

- [ ] **Step 5: Write claim + unclaim endpoints**

`src/pages/api/host/games/[id]/claim.ts`:

```typescript
import type { APIRoute } from "astro";
import { requireActiveHost } from "@/lib/auth/host";
import { assignHostToSession } from "@/lib/dropin/host-assignment";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { dropInSessions } from "@/lib/db/schema/drop-in";

export const prerender = false;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

/** POST /api/host/games/:id/claim — self-claim an unhosted pickup game. */
export const POST: APIRoute = async (context) => {
  const auth = await requireActiveHost(context);
  if (!auth.authorized) return auth.response;

  const id = context.params.id;
  if (!id) return json({ error: "session id required" }, 400);

  // Org pin BEFORE assign — a foreign-org session must read as 404, and
  // assignHostToSession alone would leak "not_active_host" instead.
  const [session] = await getDb()
    .select({ id: dropInSessions.id, kind: dropInSessions.kind })
    .from(dropInSessions)
    .where(
      and(eq(dropInSessions.id, id), eq(dropInSessions.organizationId, auth.organizationId)),
    )
    .limit(1);
  if (!session) return json({ error: "Session not found" }, 404);
  if (session.kind !== "pickup") return json({ error: "Only pickup games can be claimed" }, 400);

  const result = await assignHostToSession({ sessionId: id, hostUserId: auth.userId });
  if (!result.ok) {
    const status =
      result.code === "already_hosted" ? 409 :
      result.code === "session_not_found" ? 404 : 400;
    return json({ error: result.message, code: result.code }, status);
  }
  return json({ ok: true }, 200);
};
```

`src/pages/api/host/games/[id]/unclaim.ts`:

```typescript
import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { dropInRateCard } from "@/lib/db/schema/drop-in";
import { requireHostOfSession } from "@/lib/auth/host";
import { removeHostFromSession } from "@/lib/dropin/host-assignment";

export const prerender = false;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

/**
 * POST /api/host/games/:id/unclaim — release a game I host. Blocked inside
 * the org's cancel window (rate card cancelWindowHours) so games don't
 * silently lose their host last-minute; inside the window the host must
 * contact the org (admin remove still works).
 */
export const POST: APIRoute = async (context) => {
  const id = context.params.id;
  if (!id) return json({ error: "session id required" }, 400);

  const auth = await requireHostOfSession(context, id);
  if (!auth.authorized) return auth.response;

  const [rateCard] = await getDb()
    .select({ cancelWindowHours: dropInRateCard.cancelWindowHours })
    .from(dropInRateCard)
    .where(eq(dropInRateCard.organizationId, auth.organizationId))
    .limit(1);
  const cancelWindowHours = rateCard?.cancelWindowHours ?? 24;
  const cutoff = new Date(
    auth.session.startsAt.getTime() - cancelWindowHours * 60 * 60 * 1000,
  );
  if (new Date() > cutoff) {
    return json(
      {
        error: "Too close to game time to step down — contact the front desk",
        code: "cutoff_passed",
        cancelWindowHours,
      },
      409,
    );
  }

  await removeHostFromSession({ sessionId: id, reason: "host_unclaimed" });
  return json({ ok: true }, 200);
};
```

- [ ] **Step 6: Run tests, verify pass, commit**

Run: `CRON_SECRET=test-cron-secret TEST_BASE_URL=http://localhost:4321 npm run test:api -- tests/api/host/claim.test.ts`
Expected: PASS (6 tests).

```bash
git add src/middleware.ts src/pages/api/host/ tests/api/host/claim.test.ts tests/utils/host-helpers.ts
git commit -m "feat(hosts): /host middleware rule + games list, claim, unclaim endpoints"
```

---

### Task 8: Host game-day APIs — detail/roster, attendance, teams, wrap-up report

**Files:**
- Create: `src/lib/dropin/attendance.ts`, `src/pages/api/host/games/[id]/index.ts`, `.../[id]/attendance.ts`, `.../[id]/teams.ts`, `.../[id]/report.ts`
- Modify: `src/pages/api/admin/dropin/sessions/[id]/attendance.ts` (delegate to shared core)
- Test: `tests/api/host/game-day.test.ts`

**Interfaces:**
- Consumes: `requireHostOfSession` (Task 2), `hostGameReports` (Task 1), `sendOpsPing` + `host_incident` kind (Task 1).
- Produces:
  - `applyAttendanceEntries(sessionId: string, entries: Array<{ bookingId: string; action: "check_in" | "no_show" | "undo_check_in" }>): Promise<{ updated: number }>` in `src/lib/dropin/attendance.ts` — EXACTLY the logic currently inlined in the admin endpoint (session-scoped booking guard, one UPDATE per action type, last entry wins).
  - `GET /api/host/games/:id` → `{ session: {...HostGameSummary, teamColors, kind, status}, roster: Array<{ bookingId, firstName, lastName, status, checkedInAt, teamAssignment, paymentMethod }>, waitlistCount: number }` — roster covers statuses `confirmed | pending_payment | pending_claim | no_show`; waitlisted are counted but listed separately by status.
  - `POST /api/host/games/:id/attendance` — same body as admin attendance.
  - `POST /api/host/games/:id/teams` body `{ assignments: Array<{ bookingId: string; team: string | null }> }` → validates team ∈ session.teamColors (or null to clear).
  - `POST /api/host/games/:id/report` body `{ summary: string; incidentFlagged?: boolean; incidentDetails?: string }` → 200 `{ ok: true }` | 409 `{ code: "already_reported" }` | 400 `{ code: "too_early" }` before startsAt.

- [ ] **Step 1: Extract `src/lib/dropin/attendance.ts`**

Move the body of the admin attendance endpoint (lines 71–128 of the current file — the ours-guard, actionById map, and the three UPDATEs) into:

```typescript
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { dropInBookings } from "@/lib/db/schema/drop-in";

export interface AttendanceEntry {
  bookingId: string;
  action: "check_in" | "no_show" | "undo_check_in";
}

/**
 * Bulk attendance core shared by the admin AttendancePanel endpoint and the
 * host game-day endpoint. Callers are responsible for AUTH; this function
 * only guarantees bookings outside `sessionId` are ignored.
 */
export async function applyAttendanceEntries(
  sessionId: string,
  entries: AttendanceEntry[],
): Promise<{ updated: number }> {
  const db = getDb();
  const ids = entries.map((e) => e.bookingId);
  if (ids.length === 0) return { updated: 0 };

  const ours = await db
    .select({ id: dropInBookings.id })
    .from(dropInBookings)
    .where(and(eq(dropInBookings.sessionId, sessionId), inArray(dropInBookings.id, ids)));
  const ourIds = new Set(ours.map((r) => r.id));

  const actionById = new Map<string, AttendanceEntry["action"]>();
  for (const entry of entries) {
    if (!ourIds.has(entry.bookingId)) continue;
    actionById.set(entry.bookingId, entry.action);
  }
  const idsFor = (action: AttendanceEntry["action"]) =>
    [...actionById.entries()].filter(([, a]) => a === action).map(([id]) => id);

  const now = new Date();
  const checkInIds = idsFor("check_in");
  const undoIds = idsFor("undo_check_in");
  const noShowIds = idsFor("no_show");

  if (checkInIds.length > 0) {
    await db
      .update(dropInBookings)
      .set({ checkedInAt: now, updatedAt: now })
      .where(inArray(dropInBookings.id, checkInIds));
  }
  if (undoIds.length > 0) {
    await db
      .update(dropInBookings)
      .set({ checkedInAt: null, updatedAt: now })
      .where(inArray(dropInBookings.id, undoIds));
  }
  if (noShowIds.length > 0) {
    await db
      .update(dropInBookings)
      .set({
        status: "no_show",
        cancellationReason: "no_show",
        cancelledAt: now,
        updatedAt: now,
      })
      .where(inArray(dropInBookings.id, noShowIds));
  }
  return { updated: actionById.size };
}
```

Rewrite the admin endpoint to keep its auth + tenant/venue guard and delegate: `const { updated } = await applyAttendanceEntries(id, body.entries); return json({ ok: true, updated }, 200);`

- [ ] **Step 2: Write the failing test `tests/api/host/game-day.test.ts`**

Setup mirrors Task 7 (`createTestHostWithPassword` + claim over HTTP, plus a player booking created directly via `getDb().insert(dropInBookings)` with status confirmed / paymentMethod `card_online` / source `online_booking`). Cases:

```typescript
// 1. GET detail returns roster with the player + the host's comp booking
// 2. attendance: check_in then undo works; a bookingId from ANOTHER session is ignored (updated count excludes it)
// 3. teams: assign player to "orange" works; team "purple" (not in teamColors) → 400
// 4. report before startsAt → 400 too_early
// 5. report after start (create session with startsAt in the past) → 200; row exists; second submit → 409
// 6. report with incidentFlagged: true → 200 (ops ping is fire-and-forget; assert the report row's incidentFlagged)
// 7. all five endpoints 403/404 for a host who does NOT host this session
```

Write each as a real `it(...)` using the same apiFetch/cookie pattern as Task 7. For case 5, `createTestDropInSession({ startsAt: new Date(Date.now() - 60 * 60 * 1000), endsAt: new Date(Date.now() + 30 * 60 * 1000) })` — claim must happen via `assignHostToSession` lib call (claim endpoint would work too; either is fine).

- [ ] **Step 3: Run to verify failure** — expected 404s.

- [ ] **Step 4: Write the four host endpoints**

`src/pages/api/host/games/[id]/index.ts`:

```typescript
import type { APIRoute } from "astro";
import { and, asc, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { dropInBookings } from "@/lib/db/schema/drop-in";
import { users } from "@/lib/db/schema/users";
import { venues } from "@/lib/db/schema/teams";
import { requireHostOfSession } from "@/lib/auth/host";

export const prerender = false;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

/** GET /api/host/games/:id — game-day detail: session, roster, counts. */
export const GET: APIRoute = async (context) => {
  const id = context.params.id;
  if (!id) return json({ error: "session id required" }, 400);
  const auth = await requireHostOfSession(context, id);
  if (!auth.authorized) return auth.response;

  const db = getDb();
  const roster = await db
    .select({
      bookingId: dropInBookings.id,
      status: dropInBookings.status,
      paymentMethod: dropInBookings.paymentMethod,
      checkedInAt: dropInBookings.checkedInAt,
      teamAssignment: dropInBookings.teamAssignment,
      firstName: users.firstName,
      lastName: users.lastName,
    })
    .from(dropInBookings)
    .innerJoin(users, eq(users.id, dropInBookings.userId))
    .where(
      and(
        eq(dropInBookings.sessionId, id),
        sql`${dropInBookings.status} IN ('confirmed', 'pending_payment', 'pending_claim', 'waitlisted', 'no_show')`,
      ),
    )
    .orderBy(asc(dropInBookings.createdAt));

  const [venue] = await db
    .select({ name: venues.name })
    .from(venues)
    .where(eq(venues.id, auth.session.venueId))
    .limit(1);

  const seated = roster.filter((r) =>
    ["confirmed", "pending_payment", "pending_claim"].includes(r.status),
  );
  return json(
    {
      session: {
        id: auth.session.id,
        kind: auth.session.kind,
        status: auth.session.status,
        sportOrClassLabel: auth.session.sportOrClassLabel,
        formatLabel: auth.session.formatLabel,
        startsAt: auth.session.startsAt,
        endsAt: auth.session.endsAt,
        capacity: auth.session.capacity,
        teamCount: auth.session.teamCount,
        teamColors: auth.session.teamColors,
        venueName: venue?.name ?? null,
        confirmedCount: seated.length,
      },
      roster,
      waitlistCount: roster.filter((r) => r.status === "waitlisted").length,
    },
    200,
  );
};
```

`src/pages/api/host/games/[id]/attendance.ts`:

```typescript
import type { APIRoute } from "astro";
import { requireHostOfSession } from "@/lib/auth/host";
import { applyAttendanceEntries, type AttendanceEntry } from "@/lib/dropin/attendance";

export const prerender = false;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

/** POST /api/host/games/:id/attendance — host-scoped mirror of the admin endpoint. */
export const POST: APIRoute = async (context) => {
  const id = context.params.id;
  if (!id) return json({ error: "session id required" }, 400);
  const auth = await requireHostOfSession(context, id);
  if (!auth.authorized) return auth.response;

  let body: { entries?: AttendanceEntry[] };
  try {
    body = await context.request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  if (!body.entries || !Array.isArray(body.entries)) {
    return json({ error: "entries[] required" }, 400);
  }
  const { updated } = await applyAttendanceEntries(id, body.entries);
  return json({ ok: true, updated }, 200);
};
```

`src/pages/api/host/games/[id]/teams.ts`:

```typescript
import type { APIRoute } from "astro";
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { dropInBookings } from "@/lib/db/schema/drop-in";
import { requireHostOfSession } from "@/lib/auth/host";

export const prerender = false;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

/** POST /api/host/games/:id/teams — set/clear team assignments. */
export const POST: APIRoute = async (context) => {
  const id = context.params.id;
  if (!id) return json({ error: "session id required" }, 400);
  const auth = await requireHostOfSession(context, id);
  if (!auth.authorized) return auth.response;

  let body: { assignments?: Array<{ bookingId: string; team: string | null }> };
  try {
    body = await context.request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  if (!body.assignments || !Array.isArray(body.assignments)) {
    return json({ error: "assignments[] required" }, 400);
  }
  const validTeams = new Set(auth.session.teamColors);
  for (const a of body.assignments) {
    if (a.team !== null && !validTeams.has(a.team)) {
      return json({ error: `Unknown team "${a.team}"` }, 400);
    }
  }

  const db = getDb();
  const ids = body.assignments.map((a) => a.bookingId);
  const ours = await db
    .select({ id: dropInBookings.id })
    .from(dropInBookings)
    .where(and(eq(dropInBookings.sessionId, id), inArray(dropInBookings.id, ids)));
  const ourIds = new Set(ours.map((r) => r.id));

  let updated = 0;
  for (const a of body.assignments) {
    if (!ourIds.has(a.bookingId)) continue;
    await db
      .update(dropInBookings)
      .set({ teamAssignment: a.team, updatedAt: new Date() })
      .where(eq(dropInBookings.id, a.bookingId));
    updated++;
  }
  return json({ ok: true, updated }, 200);
};
```

`src/pages/api/host/games/[id]/report.ts`:

```typescript
import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { hostGameReports } from "@/lib/db/schema/hosts";
import { requireHostOfSession } from "@/lib/auth/host";
import { sendOpsPing } from "@/lib/ops/ping";
import { brandFromHost } from "@/lib/organization/soccerone-routing";

export const prerender = false;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

/** POST /api/host/games/:id/report — one wrap-up per game, from kickoff on. */
export const POST: APIRoute = async (context) => {
  const id = context.params.id;
  if (!id) return json({ error: "session id required" }, 400);
  const auth = await requireHostOfSession(context, id);
  if (!auth.authorized) return auth.response;

  if (new Date() < auth.session.startsAt) {
    return json({ error: "Wrap-up opens at game time", code: "too_early" }, 400);
  }

  let body: { summary?: string; incidentFlagged?: boolean; incidentDetails?: string };
  try {
    body = await context.request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  const summary = (body.summary ?? "").trim();
  if (!summary || summary.length > 5000) {
    return json({ error: "summary required (max 5000 chars)" }, 400);
  }

  try {
    await getDb().insert(hostGameReports).values({
      sessionId: id,
      hostProfileId: auth.profile.id,
      summary,
      incidentFlagged: body.incidentFlagged === true,
      incidentDetails: body.incidentFlagged === true ? (body.incidentDetails ?? null) : null,
    });
  } catch (err) {
    // Unique(sessionId) violation → already reported.
    if (err instanceof Error && err.message.includes("host_game_reports_session_unique")) {
      return json({ error: "Wrap-up already submitted", code: "already_reported" }, 409);
    }
    throw err;
  }

  // Incident → instant ops ping (awaited: serverless freeze drops
  // fire-and-forget work; sendOpsPing itself never throws).
  if (body.incidentFlagged === true) {
    await sendOpsPing(auth.organizationId, {
      kind: "host_incident",
      brand: brandFromHost(context.request.headers.get("host") ?? ""),
      eventId: id,
      label: `${auth.session.sportOrClassLabel} — ${summary.slice(0, 80)}`,
    });
  }
  return json({ ok: true }, 200);
};
```

- [ ] **Step 5: Run tests (host + existing admin attendance suites), verify pass, commit**

Run: `CRON_SECRET=test-cron-secret TEST_BASE_URL=http://localhost:4321 npm run test:api -- tests/api/host/ tests/api/dropin/`
Expected: PASS — including the pre-existing dropin suites (the attendance refactor must not change admin behavior).

```bash
git add src/lib/dropin/attendance.ts src/pages/api/host/ "src/pages/api/admin/dropin/sessions/[id]/attendance.ts" tests/api/host/game-day.test.ts
git commit -m "feat(hosts): game-day APIs — roster, shared attendance core, teams, wrap-up report"
```

---

### Task 9: Host portal UI — dashboard + game-day pages (phone-first)

**Files:**
- Create: `src/pages/host/index.astro`, `src/pages/host/games/[id].astro`, `src/components/host/HostDashboard.tsx`, `src/components/host/HostGameDay.tsx`
- Create: `src/lib/dropin/share-blurb.ts`
- Test: `tests/unit/dropin-share-blurb.test.ts` (pure fn); pages get their e2e in Task 15

**Interfaces:**
- Consumes: all `/api/host/**` endpoints (Tasks 7–8), `useHydrationBeacon`, UI primitives.
- Produces:
  - `buildShareBlurb(opts: { sport: string; venueName: string | null; startsAt: Date; spotsLeft: number; url: string; timeZone: string }): string` — e.g. `"⚽ Pickup soccer at Worthington — Tue 7:00 PM. 4 spots left. Join: https://…"`
  - `/host` — "My games" + "Games needing a host" lists with Claim buttons
  - `/host/games/[id]` — fill meter, share zone, roster/check-in/teams, wrap-up form

- [ ] **Step 1: Write the failing unit test `tests/unit/dropin-share-blurb.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import { buildShareBlurb } from "@/lib/dropin/share-blurb";

describe("buildShareBlurb", () => {
  it("formats sport, venue, local time, spots, and url", () => {
    const blurb = buildShareBlurb({
      sport: "soccer",
      venueName: "Worthington",
      startsAt: new Date("2026-07-14T23:00:00Z"), // 7 PM America/New_York
      spotsLeft: 4,
      url: "https://aspiresportsohio.com/dropin/abc?src=host-share",
      timeZone: "America/New_York",
    });
    expect(blurb).toContain("soccer");
    expect(blurb).toContain("Worthington");
    expect(blurb).toContain("7:00");
    expect(blurb).toContain("4 spots left");
    expect(blurb).toContain("https://aspiresportsohio.com/dropin/abc?src=host-share");
  });

  it("says 'Almost full' at 1 spot and skips venue when null", () => {
    const blurb = buildShareBlurb({
      sport: "futsal",
      venueName: null,
      startsAt: new Date("2026-07-14T23:00:00Z"),
      spotsLeft: 1,
      url: "https://x.test/g",
      timeZone: "America/New_York",
    });
    expect(blurb).toContain("1 spot left");
    expect(blurb).not.toContain("null");
  });
});
```

Run: `npm run test:api -- tests/unit/dropin-share-blurb.test.ts` — actually unit tests run via the unit config; check `package.json` for the unit test script (`npm test -- tests/unit/...` is Playwright — WRONG). Use whatever script existing `tests/unit/*.test.ts` files run under (look at `vitest.config` roots); if both tiers share the vitest config, `npx vitest run tests/unit/dropin-share-blurb.test.ts` works.
Expected: FAIL — module missing.

- [ ] **Step 2: Write `src/lib/dropin/share-blurb.ts`**

```typescript
/**
 * Prewritten share text for a pickup game — used by the host share sheet
 * and the fill-alert SMS body. Pure; timezone passed in (org display tz).
 */
const SPORT_EMOJI: Record<string, string> = {
  soccer: "⚽",
  futsal: "⚽",
  basketball: "🏀",
  volleyball: "🏐",
  hockey: "🏒",
};

export function buildShareBlurb(opts: {
  sport: string;
  venueName: string | null;
  startsAt: Date;
  spotsLeft: number;
  url: string;
  timeZone: string;
}): string {
  const emoji = SPORT_EMOJI[opts.sport.toLowerCase()] ?? "🏟️";
  const when = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: opts.timeZone,
  }).format(opts.startsAt);
  const where = opts.venueName ? ` at ${opts.venueName}` : "";
  const spots =
    opts.spotsLeft === 1 ? "1 spot left" : `${opts.spotsLeft} spots left`;
  return `${emoji} Pickup ${opts.sport}${where} — ${when}. ${spots}. Join: ${opts.url}`;
}
```

Run the unit test again — expected PASS.

- [ ] **Step 3: Create the Astro pages**

`src/pages/host/index.astro`:

```astro
---
import BaseLayout from "@/layouts/BaseLayout.astro";
import HostDashboard from "@/components/host/HostDashboard";
import { getHostProfile } from "@/lib/auth/host";

// Middleware guarantees auth; active-host is checked here so paused/revoked
// hosts get an explanation instead of a 403.
const user = Astro.locals.user!;
const org = Astro.locals.organization;
const profile = org ? await getHostProfile(user.id, org.id) : null;
---

<BaseLayout title="Host dashboard">
  {
    !profile ? (
      <main class="mx-auto max-w-xl px-4 py-16 text-center">
        <h1 class="text-2xl font-semibold">Host dashboard</h1>
        <p class="mt-4">
          This area is for approved pickup hosts. Want to host games (and play
          free when you do)? <a href="/careers" class="underline">Apply here</a>.
        </p>
      </main>
    ) : profile.status !== "active" ? (
      <main class="mx-auto max-w-xl px-4 py-16 text-center">
        <h1 class="text-2xl font-semibold">Hosting is paused</h1>
        <p class="mt-4">
          Your host access is currently {profile.status === "paused" ? "paused" : "inactive"}.
          Reach out to the front desk if you think that's a mistake.
        </p>
      </main>
    ) : (
      <HostDashboard client:load />
    )
  }
</BaseLayout>
```

(Check BaseLayout's actual props — if it takes `title` differently, match existing pages like `src/pages/dashboard/play.astro`.)

`src/pages/host/games/[id].astro`:

```astro
---
import BaseLayout from "@/layouts/BaseLayout.astro";
import HostGameDay from "@/components/host/HostGameDay";

const { id } = Astro.params;
// Ownership is enforced by the /api/host/games/[id] fetch inside the island
// (404 → the component renders its not-found state).
---

<BaseLayout title="Game day">
  <HostGameDay client:load sessionId={id!} />
</BaseLayout>
```

- [ ] **Step 4: Write `src/components/host/HostDashboard.tsx`**

Complete component — phone-first (single column, large tap targets):

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon";
import { ErrorBanner } from "@/components/ui/error-banner";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingSkeleton } from "@/components/ui/loading-skeleton";

interface HostGameSummary {
  id: string;
  sportOrClassLabel: string;
  formatLabel: string | null;
  startsAt: string;
  endsAt: string;
  capacity: number;
  confirmedCount: number;
  venueName: string | null;
}

function GameRow(props: {
  game: HostGameSummary;
  action: { label: string; onClick: () => void } | null;
  href?: string;
}) {
  const g = props.game;
  const when = new Date(g.startsAt).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  const body = (
    <div className="flex items-center justify-between gap-3 rounded-lg border p-4">
      <div>
        <p className="font-medium capitalize">
          {g.sportOrClassLabel}
          {g.formatLabel ? ` · ${g.formatLabel}` : ""}
        </p>
        <p className="text-sm text-muted-foreground">
          {when}
          {g.venueName ? ` · ${g.venueName}` : ""}
        </p>
        <p className="text-sm">
          {g.confirmedCount}/{g.capacity} booked
        </p>
      </div>
      {props.action && (
        <button
          type="button"
          className="shrink-0 rounded-md border px-4 py-3 font-medium"
          onClick={(e) => {
            e.preventDefault();
            props.action!.onClick();
          }}
        >
          {props.action.label}
        </button>
      )}
    </div>
  );
  return props.href ? <a href={props.href} className="block">{body}</a> : body;
}

export default function HostDashboard() {
  useHydrationBeacon();
  const [data, setData] = useState<{ mine: HostGameSummary[]; claimable: HostGameSummary[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [claiming, setClaiming] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/host/games");
      if (!res.ok) throw new Error((await res.json()).error ?? "Could not load games");
      setData(await res.json());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load games");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function claim(id: string) {
    setClaiming(id);
    try {
      const res = await fetch(`/api/host/games/${id}/claim`, { method: "POST" });
      if (res.status === 409) {
        toast.error("Someone beat you to it — that game just got a host.");
      } else if (!res.ok) {
        toast.error((await res.json()).error ?? "Could not claim the game");
      }
      await load();
    } finally {
      setClaiming(null);
    }
  }

  if (error) return <main className="mx-auto max-w-xl px-4 py-8"><ErrorBanner message={error} /></main>;
  if (!data) return <main className="mx-auto max-w-xl px-4 py-8"><LoadingSkeleton /></main>;

  return (
    <main className="mx-auto max-w-xl space-y-8 px-4 py-8">
      <section>
        <h1 className="text-2xl font-semibold">My games</h1>
        <div className="mt-4 space-y-3" data-testid="host-my-games">
          {data.mine.length === 0 ? (
            <EmptyState
              title="No games yet"
              description="Claim a game below to get started."
            />
          ) : (
            data.mine.map((g) => (
              <GameRow key={g.id} game={g} action={null} href={`/host/games/${g.id}`} />
            ))
          )}
        </div>
      </section>
      <section>
        <h2 className="text-xl font-semibold">Games needing a host</h2>
        <div className="mt-4 space-y-3" data-testid="host-claimable-games">
          {data.claimable.length === 0 ? (
            <EmptyState
              title="Nothing to claim right now"
              description="New pickup games appear here as they're scheduled."
            />
          ) : (
            data.claimable.map((g) => (
              <GameRow
                key={g.id}
                game={g}
                action={{
                  label: claiming === g.id ? "Claiming…" : "Claim",
                  onClick: () => void claim(g.id),
                }}
              />
            ))
          )}
        </div>
      </section>
    </main>
  );
}
```

Verify the `ErrorBanner`/`EmptyState`/`LoadingSkeleton` import paths + prop names against the actual files in `src/components/ui/` and adjust.

- [ ] **Step 5: Write `src/components/host/HostGameDay.tsx`**

Complete component with the four zones. Skeleton (full logic, style to match the app):

```tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon";
import { ErrorBanner } from "@/components/ui/error-banner";
import { LoadingSkeleton } from "@/components/ui/loading-skeleton";
import { buildShareBlurb } from "@/lib/dropin/share-blurb";

interface RosterRow {
  bookingId: string;
  firstName: string;
  lastName: string;
  status: string;
  paymentMethod: string;
  checkedInAt: string | null;
  teamAssignment: string | null;
}
interface GameDetail {
  session: {
    id: string;
    sportOrClassLabel: string;
    formatLabel: string | null;
    startsAt: string;
    endsAt: string;
    capacity: number;
    confirmedCount: number;
    teamCount: number;
    teamColors: string[];
    venueName: string | null;
    status: string;
  };
  roster: RosterRow[];
  waitlistCount: number;
}

export default function HostGameDay({ sessionId }: { sessionId: string }) {
  useHydrationBeacon();
  const [data, setData] = useState<GameDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState("");
  const [incident, setIncident] = useState(false);
  const [incidentDetails, setIncidentDetails] = useState("");
  const [reported, setReported] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/host/games/${sessionId}`);
      if (res.status === 404) throw new Error("This isn't one of your games.");
      if (!res.ok) throw new Error("Could not load the game");
      setData(await res.json());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the game");
    }
  }, [sessionId]);

  useEffect(() => {
    void load();
  }, [load]);

  const shareText = useMemo(() => {
    if (!data) return "";
    const spotsLeft = Math.max(0, data.session.capacity - data.session.confirmedCount);
    return buildShareBlurb({
      sport: data.session.sportOrClassLabel,
      venueName: data.session.venueName,
      startsAt: new Date(data.session.startsAt),
      spotsLeft,
      url: `${window.location.origin}/dropin/${sessionId}?src=host-share`,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
  }, [data, sessionId]);

  async function share() {
    if (navigator.share) {
      try {
        await navigator.share({ text: shareText });
        return;
      } catch {
        /* user dismissed — fall through to copy */
      }
    }
    await navigator.clipboard.writeText(shareText);
    toast.success("Copied — paste it into your group chat");
  }

  async function mark(bookingId: string, action: "check_in" | "undo_check_in" | "no_show") {
    const res = await fetch(`/api/host/games/${sessionId}/attendance`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entries: [{ bookingId, action }] }),
    });
    if (!res.ok) toast.error("Could not update — try again");
    await load();
  }

  async function assignTeam(bookingId: string, team: string | null) {
    const res = await fetch(`/api/host/games/${sessionId}/teams`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assignments: [{ bookingId, team }] }),
    });
    if (!res.ok) toast.error("Could not set the team");
    await load();
  }

  async function submitReport() {
    const res = await fetch(`/api/host/games/${sessionId}/report`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        summary,
        incidentFlagged: incident,
        incidentDetails: incident ? incidentDetails : undefined,
      }),
    });
    if (res.status === 409) {
      setReported(true);
      toast.error("Wrap-up was already submitted for this game.");
    } else if (!res.ok) {
      toast.error((await res.json()).error ?? "Could not submit");
    } else {
      setReported(true);
    }
  }

  if (error) return <main className="mx-auto max-w-xl px-4 py-8"><ErrorBanner message={error} /></main>;
  if (!data) return <main className="mx-auto max-w-xl px-4 py-8"><LoadingSkeleton /></main>;

  const s = data.session;
  const gameStarted = new Date() >= new Date(s.startsAt);
  const spotsLeft = Math.max(0, s.capacity - s.confirmedCount);
  const active = data.roster.filter((r) => r.status !== "no_show" && r.status !== "waitlisted");

  return (
    <main className="mx-auto max-w-xl space-y-8 px-4 py-8">
      {/* Zone 1 — fill status */}
      <section>
        <h1 className="text-2xl font-semibold capitalize">
          {s.sportOrClassLabel}
          {s.venueName ? ` @ ${s.venueName}` : ""}
        </h1>
        <p className="text-sm text-muted-foreground">
          {new Date(s.startsAt).toLocaleString("en-US", { weekday: "long", hour: "numeric", minute: "2-digit" })}
        </p>
        <div className="mt-3 h-3 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary"
            style={{ width: `${Math.min(100, Math.round((s.confirmedCount / Math.max(1, s.capacity)) * 100))}%` }}
          />
        </div>
        <p className="mt-1 text-sm" data-testid="fill-meter">
          {s.confirmedCount}/{s.capacity} booked
          {data.waitlistCount > 0 ? ` · ${data.waitlistCount} waitlisted` : ""}
          {spotsLeft > 0 ? ` · ${spotsLeft} open` : " · Full"}
        </p>
      </section>

      {/* Zone 2 — share */}
      {spotsLeft > 0 && (
        <section className="rounded-lg border p-4">
          <h2 className="font-semibold">Fill this game</h2>
          <p className="mt-1 text-sm text-muted-foreground">{shareText}</p>
          <button
            type="button"
            className="mt-3 w-full rounded-md border px-4 py-3 font-medium"
            onClick={() => void share()}
            data-testid="share-game"
          >
            Share with friends
          </button>
        </section>
      )}

      {/* Zone 3 — roster / check-in / teams */}
      <section>
        <h2 className="text-xl font-semibold">Roster</h2>
        <ul className="mt-3 space-y-2" data-testid="host-roster">
          {active.map((r) => (
            <li key={r.bookingId} className="flex items-center justify-between gap-2 rounded-lg border p-3">
              <div>
                <p className="font-medium">
                  {r.firstName} {r.lastName}
                  {r.paymentMethod === "host_comp" ? " (you)" : ""}
                </p>
                {s.teamCount > 0 && (
                  <select
                    className="mt-1 rounded border px-2 py-1 text-sm"
                    value={r.teamAssignment ?? ""}
                    onChange={(e) => void assignTeam(r.bookingId, e.target.value || null)}
                  >
                    <option value="">No team</option>
                    {s.teamColors.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                )}
              </div>
              <button
                type="button"
                className={`shrink-0 rounded-md px-4 py-3 font-medium ${r.checkedInAt ? "bg-primary text-primary-foreground" : "border"}`}
                onClick={() => void mark(r.bookingId, r.checkedInAt ? "undo_check_in" : "check_in")}
              >
                {r.checkedInAt ? "✓ Here" : "Check in"}
              </button>
            </li>
          ))}
        </ul>
      </section>

      {/* Zone 4 — wrap-up */}
      {gameStarted && !reported && (
        <section className="rounded-lg border p-4">
          <h2 className="font-semibold">Wrap-up</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Mark anyone who didn't show via their roster row, then close out the game.
          </p>
          <textarea
            className="mt-3 w-full rounded border p-2"
            rows={3}
            placeholder="How did it go? Great energy? Lopsided teams?"
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            data-testid="wrapup-summary"
          />
          <label className="mt-2 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={incident} onChange={(e) => setIncident(e.target.checked)} />
            Something happened that the org should know about
          </label>
          {incident && (
            <textarea
              className="mt-2 w-full rounded border p-2"
              rows={2}
              placeholder="What happened?"
              value={incidentDetails}
              onChange={(e) => setIncidentDetails(e.target.value)}
            />
          )}
          <button
            type="button"
            className="mt-3 w-full rounded-md border px-4 py-3 font-medium disabled:opacity-50"
            disabled={!summary.trim()}
            onClick={() => void submitReport()}
            data-testid="wrapup-submit"
          >
            Submit wrap-up
          </button>
        </section>
      )}
      {reported && <p className="text-sm">✓ Wrap-up submitted — thanks for hosting.</p>}

      {/* No-show marking lives here so the wrap-up section stays simple */}
      {gameStarted && (
        <section>
          <h2 className="text-sm font-medium text-muted-foreground">Didn't show?</h2>
          <ul className="mt-2 space-y-1">
            {active
              .filter((r) => !r.checkedInAt && r.paymentMethod !== "host_comp")
              .map((r) => (
                <li key={r.bookingId} className="flex items-center justify-between text-sm">
                  <span>{r.firstName} {r.lastName}</span>
                  <button type="button" className="underline" onClick={() => void mark(r.bookingId, "no_show")}>
                    Mark no-show
                  </button>
                </li>
              ))}
          </ul>
        </section>
      )}
    </main>
  );
}
```

- [ ] **Step 6: Manual verification + build + commit**

Manual: create a host via approve flow (or insert profile directly), assign a session, open `/host` on a narrow viewport (~390px via devtools; the claude-in-chrome viewport can't shrink — use code review/devtools), claim, open the game page, check someone in, share (copy path), submit wrap-up.

Run: `npm run build && npx tsc --noEmit` — expected clean.

```bash
git add src/pages/host/ src/components/host/ src/lib/dropin/share-blurb.ts tests/unit/dropin-share-blurb.test.ts
git commit -m "feat(hosts): phone-first host portal — dashboard, game day, share, wrap-up"
```

---

### Task 10: Public host display + referral-source attribution

**Files:**
- Modify: `src/pages/api/dropin/sessions/[id].ts`, `src/components/dropin/SessionDetail.tsx`, `src/components/dropin/BookButton.tsx`, `src/pages/api/dropin/bookings/index.ts`, `src/lib/dropin/booking.ts`, `src/lib/dropin/create-checkout.ts`, the Stripe webhook's dropin booking insert (find it: `grep -rn "drop_in_bookings\|dropInBookings" src/pages/api/webhooks/ src/lib/stripe/`)
- Test: extend `tests/api/dropin/book-confirmed.test.ts` (one new case)

**Interfaces:**
- Consumes: `dropInBookings.referralSource` (Task 1), `hostProfiles`/`hostUserId`.
- Produces:
  - Session detail API additionally returns `host: { firstName: string; photoUrl: string | null; bio: string | null } | null`
  - `createConfirmedBookingFreePath` accepts optional `referralSource?: string`
  - Bookings POST body accepts optional `src`; Checkout metadata carries `referralSource`; webhook insert persists it
  - `sanitizeReferralSource(raw: unknown): string | null` — exported from `src/lib/dropin/booking.ts`; returns the value only if it matches `/^[a-z0-9_-]{1,40}$/`

- [ ] **Step 1: Failing test (extend `book-confirmed.test.ts`)**

```typescript
  it("persists a sanitized referralSource", async () => {
    const ctx = await createTestDropInSession({
      capacity: 16,
      sessionRateCents: 0,
      memberRateCents: 0,
    });
    const [u] = await getDb()
      .insert(users)
      .values({ email: `t-${Date.now()}-ref@t.example`, firstName: "T", lastName: "U" })
      .returning();
    const result = await createConfirmedBookingFreePath({
      sessionId: ctx.sessionId,
      userId: u.id,
      source: "online_booking",
      referralSource: "host-share",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const [row] = await getDb()
        .select({ referralSource: dropInBookings.referralSource })
        .from(dropInBookings)
        .where(eq(dropInBookings.id, result.bookingId));
      expect(row.referralSource).toBe("host-share");
    }
  });
```

Run → FAIL (unknown option / column null).

- [ ] **Step 2: Thread `referralSource` through the free path**

In `src/lib/dropin/booking.ts`:
- Add to the opts type of `createConfirmedBookingFreePath`: `referralSource?: string;`
- In the `.values({...})` insert add: `referralSource: sanitizeReferralSource(opts.referralSource),`
- Export the sanitizer:

```typescript
/** Allow-list referral tags (?src=) so junk/URLs never land in the column. */
export function sanitizeReferralSource(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  return /^[a-z0-9_-]{1,40}$/.test(raw) ? raw : null;
}
```

- [ ] **Step 3: Accept `src` at the HTTP layer + paid path**

- `src/pages/api/dropin/bookings/index.ts`: read `src` from the POST body and pass `referralSource: src` into `createConfirmedBookingFreePath` (find the call at ~line 172). If the endpoint branches to Stripe Checkout for paid rates, pass it into the checkout creation too.
- `src/lib/dropin/create-checkout.ts`: add `referralSource` to the function's opts and put it in the Checkout session `metadata` alongside the existing dropin metadata keys.
- Webhook: find the `checkout.session.completed` handler that inserts the dropin booking; read `metadata.referralSource`, run it through `sanitizeReferralSource`, include in the insert.
- `src/components/dropin/BookButton.tsx`: on mount read `new URLSearchParams(window.location.search).get("src")` and include it as `src` in the booking POST body (and checkout kick-off body if separate).

- [ ] **Step 4: Host block on the public session page**

- `src/pages/api/dropin/sessions/[id].ts`: after loading the session, if `session.hostUserId` is set, fetch the host's first name + profile and add to the response:

```typescript
  let host: { firstName: string; photoUrl: string | null; bio: string | null } | null = null;
  if (session.hostUserId) {
    const [profile] = await db
      .select({
        firstName: users.firstName,
        bio: hostProfiles.bio,
        photoKey: hostProfiles.photoKey,
      })
      .from(hostProfiles)
      .innerJoin(users, eq(users.id, hostProfiles.userId))
      .where(
        and(
          eq(hostProfiles.userId, session.hostUserId),
          eq(hostProfiles.organizationId, session.organizationId),
          eq(hostProfiles.status, "active"),
        ),
      )
      .limit(1);
    if (profile) {
      host = {
        firstName: profile.firstName,
        bio: profile.bio,
        photoUrl: profile.photoKey
          ? process.env.R2_MOCK === "1"
            ? `https://mock-r2.local/${profile.photoKey}`
            : await getSignedGetUrl(profile.photoKey)
          : null,
      };
    }
  }
```

(Imports: `hostProfiles` from `@/lib/db/schema/hosts`, `getSignedGetUrl` from `@/lib/storage/r2`; add `host` to the JSON response.)

- `src/components/dropin/SessionDetail.tsx`: read the file, add a compact "Hosted by" block where the session metadata renders:

```tsx
  {session.host && (
    <div className="flex items-center gap-3 rounded-lg border p-3">
      {session.host.photoUrl && (
        <img
          src={session.host.photoUrl}
          alt={`${session.host.firstName}, your host`}
          className="h-12 w-12 rounded-full object-cover"
        />
      )}
      <div>
        <p className="font-medium">Hosted by {session.host.firstName} 👋</p>
        {session.host.bio && (
          <p className="text-sm text-muted-foreground">{session.host.bio}</p>
        )}
      </div>
    </div>
  )}
```

Adjust to the component's actual types/markup idiom.

- [ ] **Step 5: Run, verify, commit**

Run: `CRON_SECRET=test-cron-secret TEST_BASE_URL=http://localhost:4321 npm run test:api -- tests/api/dropin/` — all dropin suites pass (booking signature change is additive).
Run: `npx tsc --noEmit`.

```bash
git add src/lib/dropin/booking.ts src/lib/dropin/create-checkout.ts src/pages/api/dropin/ src/components/dropin/ tests/api/dropin/book-confirmed.test.ts
git commit -m "feat(hosts): public 'Hosted by' block + ?src= booking attribution"
```

(Also `git add` the webhook file you modified.)

---

### Task 11: Fill-state helper + browse chips

**Files:**
- Create: `src/lib/dropin/fill-state.ts`
- Modify: `src/pages/api/dropin/sessions/index.ts` (expose fill config in `defaults`), `src/components/dropin/SessionCard.tsx`
- Test: `tests/unit/dropin-fill-state.test.ts`

**Interfaces:**
- Produces:
  - `type FillState = "full" | "almost_full" | "filling" | "needs_players" | "open"`
  - `deriveFillState(opts: { confirmedCount: number; capacity: number; startsAt: Date; now?: Date; thresholdPct: number; windowHours: number }): FillState`
  - `FILL_STATE_LABELS: Record<FillState, string | null>` — `full: "Full"`, `almost_full: "Almost full"`, `filling: "Filling"`, `needs_players: "Needs players"`, `open: null` (no chip)
  - Listing API `defaults` gains `fillAlertThresholdPct` + `fillAlertWindowHours`

- [ ] **Step 1: Failing unit test `tests/unit/dropin-fill-state.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import { deriveFillState } from "@/lib/dropin/fill-state";

const base = {
  capacity: 10,
  thresholdPct: 60,
  windowHours: 24,
  startsAt: new Date("2026-07-14T23:00:00Z"),
};

describe("deriveFillState", () => {
  const soon = new Date("2026-07-14T13:00:00Z"); // 10h before — inside window
  const far = new Date("2026-07-10T13:00:00Z"); // 4+ days before — outside window

  it("full at capacity", () => {
    expect(deriveFillState({ ...base, confirmedCount: 10, now: soon })).toBe("full");
  });
  it("almost_full at >= 80%", () => {
    expect(deriveFillState({ ...base, confirmedCount: 8, now: soon })).toBe("almost_full");
  });
  it("filling between threshold and 80%", () => {
    expect(deriveFillState({ ...base, confirmedCount: 6, now: soon })).toBe("filling");
  });
  it("needs_players under threshold inside the window", () => {
    expect(deriveFillState({ ...base, confirmedCount: 3, now: soon })).toBe("needs_players");
  });
  it("open under threshold OUTSIDE the window (no urgency yet)", () => {
    expect(deriveFillState({ ...base, confirmedCount: 3, now: far })).toBe("open");
  });
  it("zero capacity reads as full", () => {
    expect(deriveFillState({ ...base, capacity: 0, confirmedCount: 0, now: soon })).toBe("full");
  });
});
```

Run → FAIL.

- [ ] **Step 2: Write `src/lib/dropin/fill-state.ts`**

```typescript
/**
 * Fill-state derivation shared by browse cards, the host game view, and the
 * fill-alert cron's eligibility check. Pure — org config (threshold/window)
 * comes from the rate card via the caller.
 */
export type FillState = "full" | "almost_full" | "filling" | "needs_players" | "open";

export const FILL_STATE_LABELS: Record<FillState, string | null> = {
  full: "Full",
  almost_full: "Almost full",
  filling: "Filling",
  needs_players: "Needs players",
  open: null,
};

export function deriveFillState(opts: {
  confirmedCount: number;
  capacity: number;
  startsAt: Date;
  now?: Date;
  thresholdPct: number;
  windowHours: number;
}): FillState {
  const now = opts.now ?? new Date();
  if (opts.capacity <= 0 || opts.confirmedCount >= opts.capacity) return "full";
  const pct = (opts.confirmedCount / opts.capacity) * 100;
  if (pct >= 80) return "almost_full";
  if (pct >= opts.thresholdPct) return "filling";
  const msToStart = opts.startsAt.getTime() - now.getTime();
  if (msToStart >= 0 && msToStart <= opts.windowHours * 60 * 60 * 1000) {
    return "needs_players";
  }
  return "open";
}
```

Run unit test → PASS.

- [ ] **Step 3: Expose config + render chips**

- `src/pages/api/dropin/sessions/index.ts`: add `fillAlertThresholdPct: dropInRateCard.fillAlertThresholdPct, fillAlertWindowHours: dropInRateCard.fillAlertWindowHours` to the rate-card select so they ride the existing `defaults` object.
- `src/components/dropin/SessionCard.tsx`: read the file; where the capacity meter/badge renders, derive `const state = deriveFillState({ confirmedCount, capacity, startsAt: new Date(session.startsAt), thresholdPct: defaults?.fillAlertThresholdPct ?? 60, windowHours: defaults?.fillAlertWindowHours ?? 24 })` and render `FILL_STATE_LABELS[state]` as a small chip when non-null (match the card's existing badge styling; `needs_players` gets the attention-color variant the design system uses for warnings). If `SessionCard` doesn't currently receive `defaults`, thread it down from `SessionList` (which fetches the listing response).
- `src/components/host/HostGameDay.tsx` (Task 9): optionally swap the inline spots text for the same labels — only if trivial; skip if it adds prop plumbing.

- [ ] **Step 4: Verify + commit**

Run: unit tests + `npx tsc --noEmit` + eyeball `/dropin` browse page chips with the dev server.

```bash
git add src/lib/dropin/fill-state.ts tests/unit/dropin-fill-state.test.ts src/pages/api/dropin/sessions/index.ts src/components/dropin/
git commit -m "feat(hosts): fill-state derivation + browse chips"
```

---

### Task 12: Alert subscriptions — API + signup/manage UI

**Files:**
- Create: `src/pages/api/dropin/alerts/subscriptions/index.ts`, `src/pages/api/dropin/alerts/subscriptions/[id].ts`, `src/components/dropin/PickupAlertSignup.tsx`
- Modify: `src/pages/adult/pickup.astro`, `src/pages/soccerone/pickup.astro`, `src/pages/dropin/index.astro`, `src/pages/dashboard/play.astro`
- Test: `tests/api/dropin/alert-subscriptions.test.ts`

**Interfaces:**
- Consumes: `pickupAlertSubscriptions` (Task 1), `phoneOptIns` (existing), `locals.user`/`locals.organization`.
- Produces:
  - `GET /api/dropin/alerts/subscriptions` → `{ subscriptions: Array<{ id, venueId, venueName, sport, active }>, phoneReady: boolean }`
  - `POST` body `{ venueId?: string | null; sport?: string | null }` → 200 `{ ok: true, id }` (idempotent per combo) | 409 `{ code: "phone_required" }` when no verified+opted-in phone
  - `DELETE /api/dropin/alerts/subscriptions/:id` → 200 (sets `active: false`, `unsubscribedAt`)

- [ ] **Step 1: Failing test `tests/api/dropin/alert-subscriptions.test.ts`**

Cases (use `createTestHostWithPassword`-style user factory — add `createTestUserWithPassword` to `tests/utils/host-helpers.ts` that skips the host profile; give it a `phone` opt):
1. user without phone/opt-in → POST 409 `phone_required`
2. user with `users.phone` + an `opted_in` `phone_opt_ins` row for the org → POST 200; repeat same combo → 200 with the SAME id (idempotent); GET lists it
3. DELETE → GET shows nothing active; POSTing the combo again REACTIVATES the same row (active true again)
4. cross-user DELETE (user B deleting user A's subscription id) → 404
5. unauthenticated POST → 401

Write them fully in the style of Task 7's tests (insert `phoneOptIns` rows directly via `getDb()`; check the exact `phoneOptIns` columns in `src/lib/db/schema/phone-verifications.ts` — `status: "opted_in"`, `phone`, `organizationId`, `userId`).

- [ ] **Step 2: Run → FAIL (404s)**

- [ ] **Step 3: Write the endpoints**

`src/pages/api/dropin/alerts/subscriptions/index.ts`:

```typescript
import type { APIRoute } from "astro";
import { and, asc, eq, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { pickupAlertSubscriptions } from "@/lib/db/schema/hosts";
import { phoneOptIns } from "@/lib/db/schema/phone-verifications";
import { users } from "@/lib/db/schema/users";
import { venues } from "@/lib/db/schema/teams";

export const prerender = false;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

async function phoneReady(userId: string, organizationId: string): Promise<boolean> {
  const db = getDb();
  const [u] = await db
    .select({ phone: users.phone })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!u?.phone) return false;
  const [optIn] = await db
    .select({ status: phoneOptIns.status })
    .from(phoneOptIns)
    .where(
      and(eq(phoneOptIns.organizationId, organizationId), eq(phoneOptIns.phone, u.phone)),
    )
    .orderBy(asc(phoneOptIns.createdAt))
    .limit(1);
  return optIn?.status === "opted_in";
}

export const GET: APIRoute = async ({ locals }) => {
  const user = locals.user;
  const org = locals.organization;
  if (!user) return json({ error: "Unauthorized" }, 401);
  if (!org) return json({ error: "No organization context" }, 400);

  const rows = await getDb()
    .select({
      id: pickupAlertSubscriptions.id,
      venueId: pickupAlertSubscriptions.venueId,
      venueName: venues.name,
      sport: pickupAlertSubscriptions.sport,
      active: pickupAlertSubscriptions.active,
    })
    .from(pickupAlertSubscriptions)
    .leftJoin(venues, eq(venues.id, pickupAlertSubscriptions.venueId))
    .where(
      and(
        eq(pickupAlertSubscriptions.userId, user.id),
        eq(pickupAlertSubscriptions.organizationId, org.id),
        eq(pickupAlertSubscriptions.active, true),
      ),
    )
    .orderBy(asc(pickupAlertSubscriptions.createdAt));

  return json(
    { subscriptions: rows, phoneReady: await phoneReady(user.id, org.id) },
    200,
  );
};

export const POST: APIRoute = async ({ request, locals }) => {
  const user = locals.user;
  const org = locals.organization;
  if (!user) return json({ error: "Unauthorized" }, 401);
  if (!org) return json({ error: "No organization context" }, 400);

  if (!(await phoneReady(user.id, org.id))) {
    return json(
      {
        error: "Add and verify a phone number first",
        code: "phone_required",
      },
      409,
    );
  }

  let body: { venueId?: string | null; sport?: string | null };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  const venueId = body.venueId || null;
  const sport = body.sport?.trim().toLowerCase() || null;

  const db = getDb();
  // App-level uniqueness: reuse (and reactivate) an existing row for the
  // same combo — NULLs make a DB unique index impractical here.
  const existing = await db
    .select({ id: pickupAlertSubscriptions.id })
    .from(pickupAlertSubscriptions)
    .where(
      and(
        eq(pickupAlertSubscriptions.userId, user.id),
        eq(pickupAlertSubscriptions.organizationId, org.id),
        venueId
          ? eq(pickupAlertSubscriptions.venueId, venueId)
          : isNull(pickupAlertSubscriptions.venueId),
        sport
          ? eq(pickupAlertSubscriptions.sport, sport)
          : isNull(pickupAlertSubscriptions.sport),
      ),
    )
    .orderBy(asc(pickupAlertSubscriptions.createdAt))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(pickupAlertSubscriptions)
      .set({ active: true, unsubscribedAt: null, updatedAt: new Date() })
      .where(eq(pickupAlertSubscriptions.id, existing[0].id));
    return json({ ok: true, id: existing[0].id }, 200);
  }

  const [row] = await db
    .insert(pickupAlertSubscriptions)
    .values({ userId: user.id, organizationId: org.id, venueId, sport })
    .returning({ id: pickupAlertSubscriptions.id });
  return json({ ok: true, id: row.id }, 200);
};
```

`src/pages/api/dropin/alerts/subscriptions/[id].ts`:

```typescript
import type { APIRoute } from "astro";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { pickupAlertSubscriptions } from "@/lib/db/schema/hosts";

export const prerender = false;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export const DELETE: APIRoute = async ({ params, locals }) => {
  const user = locals.user;
  if (!user) return json({ error: "Unauthorized" }, 401);
  const id = params.id;
  if (!id) return json({ error: "id required" }, 400);

  const [updated] = await getDb()
    .update(pickupAlertSubscriptions)
    .set({ active: false, unsubscribedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(pickupAlertSubscriptions.id, id),
        eq(pickupAlertSubscriptions.userId, user.id),
      ),
    )
    .returning({ id: pickupAlertSubscriptions.id });
  if (!updated) return json({ error: "Not found" }, 404);
  return json({ ok: true }, 200);
};
```

- [ ] **Step 4: Run tests → PASS**

- [ ] **Step 5: Write `src/components/dropin/PickupAlertSignup.tsx` + place it**

Card component (client:load): heading "Get a text when a game needs players", location select (venues fetched from whatever endpoint the pickup finder already uses — read `PickupPageFinder` for the venue source; fall back to "All locations"), sport select ("All sports" + the org's common labels: soccer/futsal — read what the pickup pages hardcode), Subscribe button → POST; on 409 `phone_required` render the message with a link to `/dashboard/settings` ("Verify your number first — takes 30 seconds"); signed-out state (probe `GET /api/auth/me` like Navigation does, or accept a `signedIn` prop from the Astro page's `Astro.locals.user`) renders a `/signin?redirect=` link instead. Also a `MyPickupAlerts` variant (same file, second export) listing active subscriptions with per-row "Stop texting me" (DELETE) for `/dashboard/play`.

Place `<PickupAlertSignup client:load signedIn={!!Astro.locals.user} />` on `src/pages/adult/pickup.astro`, `src/pages/soccerone/pickup.astro` (inside the SoccerOne token re-pin container — check the page's existing island wrappers; see the BrandTheme memory), and `src/pages/dropin/index.astro`; place `<MyPickupAlerts client:load />` on `src/pages/dashboard/play.astro`.

- [ ] **Step 6: Verify + commit**

Run: alert-subscriptions API tests + `npm run build` (the two prerendered-vs-SSR marketing pages must still build; both pickup pages are SSR — confirm no prerender flag on them before adding the island).

```bash
git add src/pages/api/dropin/alerts/ src/components/dropin/PickupAlertSignup.tsx src/pages/adult/pickup.astro src/pages/soccerone/pickup.astro src/pages/dropin/index.astro src/pages/dashboard/play.astro tests/api/dropin/alert-subscriptions.test.ts
git commit -m "feat(hosts): pickup alert subscriptions — API + signup/manage UI"
```

---

### Task 13: Fill-alert cron — sweep, SMS, schedule

**Files:**
- Create: `src/lib/dropin/fill-alerts.ts`, `src/pages/api/cron/check-fill-alerts.ts`, `netlify/functions/scheduled-check-fill-alerts.ts`
- Test: `tests/api/cron/fill-alerts.test.ts`

**Interfaces:**
- Consumes: `pickupAlertSubscriptions`, `pickupAlertSends`, `dropInSessions.fillAlertSentAt`, rate-card fill config (Task 1); `sendSms`, `buildShareBlurb` (Task 9), `deriveFillState` (Task 11).
- Produces: `runFillAlertSweep(now?: Date): Promise<{ sessionsAlerted: number; smsSent: number; smsSkipped: number }>`; `POST /api/cron/check-fill-alerts` (x-cron-secret), scheduled every 15 min.

- [ ] **Step 1: Failing test `tests/api/cron/fill-alerts.test.ts`**

Uses the messaging mock over HTTP: `GET/DELETE /api/test/messaging-mock` (read `src/pages/api/test/messaging-mock.ts` and `tests/api/messaging/dispatch-mock.test.ts` first for the exact contract). Cases:

```typescript
// Setup per test: session at HQ org starting in 2h, capacity 10, 0 bookings
// (under 60% threshold, inside 24h window). Subscriber = user with phone
// +1614555xxxx, users.phone set, opted_in phone_opt_ins row, active
// subscription (venueId null, sport null).

// 1. sweep sends one SMS to the subscriber; body contains a /dropin/<id> url
//    with ?src=fill-alert; a pickup_alert_sends row exists; session
//    fillAlertSentAt is stamped
// 2. second sweep run sends NOTHING (fillAlertSentAt already set)
// 3. subscriber who already has a confirmed booking on the session is skipped
// 4. venue-scoped subscription for a DIFFERENT venue is skipped
// 5. sport-scoped subscription for a different sport is skipped
// 6. daily cap: seed 2 pickup_alert_sends rows for the user today → skipped
// 7. session outside the window (starts in 3 days) or over threshold
//    (8/10 booked) → no alert, fillAlertSentAt stays null
```

Trigger via `apiFetch("/api/cron/check-fill-alerts", { method: "POST", headers: { "x-cron-secret": "test-cron-secret" } })`; clear the mock inbox between tests. Write all seven as real tests.

- [ ] **Step 2: Run → FAIL (endpoint 404)**

- [ ] **Step 3: Write `src/lib/dropin/fill-alerts.ts`**

```typescript
import { and, eq, gte, isNull, lte, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  dropInSessions,
  dropInBookings,
  dropInRateCard,
} from "@/lib/db/schema/drop-in";
import { pickupAlertSubscriptions, pickupAlertSends } from "@/lib/db/schema/hosts";
import { users } from "@/lib/db/schema/users";
import { venues } from "@/lib/db/schema/teams";
import { sendSms } from "@/lib/sms/send";
import { buildShareBlurb } from "./share-blurb";

const DAILY_CAP = 2;
// All prod orgs are Ohio today; org-level tz can replace this when needed.
const DISPLAY_TZ = "America/New_York";

/**
 * The "needs players" sweep. One blast per session EVER (fillAlertSentAt is
 * claimed via a conditional UPDATE before any SMS goes out — a crashed run
 * can't double-blast; the cost of a crash is a missed blast, not a double).
 * Per-user cap: max 2 fill-alert texts per UTC day across all sessions.
 */
export async function runFillAlertSweep(
  now: Date = new Date(),
): Promise<{ sessionsAlerted: number; smsSent: number; smsSkipped: number }> {
  const db = getDb();
  let sessionsAlerted = 0;
  let smsSent = 0;
  let smsSkipped = 0;

  // Eligible sessions: scheduled pickup, un-alerted, inside the org window,
  // under the org threshold. Window/threshold come from each org's rate card.
  const candidates = await db
    .select({
      id: dropInSessions.id,
      organizationId: dropInSessions.organizationId,
      venueId: dropInSessions.venueId,
      sport: dropInSessions.sportOrClassLabel,
      startsAt: dropInSessions.startsAt,
      capacity: dropInSessions.capacity,
      venueName: venues.name,
      thresholdPct: dropInRateCard.fillAlertThresholdPct,
      confirmedCount: sql<number>`(
        SELECT COUNT(*)::int FROM ${dropInBookings}
        WHERE ${dropInBookings.sessionId} = ${dropInSessions.id}
          AND ${dropInBookings.status} IN ('confirmed', 'pending_payment', 'pending_claim')
      )`,
    })
    .from(dropInSessions)
    .innerJoin(
      dropInRateCard,
      eq(dropInRateCard.organizationId, dropInSessions.organizationId),
    )
    .leftJoin(venues, eq(venues.id, dropInSessions.venueId))
    .where(
      and(
        eq(dropInSessions.kind, "pickup"),
        eq(dropInSessions.status, "scheduled"),
        isNull(dropInSessions.fillAlertSentAt),
        gte(dropInSessions.startsAt, now),
        lte(
          dropInSessions.startsAt,
          sql`${now.toISOString()}::timestamptz + make_interval(hours => ${dropInRateCard.fillAlertWindowHours})`,
        ),
      ),
    );

  const appUrl = (process.env.PUBLIC_APP_URL ?? "http://localhost:4321").replace(/\/$/, "");
  const dayStart = new Date(now);
  dayStart.setUTCHours(0, 0, 0, 0);

  for (const session of candidates) {
    if (session.capacity <= 0) continue;
    const pct = (session.confirmedCount / session.capacity) * 100;
    if (pct >= session.thresholdPct) continue;

    // Claim the blast (stamp-then-send).
    const claimed = await db
      .update(dropInSessions)
      .set({ fillAlertSentAt: now, updatedAt: now })
      .where(
        and(eq(dropInSessions.id, session.id), isNull(dropInSessions.fillAlertSentAt)),
      )
      .returning({ id: dropInSessions.id });
    if (claimed.length === 0) continue; // another run got it
    sessionsAlerted++;

    // Matching subscribers with a phone, excluding active bookers.
    const subscribers = await db
      .select({
        userId: pickupAlertSubscriptions.userId,
        phone: users.phone,
      })
      .from(pickupAlertSubscriptions)
      .innerJoin(users, eq(users.id, pickupAlertSubscriptions.userId))
      .where(
        and(
          eq(pickupAlertSubscriptions.organizationId, session.organizationId),
          eq(pickupAlertSubscriptions.active, true),
          sql`(${pickupAlertSubscriptions.venueId} IS NULL OR ${pickupAlertSubscriptions.venueId} = ${session.venueId})`,
          sql`(${pickupAlertSubscriptions.sport} IS NULL OR lower(${pickupAlertSubscriptions.sport}) = lower(${session.sport}))`,
          sql`${users.phone} IS NOT NULL`,
          sql`NOT EXISTS (
            SELECT 1 FROM ${dropInBookings} b
            WHERE b.session_id = ${session.id}
              AND b.user_id = ${pickupAlertSubscriptions.userId}
              AND b.status IN ('confirmed', 'waitlisted', 'pending_claim', 'pending_payment')
          )`,
        ),
      );

    const spotsLeft = session.capacity - session.confirmedCount;
    const body = buildShareBlurb({
      sport: session.sport,
      venueName: session.venueName,
      startsAt: session.startsAt,
      spotsLeft,
      url: `${appUrl}/dropin/${session.id}?src=fill-alert`,
      timeZone: DISPLAY_TZ,
    });

    const seenUsers = new Set<string>();
    for (const sub of subscribers) {
      if (seenUsers.has(sub.userId)) continue; // overlapping subscriptions
      seenUsers.add(sub.userId);

      const [{ sentToday }] = await db
        .select({ sentToday: sql<number>`count(*)::int` })
        .from(pickupAlertSends)
        .where(
          and(eq(pickupAlertSends.userId, sub.userId), gte(pickupAlertSends.sentAt, dayStart)),
        );
      if (sentToday >= DAILY_CAP) {
        smsSkipped++;
        continue;
      }

      const result = await sendSms({
        to: sub.phone!,
        body,
        organizationId: session.organizationId,
      });
      if (result.ok) {
        smsSent++;
        await db
          .insert(pickupAlertSends)
          .values({ sessionId: session.id, userId: sub.userId, sentAt: now });
      } else {
        smsSkipped++;
      }
    }
  }

  return { sessionsAlerted, smsSent, smsSkipped };
}
```

- [ ] **Step 4: Write the cron endpoint + scheduled function**

`src/pages/api/cron/check-fill-alerts.ts` — copy `expire-pending-claims.ts` verbatim structure: same x-cron-secret gate, same `warmDbConnection()`, call `runFillAlertSweep()`, log `[cron] Fill alerts: sessions=… sent=… skipped=… in …ms`, same GET describing usage.

`netlify/functions/scheduled-check-fill-alerts.ts` — copy `scheduled-expire-pending-claims.ts` verbatim, change `ROUTE` to `/api/cron/check-fill-alerts` and the cron expression to `"*/15 * * * *"`, update the log prefixes.

- [ ] **Step 5: Run tests → PASS, commit**

Run: `CRON_SECRET=test-cron-secret TEST_BASE_URL=http://localhost:4321 npm run test:api -- tests/api/cron/fill-alerts.test.ts`

```bash
git add src/lib/dropin/fill-alerts.ts src/pages/api/cron/check-fill-alerts.ts netlify/functions/scheduled-check-fill-alerts.ts tests/api/cron/fill-alerts.test.ts
git commit -m "feat(hosts): needs-players fill-alert cron — one blast/session, 2/day/user cap"
```

---

### Task 14: Lifecycle — session cancel, host pause/revoke, admin UI

**Files:**
- Modify: `src/pages/api/admin/dropin/sessions/[id]/cancel.ts`, `src/components/admin/dropin/SessionForm.tsx`, `src/components/admin/dropin/AdminSessionDetail.tsx`, `src/pages/admin/dropins.astro`
- Create: `src/pages/api/admin/hosts/index.ts`, `src/pages/api/admin/hosts/[id].ts`, `src/components/admin/dropin/HostsPanel.tsx`
- Test: `tests/api/host/admin-hosts.test.ts`

**Interfaces:**
- Produces:
  - `GET /api/admin/hosts` → `{ hosts: Array<{ id, userId, firstName, lastName, email, status, preferredVenueId, venueName, gamesHosted: number, lastReportAt: string | null, incidentCount: number }> }`
  - `PATCH /api/admin/hosts/:id` body `{ status: "active" | "paused" | "revoked" }` → 200; `revoked`/`paused` additionally unassigns the host from all FUTURE scheduled sessions (via `removeHostFromSession(..., reason: "host_revoked")` per session) and reports `{ unassignedSessions: number }`
  - Session cancel flow: cancels the comp booking + clears host, and includes the host in whatever notification dispatch the cancel already does

- [ ] **Step 1: Failing test `tests/api/host/admin-hosts.test.ts`**

Cases (admin cookie, HQ org fixtures):
1. GET lists a created host with status + venueName
2. PATCH pause → host can no longer claim (claim endpoint 403s)
3. PATCH revoke on a host with 2 future hosted sessions → both sessions have `hostUserId` null and cancelled comp bookings; response `unassignedSessions: 2`
4. PATCH active reactivates
5. cross-org: admin of org A PATCHing a host profile of org B → 404 (create the org-B host via `createTestHost` on a fresh `createTestGameContext` org and hit with the HQ admin cookie)

- [ ] **Step 2: Run → FAIL. Write the two endpoints**

`src/pages/api/admin/hosts/index.ts`:

```typescript
import type { APIRoute } from "astro";
import { and, asc, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { hostProfiles, hostGameReports } from "@/lib/db/schema/hosts";
import { dropInSessions } from "@/lib/db/schema/drop-in";
import { users } from "@/lib/db/schema/users";
import { venues } from "@/lib/db/schema/teams";
import { requireOrgAdminAccess } from "@/lib/auth/roles";

export const prerender = false;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

/** GET /api/admin/hosts — host roster for the admin Hosts tab + session-form picker. */
export const GET: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;

  const rows = await getDb()
    .select({
      id: hostProfiles.id,
      userId: hostProfiles.userId,
      status: hostProfiles.status,
      preferredVenueId: hostProfiles.preferredVenueId,
      venueName: venues.name,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
      gamesHosted: sql<number>`(
        SELECT COUNT(*)::int FROM ${dropInSessions}
        WHERE ${dropInSessions.hostUserId} = ${hostProfiles.userId}
          AND ${dropInSessions.organizationId} = ${hostProfiles.organizationId}
      )`,
      lastReportAt: sql<string | null>`(
        SELECT MAX(r.created_at) FROM ${hostGameReports} r
        WHERE r.host_profile_id = ${hostProfiles.id}
      )`,
      incidentCount: sql<number>`(
        SELECT COUNT(*)::int FROM ${hostGameReports} r
        WHERE r.host_profile_id = ${hostProfiles.id} AND r.incident_flagged
      )`,
    })
    .from(hostProfiles)
    .innerJoin(users, eq(users.id, hostProfiles.userId))
    .leftJoin(venues, eq(venues.id, hostProfiles.preferredVenueId))
    .where(eq(hostProfiles.organizationId, auth.organizationId))
    .orderBy(asc(hostProfiles.createdAt));

  return json({ hosts: rows }, 200);
};
```

`src/pages/api/admin/hosts/[id].ts`:

```typescript
import type { APIRoute } from "astro";
import { and, asc, eq, gte } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { hostProfiles } from "@/lib/db/schema/hosts";
import { dropInSessions } from "@/lib/db/schema/drop-in";
import { requireOrgAdminAccess } from "@/lib/auth/roles";
import { removeHostFromSession } from "@/lib/dropin/host-assignment";

export const prerender = false;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

/** PATCH /api/admin/hosts/:id — pause/revoke/reactivate a host. */
export const PATCH: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;

  const id = context.params.id;
  if (!id) return json({ error: "id required" }, 400);

  let body: { status?: string };
  try {
    body = await context.request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  if (!["active", "paused", "revoked"].includes(body.status ?? "")) {
    return json({ error: "status must be active | paused | revoked" }, 400);
  }
  const status = body.status as "active" | "paused" | "revoked";

  const db = getDb();
  const [profile] = await db
    .select()
    .from(hostProfiles)
    .where(
      and(eq(hostProfiles.id, id), eq(hostProfiles.organizationId, auth.organizationId)),
    )
    .orderBy(asc(hostProfiles.createdAt))
    .limit(1);
  if (!profile) return json({ error: "Host not found" }, 404);

  await db
    .update(hostProfiles)
    .set({ status, updatedAt: new Date() })
    .where(eq(hostProfiles.id, id));

  // Leaving active status → strip future assignments (past games keep the
  // historical record).
  let unassignedSessions = 0;
  if (status !== "active") {
    const future = await db
      .select({ id: dropInSessions.id })
      .from(dropInSessions)
      .where(
        and(
          eq(dropInSessions.hostUserId, profile.userId),
          eq(dropInSessions.organizationId, auth.organizationId),
          eq(dropInSessions.status, "scheduled"),
          gte(dropInSessions.startsAt, new Date()),
        ),
      );
    for (const session of future) {
      await removeHostFromSession({ sessionId: session.id, reason: "host_revoked" });
      unassignedSessions++;
    }
  }
  return json({ ok: true, status, unassignedSessions }, 200);
};
```

- [ ] **Step 3: Session-cancel integration**

Read `src/pages/api/admin/dropin/sessions/[id]/cancel.ts` (119 lines). Add, inside its cancellation transaction/flow BEFORE bookings are swept: if `session.hostUserId`, call `removeHostFromSession({ sessionId: id, reason: "session_cancelled" })` — order matters so the comp booking is cancelled with the host reason rather than swept as a refundable booking (host_comp rows have no payment to refund; verify the sweep skips `amountPaidCents = 0` rows or handles them gracefully — read the refund logic and adjust the guard if it assumes a paymentIntent). The host is notified through the same booking-cancellation dispatch every other booker gets (their comp booking's cancellation notice) — no extra channel needed for v1.

Add a case to the existing cancel test file (`tests/api/dropin/cancel.test.ts`) : cancelling a hosted session clears `hostUserId` and cancels the comp booking without error.

- [ ] **Step 4: Admin UI**

- `src/components/admin/dropin/SessionForm.tsx` (read first): add a "Host (optional)" select fetching `GET /api/admin/hosts` (filter `status === "active"`), storing `hostUserId`. On save of an EXISTING session where the host changed, call `PUT /api/admin/dropin/sessions/{id}/host` with `{ hostUserId, replace: true }` (or `DELETE` when cleared) after the main session save succeeds. For a NEW session, call the same `PUT` right after creation returns the id (keeps hostUserId writes inside the guarded lib — the session create/update endpoints do NOT accept hostUserId directly).
- `src/components/admin/dropin/AdminSessionDetail.tsx` (read first): show "Host: {name}" with Remove (DELETE + confirm) and Change (select + PUT replace) controls; render the wrap-up report (query it into the detail endpoint the component already uses, or fetch `GET /api/admin/hosts` and match — simplest: extend the admin session detail API this component reads with `host: { name } | null` and `report: { summary, incidentFlagged, createdAt } | null`).
- `src/components/admin/dropin/HostsPanel.tsx` (new): table of `GET /api/admin/hosts` rows — name, email, status badge, preferred venue, games hosted, last report, incident count; Pause/Revoke/Reactivate buttons calling PATCH with a `confirm()`-free custom confirm (match the repo's existing destructive-action pattern in `SessionsList.tsx`).
- `src/pages/admin/dropins.astro` (read first): add a "Hosts" tab rendering `<HostsPanel client:load />` following the existing SessionsList/RateCardEditor tab wiring.

- [ ] **Step 5: Run all host + dropin tests, verify, commit**

Run: `CRON_SECRET=test-cron-secret TEST_BASE_URL=http://localhost:4321 npm run test:api -- tests/api/host/ tests/api/dropin/` and `npx tsc --noEmit`.

```bash
git add src/pages/api/admin/hosts/ "src/pages/api/admin/dropin/sessions/[id]/cancel.ts" src/components/admin/dropin/ src/pages/admin/dropins.astro tests/api/host/admin-hosts.test.ts tests/api/dropin/cancel.test.ts
git commit -m "feat(hosts): host lifecycle — pause/revoke sweep, cancel integration, admin hosts tab"
```

---

### Task 15: E2E happy path, seed fixture, full pre-push verification

**Files:**
- Modify: `src/lib/db/seeds/seed-e2e-tests.ts`
- Create: `tests/e2e/host-portal.spec.ts`

**Interfaces:**
- Consumes: everything above.
- Produces: seeded `host@test.aspiresports.com` / `TestHost123!` with an active host profile + one unhosted future pickup session fixture; a Playwright spec covering claim → check-in → wrap-up.

- [ ] **Step 1: Seed fixture**

Read `seed-e2e-tests.ts` to find the user-creation helper it uses (it seeds `admin/coach/parent@test.aspiresports.com`). Add, following the exact same idempotent pattern:
- user `host@test.aspiresports.com` / password `TestHost123!`
- an ACTIVE `host_profiles` row for that user in the main seeded org (idempotent: select-before-insert on (userId, organizationId))
- one future unhosted pickup session (idempotent by a fixed marker — e.g. `sportOrClassLabel: "soccer"`, `formatLabel: "e2e-host-fixture"`, starts 7 days out, capacity 10; select-before-insert on `formatLabel`), plus one confirmed player booking on it from the parent test user so the roster has someone to check in
- one ALREADY-STARTED hosted session for the wrap-up path (`formatLabel: "e2e-host-wrapup-fixture"`, startsAt 30 minutes ago, endsAt 1 hour out, `hostUserId` = the host user, plus their comp booking) — on re-seed, reset it: delete its `host_game_reports` row and re-point startsAt so the spec can submit a wrap-up every run

Run: `./scripts/with-bws.sh npm run db:seed:e2e` — completes without error, twice (idempotence).

- [ ] **Step 2: Write `tests/e2e/host-portal.spec.ts`**

```typescript
import { test, expect } from "@playwright/test";
import { signIn, waitForHydration } from "../utils/test-helpers";

// Post-merge only (test-full) — run locally before merging:
// PLAYWRIGHT_BASE_URL=http://localhost:4321 npm test -- host-portal

test("host claims a game, checks a player in, submits wrap-up UI is gated", async ({ page }) => {
  await signIn(page, "host@test.aspiresports.com", "TestHost123!");
  await page.goto("/host");
  await waitForHydration(page);

  // Claim the seeded fixture game (idempotent runs: it may already be
  // claimed by a previous run — accept either state).
  const claimable = page.getByTestId("host-claimable-games");
  const claimButton = claimable.getByRole("button", { name: "Claim" }).first();
  if (await claimButton.isVisible().catch(() => false)) {
    await claimButton.click();
  }
  await expect(page.getByTestId("host-my-games").locator("a").first()).toBeVisible();

  // Open game day.
  await page.getByTestId("host-my-games").locator("a").first().click();
  await waitForHydration(page);
  await expect(page.getByTestId("fill-meter")).toBeVisible();
  await expect(page.getByTestId("share-game")).toBeVisible();

  // Check the seeded parent player in (undo afterwards to keep re-runs clean).
  const checkIn = page.getByRole("button", { name: "Check in" }).first();
  await checkIn.click();
  await expect(page.getByRole("button", { name: "✓ Here" }).first()).toBeVisible();
  await page.getByRole("button", { name: "✓ Here" }).first().click();

  // Wrap-up section is hidden for a future game (fixture starts in 7 days).
  await expect(page.getByTestId("wrapup-summary")).toHaveCount(0);
});

test("host submits a wrap-up on the started fixture game", async ({ page }) => {
  await signIn(page, "host@test.aspiresports.com", "TestHost123!");
  await page.goto("/host");
  await waitForHydration(page);

  // The seeded wrap-up fixture (already started, already hosted by this
  // user) appears in "My games" — find it by its format label text.
  await page
    .getByTestId("host-my-games")
    .locator("a", { hasText: "e2e-host-wrapup-fixture" })
    .first()
    .click();
  await waitForHydration(page);

  await page.getByTestId("wrapup-summary").fill("Great turnout, teams were even.");
  await page.getByTestId("wrapup-submit").click();
  await expect(page.getByText("Wrap-up submitted")).toBeVisible();
});
```

Adjust the `signIn` helper call to its real signature (check `tests/utils/test-helpers.ts:85`).

- [ ] **Step 3: Run the spec locally**

Run: `PLAYWRIGHT_BASE_URL=http://localhost:4321 npm test -- host-portal`
Expected: PASS. (This spec only runs post-merge in CI — the local run IS the gate.)

- [ ] **Step 4: Full pre-push checklist (CLAUDE.md)**

1. Migration exists + committed (Task 1) ✓
2. `./scripts/with-bws.sh npm run db:seed:e2e` (again, after all changes)
3. `CRON_SECRET=test-cron-secret TEST_BASE_URL=http://localhost:4321 npm run test:api` — FULL suite. Known pre-existing staging failures (see memory: 2 API + 4 Playwright are data-state) may appear; triage by file-overlap with this branch — anything touching dropin/careers/host/cron-fill files must be investigated.
4. `PLAYWRIGHT_BASE_URL=http://localhost:4321 npm test` — full Playwright, same triage rule. Also grep `tests/e2e/` for specs touching `/admin/dropins`, `/dropin`, `/careers`, `/dashboard/play` and re-run those specifically (this branch changes those surfaces).
5. `npm run build` — zero new warnings beyond the known prerender-headers noise.
6. `npx tsc --noEmit` — zero errors.

- [ ] **Step 5: Commit + PR**

```bash
git add src/lib/db/seeds/seed-e2e-tests.ts tests/e2e/host-portal.spec.ts
git commit -m "feat(hosts): e2e host fixture + host portal happy-path spec"
```

Then push and open the PR (`gh pr create`) with a body covering: the three features, the capacity-bypass decision, the R2 CORS ops step (bucket must allow browser PUT from app origins before host applications work in prod), and the note that host e2e runs post-merge. CI green on origin = done; wait for it.

---

## Execution notes

- Tasks 1→3 are strictly sequential (schema → helpers → lib). Tasks 4–6 (application pipeline) and 7–9 (portal) are two independent chains after Task 2/3. Tasks 11–13 (fill/alerts) depend on Task 1 only — 11 and 12 can run in parallel with 7–9. Task 10 needs 1+2; Task 14 needs 3; Task 15 is last.
- Recommended order for a single worker: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15.
- Subagents: dispatch with the worktree's absolute path in every prompt (memory: subagents pin to the main checkout otherwise). Do not run the full 15+ minute suites inside a subagent (memory: they stall) — the controller runs them as background Bash.
- Port collision: if another session has the dev server on 4321, this worktree's server must use a different port and `TEST_BASE_URL`/`PLAYWRIGHT_BASE_URL` must match (memory: concurrent-session hazards).


