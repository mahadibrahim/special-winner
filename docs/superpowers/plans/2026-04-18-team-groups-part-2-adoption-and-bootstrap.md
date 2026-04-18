# Team Groups — Part 2: Adoption Mechanics & Operational Bootstrap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the adoption loop on the team groups feature. Parents can link Telegram during registration, see a nudge banner on the dashboard if unlinked, leave/rejoin team groups individually, and admins can promote pending-manual-creation groups to active via UI. Also wire up adoption metrics and migrate day-before reminders through the new broadcast pipeline.

**Architecture:** New API endpoints + React components, extensions to existing registration wizard and parent dashboard. No schema changes beyond one optional `user_nudge_state` table for banner dismissal tracking. All new API routes follow the admin/dashboard API patterns established in Part 1. Tests are API-level integration tests matching `tests/api/` conventions.

**Tech Stack:** Astro 5, React 19, Drizzle ORM, PostgreSQL, Vitest. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-04-18-team-groups-and-channel-routing-design.md` (sections: Onboarding and adoption, Team groups lifecycle → pending_manual_creation, Compose flow → automated broadcasts)

**Depends on:** `feat/team-groups-part-1` merged to main (done: commit 959e379).

**Out of scope for this plan (Part 3 / later):**
- Per-org custom Telegram bots
- Player groups for U14+
- Coach reply inbox / conversation threading
- Outbox / durable job queue
- `initiatorType` field on `scheduled_broadcasts` (tracked as follow-up)

---

## File structure

### New schema
- `src/lib/db/schema/user-nudge-state.ts` — tracks when a user last saw/dismissed the Telegram nudge banner

### Modified schema
- `src/lib/db/schema/index.ts` — export the new schema file

### New API endpoints
- `src/pages/api/admin/teams/[teamId]/group/promote.ts` — admin promotes a pending_manual_creation group to active
- `src/pages/api/dashboard/team-groups/[teamGroupId]/leave.ts` — parent leaves a group
- `src/pages/api/dashboard/team-groups/[teamGroupId]/rejoin.ts` — parent rejoins
- `src/pages/api/dashboard/team-groups.ts` — GET list of a parent's current team groups (for dashboard)
- `src/pages/api/dashboard/nudge/dismiss.ts` — parent dismisses the Telegram nudge banner
- `src/pages/api/admin/metrics/messaging.ts` — adoption metrics (link rate, join rate)

### Modified API
- `src/lib/messaging/notifications.ts` — migrate `sendDayBeforeReminders` to use `composeBroadcast`

### New UI components
- `src/components/admin/promote-team-group-form.tsx` — admin UI to paste Telegram chat_id and promote
- `src/components/dashboard/telegram-connect-banner.tsx` — dismissible nudge banner
- `src/components/dashboard/team-groups-panel.tsx` — list of the parent's groups with leave/rejoin
- `src/components/admin/messaging-metrics-card.tsx` — admin dashboard metric block
- `src/components/registration/telegram-connect-step.tsx` — wizard step component

### Modified UI
- `src/components/registration/registration-wizard.tsx` — inject the Telegram step after payment, before confirmation
- `src/pages/dashboard/index.astro` — render `TelegramConnectBanner` at top for unlinked parents
- `src/pages/dashboard/team.astro` (or equivalent) — render `TeamGroupsPanel`
- `src/pages/admin/teams/[id].astro` — render `PromoteTeamGroupForm` when group is pending_manual_creation
- `src/pages/admin/index.astro` — render `MessagingMetricsCard` (or wherever admin dashboard lives)

### Email template update
- `src/lib/email/templates/registration-confirmation.tsx` — add "Connect Telegram" footer CTA for non-linked parents

### New tests
- `tests/api/admin/promote-team-group.test.ts`
- `tests/api/dashboard/team-groups.test.ts` (covers GET + leave + rejoin + nudge/dismiss)
- `tests/api/admin/messaging-metrics.test.ts`

---

## Conventions

- Tests hit `localhost:4321`. Start `npm run dev` in another terminal.
- Use existing helpers from `tests/api/setup/test-helpers.ts` — `getAdminCookie`, `getParentCookie` (or equivalent), `apiFetch`, `expectJson`, `resetCookies`, `testSlug`.
- Auth patterns: admin endpoints use `requireAdminAccess`; dashboard endpoints use `requireParentAccess` or the equivalent parent auth helper — **read an existing `src/pages/api/dashboard/*.ts` file to find the correct one**.
- Follow the existing file layout: schema files in `src/lib/db/schema/`, API in `src/pages/api/`, React components in `src/components/`.
- Never skip commit hooks.
- When modifying an existing file (registration-wizard, dashboard index, email template), **read it first** — the codebase is opinionated about structure and the plan's code snippets may need adapting.

---

## Task 1: Schema — user_nudge_state

**Files:**
- Create: `src/lib/db/schema/user-nudge-state.ts`
- Modify: `src/lib/db/schema/index.ts`

- [ ] **Step 1: Create the schema file**

```typescript
import { pgTable, uuid, timestamp, varchar, integer, index, uniqueIndex } from "drizzle-orm/pg-core"
import { relations } from "drizzle-orm"
import { users } from "./users"

export const userNudgeState = pgTable(
  "user_nudge_state",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    nudgeKey: varchar("nudge_key", { length: 50 }).notNull(), // e.g., "telegram_connect_banner"
    lastShownAt: timestamp("last_shown_at", { withTimezone: true }),
    lastDismissedAt: timestamp("last_dismissed_at", { withTimezone: true }),
    dismissalCount: integer("dismissal_count").notNull().default(0),
    tappedAt: timestamp("tapped_at", { withTimezone: true }), // user acted on the nudge (opened connect flow)
  },
  (t) => ({
    userNudgeUnique: uniqueIndex("user_nudge_state_user_key_unique").on(t.userId, t.nudgeKey),
    userIdx: index("user_nudge_state_user_idx").on(t.userId),
  }),
)

export const userNudgeStateRelations = relations(userNudgeState, ({ one }) => ({
  user: one(users, { fields: [userNudgeState.userId], references: [users.id] }),
}))

export type UserNudgeState = typeof userNudgeState.$inferSelect
export type NewUserNudgeState = typeof userNudgeState.$inferInsert
```

- [ ] **Step 2: Add export to index.ts**

Add `export * from "./user-nudge-state"` to `src/lib/db/schema/index.ts`.

- [ ] **Step 3: Generate and apply migration**

```bash
npm run db:generate
npm run db:push
```

Confirm no errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/db/schema/user-nudge-state.ts src/lib/db/schema/index.ts src/lib/db/migrations/
git commit -m "feat: add user_nudge_state schema for nudge banner tracking"
```

---

## Task 2: Admin promote-team-group API + test

**Files:**
- Create: `src/pages/api/admin/teams/[teamId]/group/promote.ts`
- Create: `tests/api/admin/promote-team-group.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { getAdminCookie, apiFetch, expectJson, resetCookies } from "../../setup/test-helpers"

describe("Admin: promote team group", () => {
  let adminCookie: string
  const VALID_FAKE_UUID = "00000000-0000-4000-8000-000000000001"

  beforeAll(async () => { adminCookie = await getAdminCookie() })
  afterAll(() => resetCookies())

  it("requires admin auth (401 without cookie)", async () => {
    const res = await apiFetch(`/api/admin/teams/${VALID_FAKE_UUID}/group/promote`, {
      method: "POST",
      body: JSON.stringify({ telegramChatId: "-1001234567890" }),
    })
    expect([401, 403]).toContain(res.status)
  })

  it("returns 400 when telegramChatId is missing", async () => {
    const res = await apiFetch(`/api/admin/teams/${VALID_FAKE_UUID}/group/promote`, {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({}),
    })
    expect(res.status).toBe(400)
  })

  it("returns 404 when no pending team group exists for that team", async () => {
    const res = await apiFetch(`/api/admin/teams/${VALID_FAKE_UUID}/group/promote`, {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({ telegramChatId: "-1001234567890" }),
    })
    expect(res.status).toBe(404)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm run test:api -- tests/api/admin/promote-team-group.test.ts
```

Expected: FAIL (404 on all because endpoint doesn't exist).

- [ ] **Step 3: Write the endpoint**

```typescript
import type { APIRoute } from "astro"
import { z } from "zod"
import { getDb } from "@/lib/db"
import { teamGroups } from "@/lib/db/schema"
import { and, eq, ne } from "drizzle-orm"
import { requireAdminAccess } from "@/lib/auth"
import { promoteGroupToActive } from "@/lib/messaging/group-lifecycle"

export const prerender = false

const PromoteSchema = z.object({
  telegramChatId: z.string().min(1).max(100),
})

export const POST: APIRoute = async (context) => {
  const adminAuth = await requireAdminAccess(context)
  if (!adminAuth.authorized) return adminAuth.response

  const teamId = context.params.teamId
  if (!teamId) {
    return new Response(JSON.stringify({ error: "teamId required" }), { status: 400 })
  }

  let raw: unknown
  try { raw = await context.request.json() } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400 })
  }
  const parsed = PromoteSchema.safeParse(raw)
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ error: "Invalid payload", details: parsed.error.format() }),
      { status: 400 },
    )
  }

  const db = getDb()
  const pending = await db.query.teamGroups.findFirst({
    where: and(
      eq(teamGroups.teamId, teamId),
      ne(teamGroups.status, "archived"),
    ),
  })
  if (!pending) {
    return new Response(JSON.stringify({ error: "No team group for this team" }), { status: 404 })
  }
  if (pending.status === "active") {
    return new Response(JSON.stringify({ error: "Team group is already active" }), { status: 409 })
  }

  try {
    await promoteGroupToActive(pending.id, parsed.data.telegramChatId)
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Promotion failed", details: String(err) }),
      { status: 500 },
    )
  }

  return new Response(JSON.stringify({ ok: true, teamGroupId: pending.id }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm run test:api -- tests/api/admin/promote-team-group.test.ts
```

Expected: PASS (all three cases).

- [ ] **Step 5: Commit**

```bash
git add src/pages/api/admin/teams/\[teamId\]/group/promote.ts tests/api/admin/promote-team-group.test.ts
git commit -m "feat: admin endpoint to promote team group to active"
```

---

## Task 3: Admin promote-team-group UI

**Files:**
- Create: `src/components/admin/promote-team-group-form.tsx`
- Modify: `src/pages/admin/teams/[id].astro` (or wherever the team admin detail page lives)

- [ ] **Step 1: Read existing team admin page**

Read `src/pages/admin/teams/[id].astro` to understand how the team detail page fetches data and where to inject a new section.

- [ ] **Step 2: Write the component**

```typescript
"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"

type Props = {
  teamId: string
  currentStatus: string // 'scheduled' | 'pending_manual_creation' | 'active' | etc.
  groupName: string
  onPromoted?: () => void
}

export function PromoteTeamGroupForm({ teamId, currentStatus, groupName, onPromoted }: Props) {
  const [chatId, setChatId] = useState("")
  const [submitting, setSubmitting] = useState(false)

  if (currentStatus === "active") {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm">
        Team group is active.
      </div>
    )
  }

  async function submit() {
    if (!chatId.trim()) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/admin/teams/${teamId}/group/promote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telegramChatId: chatId.trim() }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error ?? "Promotion failed")
      }
      toast.success("Team group is now active. Invites have been sent.")
      setChatId("")
      onPromoted?.()
    } catch (err) {
      toast.error(String(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div>
        <div className="mb-1 text-sm font-medium">Promote team group to active</div>
        <div className="text-xs text-gray-500">
          Create the Supergroup in Telegram, add the bot as admin, then paste the chat ID here.
          See the operator runbook for the full flow.
        </div>
      </div>

      <div>
        <Label htmlFor="chatId">Telegram chat ID</Label>
        <Input
          id="chatId"
          value={chatId}
          onChange={(e) => setChatId(e.target.value)}
          placeholder="-1001234567890"
          disabled={submitting}
        />
        <div className="mt-1 text-xs text-gray-500">
          Forward any group message to @getidsbot in Telegram to find the chat ID.
        </div>
      </div>

      <Button onClick={submit} disabled={submitting || !chatId.trim()}>
        {submitting ? "Promoting…" : `Promote "${groupName}"`}
      </Button>
    </div>
  )
}
```

- [ ] **Step 3: Wire into the admin team page**

Fetch the existing team group state in the admin page (or via a client-side fetch) and render `<PromoteTeamGroupForm />` conditionally when there's a non-archived group. Exact integration depends on the existing page structure — mirror how `team-broadcast-section.tsx` was added in Part 1.

- [ ] **Step 4: Sanity check build**

```bash
npm run build 2>&1 | tail -15
```

No errors. If errors, fix before committing.

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/promote-team-group-form.tsx src/pages/admin/teams/\[id\].astro
git commit -m "feat: admin UI for promoting pending team groups"
```

---

## Task 4: Dashboard team-groups API (list, leave, rejoin) + tests

**Files:**
- Create: `src/pages/api/dashboard/team-groups.ts` (GET list)
- Create: `src/pages/api/dashboard/team-groups/[teamGroupId]/leave.ts`
- Create: `src/pages/api/dashboard/team-groups/[teamGroupId]/rejoin.ts`
- Create: `tests/api/dashboard/team-groups.test.ts`

- [ ] **Step 1: Read the parent-auth helper pattern**

Read `src/pages/api/dashboard/settings.ts` or any existing `src/pages/api/dashboard/*.ts` route to find the parent-auth helper name (e.g., `requireParentAccess`, `requireDashboardAccess`, or check `locals.user` directly). Use that pattern.

- [ ] **Step 2: Write the failing tests**

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { getParentCookie, apiFetch, expectJson, resetCookies } from "../setup/test-helpers"

const VALID_FAKE_UUID = "00000000-0000-4000-8000-000000000001"

describe("Dashboard: team groups", () => {
  let parentCookie: string

  beforeAll(async () => { parentCookie = await getParentCookie() })
  afterAll(() => resetCookies())

  it("GET requires parent auth (401)", async () => {
    const res = await apiFetch("/api/dashboard/team-groups", { method: "GET" })
    expect(res.status).toBe(401)
  })

  it("GET lists the parent's current team groups (200)", async () => {
    const res = await apiFetch("/api/dashboard/team-groups", { method: "GET", cookie: parentCookie })
    const json = await expectJson(res, 200)
    expect(Array.isArray(json.teamGroups)).toBe(true)
    // Each entry should have shape { id, name, status, joined, optedOut }
    for (const g of json.teamGroups) {
      expect(typeof g.id).toBe("string")
      expect(typeof g.name).toBe("string")
      expect(typeof g.status).toBe("string")
    }
  })

  it("POST leave requires parent auth (401)", async () => {
    const res = await apiFetch(`/api/dashboard/team-groups/${VALID_FAKE_UUID}/leave`, { method: "POST" })
    expect(res.status).toBe(401)
  })

  it("POST leave on nonexistent group returns 404", async () => {
    const res = await apiFetch(`/api/dashboard/team-groups/${VALID_FAKE_UUID}/leave`, {
      method: "POST",
      cookie: parentCookie,
    })
    expect(res.status).toBe(404)
  })

  it("POST rejoin on nonexistent group returns 404", async () => {
    const res = await apiFetch(`/api/dashboard/team-groups/${VALID_FAKE_UUID}/rejoin`, {
      method: "POST",
      cookie: parentCookie,
    })
    expect(res.status).toBe(404)
  })
})
```

- [ ] **Step 3: Run to verify fail**

```bash
npm run test:api -- tests/api/dashboard/team-groups.test.ts
```

Expected: FAIL on all but the unauthenticated check.

- [ ] **Step 4: Write GET list endpoint**

`src/pages/api/dashboard/team-groups.ts`:

```typescript
import type { APIRoute } from "astro"
import { getDb } from "@/lib/db"
import { teamGroups, teamGroupMemberships } from "@/lib/db/schema"
import { and, eq, inArray, isNull } from "drizzle-orm"

export const prerender = false

export const GET: APIRoute = async ({ locals }) => {
  if (!locals.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 })
  }

  const db = getDb()
  // Find all memberships for this user that are not archived, including opted-out
  const memberships = await db
    .select({
      id: teamGroupMemberships.id,
      teamGroupId: teamGroupMemberships.teamGroupId,
      joinedAt: teamGroupMemberships.joinedAt,
      optedOutAt: teamGroupMemberships.optedOutAt,
      removedAt: teamGroupMemberships.removedAt,
    })
    .from(teamGroupMemberships)
    .where(eq(teamGroupMemberships.userId, locals.user.id))

  if (memberships.length === 0) {
    return new Response(JSON.stringify({ teamGroups: [] }), { status: 200, headers: { "Content-Type": "application/json" } })
  }

  const groupIds = memberships.map((m) => m.teamGroupId)
  const groups = await db
    .select({
      id: teamGroups.id,
      name: teamGroups.name,
      status: teamGroups.status,
    })
    .from(teamGroups)
    .where(inArray(teamGroups.id, groupIds))

  const byId = new Map(groups.map((g) => [g.id, g]))
  const result = memberships
    .map((m) => {
      const g = byId.get(m.teamGroupId)
      if (!g || g.status === "archived") return null
      return {
        id: g.id,
        name: g.name,
        status: g.status,
        joined: !!m.joinedAt && !m.removedAt && !m.optedOutAt,
        optedOut: !!m.optedOutAt,
      }
    })
    .filter(Boolean)

  return new Response(JSON.stringify({ teamGroups: result }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  })
}
```

- [ ] **Step 5: Write leave endpoint**

`src/pages/api/dashboard/team-groups/[teamGroupId]/leave.ts`:

```typescript
import type { APIRoute } from "astro"
import { getDb } from "@/lib/db"
import { teamGroups, teamGroupMemberships, users } from "@/lib/db/schema"
import { and, eq } from "drizzle-orm"
import { removeMember } from "@/lib/telegram/group"

export const prerender = false

export const POST: APIRoute = async ({ locals, params }) => {
  if (!locals.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 })
  }
  const teamGroupId = params.teamGroupId
  if (!teamGroupId) {
    return new Response(JSON.stringify({ error: "teamGroupId required" }), { status: 400 })
  }

  const db = getDb()
  const membership = await db.query.teamGroupMemberships.findFirst({
    where: and(
      eq(teamGroupMemberships.teamGroupId, teamGroupId),
      eq(teamGroupMemberships.userId, locals.user.id),
    ),
  })
  if (!membership) {
    return new Response(JSON.stringify({ error: "Not a member of this group" }), { status: 404 })
  }

  const group = await db.query.teamGroups.findFirst({ where: eq(teamGroups.id, teamGroupId) })
  const user = await db.query.users.findFirst({ where: eq(users.id, locals.user.id) })

  // Best-effort remove from Telegram; don't fail if it errors
  if (group?.telegramChatId && user?.telegramChatId) {
    try {
      await removeMember(group.telegramChatId, user.telegramChatId)
    } catch (err) {
      console.warn(`[leave] telegram remove failed:`, err)
    }
  }

  await db
    .update(teamGroupMemberships)
    .set({ optedOutAt: new Date(), removedAt: new Date(), lastSyncedAt: new Date() })
    .where(eq(teamGroupMemberships.id, membership.id))

  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } })
}
```

- [ ] **Step 6: Write rejoin endpoint**

`src/pages/api/dashboard/team-groups/[teamGroupId]/rejoin.ts`:

```typescript
import type { APIRoute } from "astro"
import { getDb } from "@/lib/db"
import { teamGroups, teamGroupMemberships, users } from "@/lib/db/schema"
import { and, eq } from "drizzle-orm"
import { sendInviteDM } from "@/lib/telegram/group"

export const prerender = false

export const POST: APIRoute = async ({ locals, params }) => {
  if (!locals.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 })
  }
  const teamGroupId = params.teamGroupId
  if (!teamGroupId) {
    return new Response(JSON.stringify({ error: "teamGroupId required" }), { status: 400 })
  }

  const db = getDb()
  const membership = await db.query.teamGroupMemberships.findFirst({
    where: and(
      eq(teamGroupMemberships.teamGroupId, teamGroupId),
      eq(teamGroupMemberships.userId, locals.user.id),
    ),
  })
  if (!membership) {
    return new Response(JSON.stringify({ error: "No prior membership to rejoin" }), { status: 404 })
  }

  await db
    .update(teamGroupMemberships)
    .set({ optedOutAt: null, removedAt: null, lastSyncedAt: new Date() })
    .where(eq(teamGroupMemberships.id, membership.id))

  // Resend invite DM if group is active and user has Telegram
  const group = await db.query.teamGroups.findFirst({ where: eq(teamGroups.id, teamGroupId) })
  const user = await db.query.users.findFirst({ where: eq(users.id, locals.user.id) })
  if (group?.status === "active" && group.telegramChatId && user?.telegramChatId && group.inviteLink) {
    try {
      await sendInviteDM(user.telegramChatId, group.name, group.inviteLink)
    } catch (err) {
      console.warn(`[rejoin] invite DM failed:`, err)
    }
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } })
}
```

- [ ] **Step 7: Run tests**

```bash
npm run test:api -- tests/api/dashboard/team-groups.test.ts
```

Expected: PASS all.

- [ ] **Step 8: Commit**

```bash
git add src/pages/api/dashboard/team-groups.ts src/pages/api/dashboard/team-groups tests/api/dashboard/team-groups.test.ts
git commit -m "feat: parent dashboard API for team group list, leave, rejoin"
```

---

## Task 5: Dashboard team-groups panel UI

**Files:**
- Create: `src/components/dashboard/team-groups-panel.tsx`
- Modify: the parent dashboard page (likely `src/pages/dashboard/index.astro` or a team-specific dashboard page)

- [ ] **Step 1: Write the component**

```typescript
"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"

type TeamGroup = {
  id: string
  name: string
  status: string
  joined: boolean
  optedOut: boolean
}

export function TeamGroupsPanel() {
  const [groups, setGroups] = useState<TeamGroup[]>([])
  const [loading, setLoading] = useState(true)

  async function refresh() {
    const res = await fetch("/api/dashboard/team-groups")
    const json = await res.json()
    setGroups(json.teamGroups ?? [])
    setLoading(false)
  }

  useEffect(() => { refresh() }, [])

  async function handleLeave(id: string) {
    const res = await fetch(`/api/dashboard/team-groups/${id}/leave`, { method: "POST" })
    if (res.ok) {
      toast.success("Left the group")
      await refresh()
    } else {
      toast.error("Could not leave group")
    }
  }

  async function handleRejoin(id: string) {
    const res = await fetch(`/api/dashboard/team-groups/${id}/rejoin`, { method: "POST" })
    if (res.ok) {
      toast.success("Rejoining — check Telegram for invite")
      await refresh()
    } else {
      toast.error("Could not rejoin group")
    }
  }

  if (loading) return <div className="text-sm text-gray-500">Loading your team groups…</div>
  if (groups.length === 0) return null

  return (
    <section className="space-y-3 rounded-lg border p-4">
      <h3 className="text-sm font-semibold">Your team groups</h3>
      {groups.map((g) => (
        <div key={g.id} className="flex items-center justify-between gap-2 text-sm">
          <div>
            <div className="font-medium">{g.name}</div>
            <div className="flex items-center gap-1 text-xs text-gray-500">
              {g.optedOut ? (
                <Badge variant="outline">Left</Badge>
              ) : g.joined ? (
                <Badge variant="outline">Member</Badge>
              ) : (
                <Badge variant="outline">Invited</Badge>
              )}
            </div>
          </div>
          <div>
            {g.optedOut ? (
              <Button size="sm" variant="outline" onClick={() => handleRejoin(g.id)}>
                Rejoin
              </Button>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => handleLeave(g.id)}>
                Leave
              </Button>
            )}
          </div>
        </div>
      ))}
    </section>
  )
}
```

- [ ] **Step 2: Render it on the dashboard**

Read `src/pages/dashboard/index.astro` (or wherever the parent dashboard home lives) and add:

```astro
---
// existing imports
import { TeamGroupsPanel } from "../../components/dashboard/team-groups-panel"
---

<!-- existing content -->
<TeamGroupsPanel client:load />
<!-- rest of dashboard -->
```

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/team-groups-panel.tsx src/pages/dashboard/
git commit -m "feat: parent dashboard UI for team group leave/rejoin"
```

---

## Task 6: Nudge dismiss API + test

**Files:**
- Create: `src/pages/api/dashboard/nudge/dismiss.ts`
- Create: `tests/api/dashboard/nudge-dismiss.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { getParentCookie, apiFetch, expectJson, resetCookies } from "../setup/test-helpers"

describe("Dashboard: nudge dismiss", () => {
  let parentCookie: string
  beforeAll(async () => { parentCookie = await getParentCookie() })
  afterAll(() => resetCookies())

  it("requires auth (401)", async () => {
    const res = await apiFetch("/api/dashboard/nudge/dismiss", {
      method: "POST",
      body: JSON.stringify({ nudgeKey: "telegram_connect_banner" }),
    })
    expect(res.status).toBe(401)
  })

  it("returns 400 on invalid nudgeKey", async () => {
    const res = await apiFetch("/api/dashboard/nudge/dismiss", {
      method: "POST",
      cookie: parentCookie,
      body: JSON.stringify({ nudgeKey: "not_a_real_nudge" }),
    })
    expect(res.status).toBe(400)
  })

  it("records dismissal for telegram_connect_banner (200)", async () => {
    const res = await apiFetch("/api/dashboard/nudge/dismiss", {
      method: "POST",
      cookie: parentCookie,
      body: JSON.stringify({ nudgeKey: "telegram_connect_banner" }),
    })
    await expectJson(res, 200)
  })
})
```

- [ ] **Step 2: Run to verify fail**

```bash
npm run test:api -- tests/api/dashboard/nudge-dismiss.test.ts
```

- [ ] **Step 3: Write endpoint**

```typescript
import type { APIRoute } from "astro"
import { z } from "zod"
import { getDb } from "@/lib/db"
import { userNudgeState } from "@/lib/db/schema"
import { and, eq, sql } from "drizzle-orm"

export const prerender = false

const ALLOWED_NUDGE_KEYS = ["telegram_connect_banner"] as const

const DismissSchema = z.object({
  nudgeKey: z.enum(ALLOWED_NUDGE_KEYS),
})

export const POST: APIRoute = async ({ locals, request }) => {
  if (!locals.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 })
  }

  let raw: unknown
  try { raw = await request.json() } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400 })
  }
  const parsed = DismissSchema.safeParse(raw)
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: "Invalid payload" }), { status: 400 })
  }

  const db = getDb()
  const existing = await db.query.userNudgeState.findFirst({
    where: and(
      eq(userNudgeState.userId, locals.user.id),
      eq(userNudgeState.nudgeKey, parsed.data.nudgeKey),
    ),
  })

  if (!existing) {
    await db.insert(userNudgeState).values({
      userId: locals.user.id,
      nudgeKey: parsed.data.nudgeKey,
      lastDismissedAt: new Date(),
      dismissalCount: 1,
    })
  } else {
    await db
      .update(userNudgeState)
      .set({
        lastDismissedAt: new Date(),
        dismissalCount: sql`${userNudgeState.dismissalCount} + 1`,
      })
      .where(eq(userNudgeState.id, existing.id))
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200 })
}
```

- [ ] **Step 4: Run tests**

```bash
npm run test:api -- tests/api/dashboard/nudge-dismiss.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/pages/api/dashboard/nudge/dismiss.ts tests/api/dashboard/nudge-dismiss.test.ts
git commit -m "feat: nudge dismiss API for dashboard banners"
```

---

## Task 7: Telegram connect banner component

**Files:**
- Create: `src/components/dashboard/telegram-connect-banner.tsx`
- Modify: `src/pages/dashboard/index.astro`

- [ ] **Step 1: Write the component**

```typescript
"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"

type Props = {
  hasLinkedTelegram: boolean
  lastDismissedAt: string | null
  // If provided, only re-show after this many days since last dismissal
  reshowDays?: number
}

export function TelegramConnectBanner({
  hasLinkedTelegram,
  lastDismissedAt,
  reshowDays = 14,
}: Props) {
  const [visible, setVisible] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (hasLinkedTelegram) {
      setVisible(false)
      return
    }
    if (!lastDismissedAt) {
      setVisible(true)
      return
    }
    const dismissed = new Date(lastDismissedAt)
    const threshold = new Date(Date.now() - reshowDays * 24 * 60 * 60 * 1000)
    setVisible(dismissed < threshold)
  }, [hasLinkedTelegram, lastDismissedAt, reshowDays])

  async function dismiss() {
    setSubmitting(true)
    try {
      await fetch("/api/dashboard/nudge/dismiss", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nudgeKey: "telegram_connect_banner" }),
      })
      setVisible(false)
    } catch {
      toast.error("Could not dismiss")
    } finally {
      setSubmitting(false)
    }
  }

  async function connect() {
    setSubmitting(true)
    try {
      const res = await fetch("/api/dashboard/settings/telegram/link", {
        method: "POST",
      })
      const json = await res.json()
      if (json.deepLink) {
        window.location.href = json.deepLink
      } else {
        toast.error("Could not generate connect link")
      }
    } catch {
      toast.error("Could not start connect flow")
    } finally {
      setSubmitting(false)
    }
  }

  if (!visible) return null

  return (
    <div className="mb-4 flex items-start justify-between gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4">
      <div className="flex-1">
        <div className="text-sm font-medium">Connect Telegram for real-time team updates</div>
        <div className="mt-1 text-xs text-gray-600">
          Get reminders, schedule changes, and quick updates instantly. You can always switch back to email.
        </div>
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={connect} disabled={submitting}>Connect</Button>
        <Button size="sm" variant="ghost" onClick={dismiss} disabled={submitting}>Not now</Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Integrate into dashboard home**

Read `src/pages/dashboard/index.astro`. Add a server-side block to fetch `hasLinkedTelegram` and `lastDismissedAt`, then pass to the component. Example (adapt to the existing frontmatter):

```astro
---
// existing imports
import { TelegramConnectBanner } from "../../components/dashboard/telegram-connect-banner"
import { getDb } from "../../lib/db"
import { userNudgeState } from "../../lib/db/schema"
import { and, eq } from "drizzle-orm"

const { user } = Astro.locals
if (!user) return Astro.redirect("/signin?returnUrl=/dashboard")

const db = getDb()
const nudge = await db.query.userNudgeState.findFirst({
  where: and(
    eq(userNudgeState.userId, user.id),
    eq(userNudgeState.nudgeKey, "telegram_connect_banner"),
  ),
})
const hasLinkedTelegram = !!user.telegramChatId
const lastDismissedAt = nudge?.lastDismissedAt?.toISOString() ?? null
---

<!-- existing layout -->
<TelegramConnectBanner
  client:load
  hasLinkedTelegram={hasLinkedTelegram}
  lastDismissedAt={lastDismissedAt}
/>
<!-- rest of dashboard -->
```

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/telegram-connect-banner.tsx src/pages/dashboard/index.astro
git commit -m "feat: dashboard Telegram connect banner with dismiss-and-reshow"
```

---

## Task 8: Registration wizard Telegram step

**Files:**
- Create: `src/components/registration/telegram-connect-step.tsx`
- Modify: `src/components/registration/registration-wizard.tsx`

- [ ] **Step 1: Read the existing wizard**

Read `src/components/registration/registration-wizard.tsx` end to end. Note how steps are structured, how state flows between steps, where payment currently lives, and where the confirmation step is rendered. The goal is to insert the Telegram step AFTER payment succeeds, BEFORE the confirmation screen.

- [ ] **Step 2: Write the step component**

```typescript
"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"

type Props = {
  userId: string
  onComplete: () => void // move to confirmation
  onSkip: () => void // move to confirmation
}

export function TelegramConnectStep({ userId, onComplete, onSkip }: Props) {
  const [submitting, setSubmitting] = useState(false)

  async function connect() {
    setSubmitting(true)
    try {
      const res = await fetch("/api/dashboard/settings/telegram/link", {
        method: "POST",
      })
      const json = await res.json()
      if (json.deepLink) {
        // Open Telegram, then fire onComplete so the wizard proceeds even if the user backgrounds
        window.location.href = json.deepLink
        setTimeout(() => onComplete(), 1500)
      } else {
        onSkip()
      }
    } catch {
      onSkip()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">Stay connected</h2>
        <p className="mt-2 text-sm text-gray-600">
          Your team uses Telegram to share reminders, schedule changes, and quick updates.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Button onClick={connect} disabled={submitting} size="lg">
          {submitting ? "Opening Telegram…" : "Connect Telegram"}
        </Button>
        <Button variant="ghost" onClick={onSkip} disabled={submitting} size="lg">
          Skip for now
        </Button>
      </div>

      <p className="text-xs text-gray-500">
        We'll email you updates if you skip this. You can connect anytime from your dashboard.
      </p>
    </div>
  )
}
```

- [ ] **Step 3: Wire into the wizard**

In `registration-wizard.tsx`, insert a new step after the payment success step and before the confirmation step. The wizard pattern in that file will dictate whether this is a new enum value, a new case in a switch, etc. Use the existing step-progression machinery.

The simplest integration: when the payment step reports success, set the current step to `"telegram_connect"` instead of `"confirmation"`. When the Telegram step fires `onComplete` or `onSkip`, set it to `"confirmation"`.

- [ ] **Step 4: Sanity check build**

```bash
npm run build 2>&1 | tail -15
```

No errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/registration/telegram-connect-step.tsx src/components/registration/registration-wizard.tsx
git commit -m "feat: registration wizard Telegram connect step"
```

---

## Task 9: Messaging adoption metrics API + test

**Files:**
- Create: `src/pages/api/admin/metrics/messaging.ts`
- Create: `tests/api/admin/messaging-metrics.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { getAdminCookie, apiFetch, expectJson, resetCookies } from "../setup/test-helpers"

describe("Admin: messaging metrics", () => {
  let adminCookie: string
  beforeAll(async () => { adminCookie = await getAdminCookie() })
  afterAll(() => resetCookies())

  it("requires admin (401)", async () => {
    const res = await apiFetch("/api/admin/metrics/messaging", { method: "GET" })
    expect([401, 403]).toContain(res.status)
  })

  it("returns link rate + join rate (200)", async () => {
    const res = await apiFetch("/api/admin/metrics/messaging", {
      method: "GET",
      cookie: adminCookie,
    })
    const json = await expectJson(res, 200)
    expect(typeof json.telegramLinkRate).toBe("number")
    expect(typeof json.groupJoinRate).toBe("number")
    expect(typeof json.totalParents).toBe("number")
    expect(typeof json.linkedParents).toBe("number")
  })
})
```

- [ ] **Step 2: Run to verify fail**

```bash
npm run test:api -- tests/api/admin/messaging-metrics.test.ts
```

- [ ] **Step 3: Write the endpoint**

```typescript
import type { APIRoute } from "astro"
import { getDb } from "@/lib/db"
import {
  users,
  familyMemberParents,
  familyMembers,
  registrations,
  rosters,
  teams,
  seasons,
  programs,
  locations,
  teamGroupMemberships,
  teamGroups,
} from "@/lib/db/schema"
import { and, eq, isNotNull, isNull, sql } from "drizzle-orm"
import { requireAdminAccess, requireOrganizationContext } from "@/lib/auth"

export const prerender = false

export const GET: APIRoute = async (context) => {
  const adminAuth = await requireAdminAccess(context)
  if (!adminAuth.authorized) return adminAuth.response
  const orgContext = await requireOrganizationContext(context)
  if (!orgContext.hasOrganization) return orgContext.response

  const db = getDb()
  const orgId = orgContext.organizationId

  // Count all parents with registrations in this org
  const totalParentsQuery = await db
    .selectDistinct({ userId: familyMemberParents.parentUserId })
    .from(familyMemberParents)
    .innerJoin(familyMembers, eq(familyMemberParents.familyMemberId, familyMembers.id))
    .innerJoin(registrations, eq(registrations.familyMemberId, familyMembers.id))
    .innerJoin(rosters, eq(rosters.registrationId, registrations.id))
    .innerJoin(teams, eq(rosters.teamId, teams.id))
    .innerJoin(seasons, eq(teams.seasonId, seasons.id))
    .innerJoin(programs, eq(seasons.programId, programs.id))
    .innerJoin(locations, eq(programs.locationId, locations.id))
    .where(
      and(
        eq(locations.organizationId, orgId),
        eq(familyMemberParents.canReceiveMessages, true),
      ),
    )

  const totalParents = totalParentsQuery.length

  // Count parents with linked Telegram
  const linkedParents = totalParents === 0 ? 0 : (await db
    .selectDistinct({ userId: users.id })
    .from(users)
    .where(
      and(
        isNotNull(users.telegramChatId),
        sql`${users.id} IN (${sql.join(totalParentsQuery.map((r) => sql`${r.userId}`), sql`, `)})`,
      ),
    )).length

  const telegramLinkRate = totalParents > 0 ? linkedParents / totalParents : 0

  // Group join rate: for active team groups in this org, what % of expected members have joined?
  const memberships = await db
    .select({
      id: teamGroupMemberships.id,
      joinedAt: teamGroupMemberships.joinedAt,
      optedOutAt: teamGroupMemberships.optedOutAt,
    })
    .from(teamGroupMemberships)
    .innerJoin(teamGroups, eq(teamGroupMemberships.teamGroupId, teamGroups.id))
    .where(and(eq(teamGroups.organizationId, orgId), eq(teamGroups.status, "active")))

  const invited = memberships.length
  const joined = memberships.filter((m) => m.joinedAt && !m.optedOutAt).length
  const groupJoinRate = invited > 0 ? joined / invited : 0

  return new Response(
    JSON.stringify({
      totalParents,
      linkedParents,
      telegramLinkRate,
      invitedMembers: invited,
      joinedMembers: joined,
      groupJoinRate,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  )
}
```

**Note:** the `totalParents` inner query assumes the same rosters→registrations→teams→seasons→programs→locations path that's used elsewhere in the codebase (see `team-group-sync.ts` from Part 1). Adapt column names if they differ.

- [ ] **Step 4: Run tests**

```bash
npm run test:api -- tests/api/admin/messaging-metrics.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/pages/api/admin/metrics/messaging.ts tests/api/admin/messaging-metrics.test.ts
git commit -m "feat: admin messaging adoption metrics API"
```

---

## Task 10: Messaging metrics card UI

**Files:**
- Create: `src/components/admin/messaging-metrics-card.tsx`
- Modify: admin dashboard home page (likely `src/pages/admin/index.astro` — check)

- [ ] **Step 1: Write the card**

```typescript
"use client"

import { useEffect, useState } from "react"

type Metrics = {
  totalParents: number
  linkedParents: number
  telegramLinkRate: number
  invitedMembers: number
  joinedMembers: number
  groupJoinRate: number
}

export function MessagingMetricsCard() {
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch("/api/admin/metrics/messaging")
      .then((r) => r.json())
      .then((json) => { setMetrics(json); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  if (loading) return <div className="text-sm text-gray-500">Loading metrics…</div>
  if (!metrics) return <div className="text-sm text-gray-500">Metrics unavailable</div>

  const pct = (n: number) => `${(n * 100).toFixed(0)}%`

  return (
    <section className="space-y-3 rounded-lg border p-4">
      <h3 className="text-sm font-semibold">Messaging adoption</h3>
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-xs text-gray-500">Telegram link rate</dt>
          <dd className="text-2xl font-semibold">{pct(metrics.telegramLinkRate)}</dd>
          <dd className="text-xs text-gray-500">
            {metrics.linkedParents} / {metrics.totalParents} parents
          </dd>
        </div>
        <div>
          <dt className="text-xs text-gray-500">Group join rate</dt>
          <dd className="text-2xl font-semibold">{pct(metrics.groupJoinRate)}</dd>
          <dd className="text-xs text-gray-500">
            {metrics.joinedMembers} / {metrics.invitedMembers} invited members
          </dd>
        </div>
      </dl>
    </section>
  )
}
```

- [ ] **Step 2: Render on admin home**

Read `src/pages/admin/index.astro` (adapt if path differs) and add `<MessagingMetricsCard client:load />` in an appropriate spot.

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/messaging-metrics-card.tsx src/pages/admin/
git commit -m "feat: messaging adoption metrics card on admin home"
```

---

## Task 11: Migrate day-before reminders to broadcast pipeline

**Files:**
- Modify: `src/lib/messaging/notifications.ts`

- [ ] **Step 1: Read the current sendDayBeforeReminders**

Read `src/lib/messaging/notifications.ts`. Locate `sendDayBeforeReminders`. Understand:
- How it queries games in the 16-36h window
- How it currently sends per-parent via `sendToParent`
- What `organizationId` is available (likely derived per-game via the team → season → program → location chain)

- [ ] **Step 2: Refactor to call composeBroadcast per game**

For each game in the window, instead of a per-parent fan-out, call `composeBroadcast` once per team (home + away) with `messageType: "day_before_reminder"`. The routing policy already handles group post + email fan-out for non-linked parents.

Replace the per-parent loop with something like:

```typescript
for (const game of games) {
  const bodyTemplate = (teamName: string) =>
    `Reminder: ${game.programName} tomorrow at ${formatTime(game.scheduledAt)}${
      game.venueName ? `, ${game.venueName}` : ""
    }.`

  for (const teamId of [game.homeTeamId, game.awayTeamId].filter(Boolean) as string[]) {
    try {
      await composeBroadcast({
        organizationId: game.organizationId,
        initiatorId: null,
        initiatorType: "system",
        targetType: "team_group",
        teamIds: [teamId],
        messageType: "day_before_reminder",
        body: bodyTemplate(teamId === game.homeTeamId ? game.homeTeamName : game.awayTeamName ?? ""),
      })
    } catch (err) {
      console.warn(`[sendDayBeforeReminders] broadcast failed for team ${teamId}:`, err)
    }
  }
}
```

**Adapt:** the game-query shape (what fields are selected), the formatTime helper, and the game → team → organizationId derivation. Match the existing function's context-loading pattern (look at `loadGameContext` which is used by `notifyScheduleChange`).

Also fix the SQL range filter per the Part 1 review finding — use proper `gte`/`lte` on `games.scheduledAt`:

```typescript
import { gte, lte } from "drizzle-orm"

const windowStart = new Date(Date.now() + 16 * 60 * 60 * 1000)
const windowEnd = new Date(Date.now() + 36 * 60 * 60 * 1000)

const games = await db
  .select({ /* relevant fields */ })
  .from(games)
  .where(
    and(
      eq(games.status, "scheduled"),
      gte(games.scheduledAt, windowStart),
      lte(games.scheduledAt, windowEnd),
    ),
  )
```

- [ ] **Step 3: Type-check and build**

```bash
npx tsc --noEmit 2>&1 | grep notifications | head -10
npm run build 2>&1 | tail -10
```

Expected: no new errors.

- [ ] **Step 4: Run the existing day-before-reminders test**

```bash
npm run test:api -- tests/api/cron/day-before-reminders.test.ts 2>&1 | tail -20
```

If the test fails because it asserted on the per-parent path that no longer exists, **update the test** to assert on `broadcast_log` rows instead. If no such test exists, skip.

- [ ] **Step 5: Commit**

```bash
git add src/lib/messaging/notifications.ts tests/api/cron/
git commit -m "refactor: route day-before reminders through broadcast pipeline"
```

---

## Task 12: Email footer "Connect Telegram" CTA

**Files:**
- Modify: `src/lib/email/templates/registration-confirmation.tsx` (and optionally payment-receipt.tsx)

- [ ] **Step 1: Read the existing template**

Read `src/lib/email/templates/registration-confirmation.tsx`. Understand the React Email component structure — likely uses `@react-email/components`. Note where the "main content" ends and where a natural footer slot is.

- [ ] **Step 2: Add a conditional footer block**

Add a prop `hasLinkedTelegram: boolean` to the template. When false, render a small CTA at the bottom:

```tsx
{!hasLinkedTelegram && (
  <Section style={{ marginTop: 24, padding: 16, backgroundColor: "#f0f9ff", borderRadius: 8 }}>
    <Text style={{ fontSize: 14, margin: 0, fontWeight: 600 }}>
      Prefer quick updates?
    </Text>
    <Text style={{ fontSize: 13, margin: "4px 0 8px" }}>
      Connect Telegram to get real-time reminders and schedule changes from your team.
    </Text>
    <Link href={`${baseUrl}/dashboard?connect=telegram`} style={{ fontSize: 13 }}>
      Connect Telegram
    </Link>
  </Section>
)}
```

Find existing callers of the template (grep for `registration-confirmation`) and pass `hasLinkedTelegram: !!user.telegramChatId` from the call site. Pass a sensible default (`false`) if older callers can't be updated in one pass.

- [ ] **Step 3: Sanity check build**

```bash
npm run build 2>&1 | tail -10
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/email/templates/registration-confirmation.tsx src/lib/email/
git commit -m "feat: email footer CTA to connect Telegram for unlinked parents"
```

---

## Verification checklist

- [ ] `npm run test:api` — all tests pass (should be ~230+ now with the new tests)
- [ ] `npm run build` — clean
- [ ] Admin can promote a pending team group from the team detail page
- [ ] Parent dashboard home shows the Connect Telegram banner for unlinked parents
- [ ] Banner Dismiss → hides for 14 days
- [ ] Parent dashboard shows team groups with Leave / Rejoin controls
- [ ] Registration wizard includes the Telegram step before confirmation
- [ ] Admin home shows messaging adoption metrics
- [ ] Day-before reminders now post in team groups (observable in the Telegram group after a manual cron run)
- [ ] Registration confirmation email has the Connect Telegram CTA for unlinked parents

## What's still deferred after this plan

- Per-org custom Telegram bots — multi-tenant personalization
- Player groups for U14+
- Coach reply inbox / conversation threading
- Outbox + job queue
- `initiatorType` field on `scheduled_broadcasts` (wire so coach-scheduled sends preserve attribution)
- Automation of Telegram group creation (requires paid template-bot provider)
