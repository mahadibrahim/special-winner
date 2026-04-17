# Plan 5 — Gear Reminders, manage_gear Permission, and Final Polish

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a daily scheduled job that fires email reminders for gear batch milestones, unclaimed orders, and sponsor expirations. Formalize the `manage_gear` permission. Round out edge cases discovered during Plans 1–4.

**Architecture:** A Netlify Scheduled Function runs once daily; it queries open batches + orders + sponsor assignments against today's date and sends emails via the existing `src/lib/email` abstraction (provider-agnostic). Three new React Email templates. Permission changes to `userOrganizationAccess` and a targeted audit.

**Tech Stack:** Astro 5, React Email, Netlify Scheduled Functions, existing email abstraction, Vitest.

**Reference spec:** `docs/superpowers/specs/2026-04-17-merchandise-gear-distribution-design.md` §10, §11.

**Prerequisites:** Plans 1 through 4 complete.

---

## File structure

New files:
- `src/lib/email/templates/gear-batch-due.tsx` — React Email template
- `src/lib/email/templates/gear-orders-unclaimed.tsx`
- `src/lib/email/templates/sponsor-expiry-warning.tsx`
- `src/lib/reminders/gear-batch-reminders.ts` — collection + send logic
- `src/lib/reminders/sponsor-expiry-reminders.ts`
- `src/lib/reminders/recipients.ts` — resolves which admins receive reminders per org/location
- `src/pages/api/cron/gear-reminders.ts` — endpoint invoked by Netlify scheduled function
- `netlify/functions/gear-reminders-scheduled.ts` (or whatever path Netlify scheduled functions use in this project — match existing pattern if any exist)
- `tests/lib/reminders/gear-batch-reminders.test.ts`
- `tests/lib/reminders/sponsor-expiry-reminders.test.ts`
- `tests/api/cron/gear-reminders.test.ts`

Files modified:
- `src/lib/email/send.ts` — add `sendGearBatchDueEmail`, `sendGearOrdersUnclaimedEmail`, `sendSponsorExpiryWarningEmail`
- `netlify.toml` — register scheduled function

Permission audit:
- `manage_gear` is introduced as a permission string stored in `userOrganizationAccess.permissions` jsonb array; it does not require schema changes. All admin gear endpoints (Plans 1, 3, 4) currently gate on `requireAdminAccess`, which permits owner/admin/manager roles. `manage_gear` is an opt-in for "staff" users who should get gear access without full admin. Implement a helper `requireGearManagement(context)` that accepts owner/admin/manager OR any role with `permissions` array containing `"manage_gear"`.

---

## Task 1: Recipients resolver

**Files:**
- Create: `src/lib/reminders/recipients.ts`
- Create: `tests/lib/reminders/recipients.test.ts`

- [ ] **Step 1: Write failing tests**

Required cases:
- `getGearAdminRecipients(orgId, locationId?)` returns users whose `userOrganizationAccess` for that org has role in {owner, admin, manager} OR permissions array contains "manage_gear"
- Location scope: if locationId set, restrict to users with access scoped to that location OR to the org (location access = null)
- Returns email + userId + role; deduplicated

- [ ] **Step 2: Implement**

```ts
import { getDb } from "@/lib/db";
import { userOrganizationAccess, users } from "@/lib/db/schema";
import { and, or, eq, isNull, sql } from "drizzle-orm";

export async function getGearAdminRecipients(orgId: string, locationId?: string): Promise<Array<{ userId: string; email: string; role: string }>> {
  const db = getDb();
  const rows = await db
    .select({
      userId: users.id,
      email: users.email,
      role: userOrganizationAccess.role,
      permissions: userOrganizationAccess.permissions,
      locationId: userOrganizationAccess.locationId,
    })
    .from(userOrganizationAccess)
    .innerJoin(users, eq(userOrganizationAccess.userId, users.id))
    .where(and(
      eq(userOrganizationAccess.organizationId, orgId),
      eq(userOrganizationAccess.active, true),
      locationId
        ? or(eq(userOrganizationAccess.locationId, locationId), isNull(userOrganizationAccess.locationId))
        : sql`true`,
      or(
        sql`${userOrganizationAccess.role} IN ('owner','admin','manager')`,
        sql`${userOrganizationAccess.permissions}::jsonb ? 'manage_gear'`,
      ),
    ));
  // Dedupe by userId
  const seen = new Set<string>();
  return rows.filter((r) => {
    if (seen.has(r.userId)) return false;
    seen.add(r.userId);
    return true;
  }).map((r) => ({ userId: r.userId, email: r.email, role: r.role }));
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/reminders/recipients.ts tests/lib/reminders/recipients.test.ts
git commit -m "feat(reminders): gear admin recipient resolver"
```

---

## Task 2: Email templates

**Files:**
- Create: `src/lib/email/templates/gear-batch-due.tsx`
- Create: `src/lib/email/templates/gear-orders-unclaimed.tsx`
- Create: `src/lib/email/templates/sponsor-expiry-warning.tsx`

Look at `src/lib/email/templates/registration-confirmation.tsx` as a scaffold for React Email. Each template below exports a component with typed props. Keep structure and styling consistent with existing templates (Aspire branding).

- [ ] **Step 1: gear-batch-due template**

Props: `{ recipientName, batchName, locationName, seasonName?, milestone: "submit"|"receive"|"distribute", daysUntilDue: number, isOverdue: boolean, batchUrl: string }`

Subject (computed at send site): e.g., `"Gear batch '<name>' — submit order in 3 days"` or `"OVERDUE: Gear batch submit"`.

Body: short paragraph explaining which milestone is approaching, a CTA button linking to `batchUrl`, plus a note of consequences ("the batch locks at submit; after that you can't add orders without a new batch").

- [ ] **Step 2: gear-orders-unclaimed template**

Props: `{ recipientName, batchName, unclaimedCount, unclaimedList: Array<{ familyMemberName: string; parentName: string; teamName?: string }>, batchUrl: string, cutoffDays: number }`

Body: "N orders in '<batchName>' have not been picked up in <cutoffDays> days" + table of families + CTA to the distribute page.

- [ ] **Step 3: sponsor-expiry-warning template**

Props: `{ recipientName, sponsors: Array<{ sponsorName: string; placementType: string; expiresOn: string; daysUntilExpiry: number }>, sponsorsAdminUrl: string }`

Body: digest listing each placement expiring within window, CTA to sponsors admin.

- [ ] **Step 4: Commit**

```bash
git add src/lib/email/templates/gear-batch-due.tsx \
        src/lib/email/templates/gear-orders-unclaimed.tsx \
        src/lib/email/templates/sponsor-expiry-warning.tsx
git commit -m "feat(reminders): email templates for gear + sponsor reminders"
```

---

## Task 3: Email send helpers

**Files:**
- Modify: `src/lib/email/send.ts`

- [ ] **Step 1: Add three send functions**

Follow the existing `sendRegistrationConfirmationEmail` pattern in `src/lib/email/send.ts`. Each function:
- Accepts `{ userId?, organizationId?, to, ... }` prop shape
- Renders the template via `@react-email/components`
- Uses `sendViaGatewayOrDirect` (existing helper)
- Logs via `logEmail` with an appropriate `emailType`

For reminder emails where the recipient is an admin (not a parent), skip the messaging-gateway path — always direct email:

```ts
export async function sendGearBatchDueEmail(params: SendGearBatchDueParams) {
  if (!isEmailConfigured()) return { success: false, error: "Email not configured" };
  const html = await render(GearBatchDueEmail(params));
  const subject = params.isOverdue
    ? `OVERDUE: Gear batch "${params.batchName}" — ${params.milestone}`
    : `Gear batch "${params.batchName}" — ${params.milestone} in ${params.daysUntilDue} day${params.daysUntilDue === 1 ? "" : "s"}`;

  const result = await sendEmail({ to: params.to, subject, html });
  await logEmail({
    userId: params.userId,
    emailType: "gear_batch_due",
    recipientEmail: params.to,
    subject,
    resendMessageId: result.messageId,
    status: result.success ? "sent" : "failed",
  });
  return result;
}
```

Same pattern for `sendGearOrdersUnclaimedEmail` (`emailType: "gear_orders_unclaimed"`) and `sendSponsorExpiryWarningEmail` (`emailType: "sponsor_expiry_warning"`).

- [ ] **Step 2: Commit**

```bash
git add src/lib/email/send.ts
git commit -m "feat(reminders): email send helpers for gear + sponsor reminders"
```

---

## Task 4: Gear batch reminder logic

**Files:**
- Create: `src/lib/reminders/gear-batch-reminders.ts`
- Create: `tests/lib/reminders/gear-batch-reminders.test.ts`

- [ ] **Step 1: Write failing tests**

Required cases:
- `checkGearBatchDueReminders()` returns a plan of emails to send
- Batch with `submitDueDate` 3 days out + status='open' → generates one reminder per recipient, milestone='submit', daysUntilDue=3
- Batch with `submitDueDate` 1 day out → daysUntilDue=1
- Batch with `submitDueDate` past + status='open' → isOverdue=true, daysUntilDue=0 or negative
- Batch with `receivedDueDate` 3 days out + status='submitted' → milestone='receive', daysUntilDue=3
- Batch with `distributeDueDate` 1 day out + status='received' → milestone='distribute'
- Batch with status='closed' → no reminders
- Multiple due dates near same window → independent reminders

Checking unclaimed orders:
- Batch `receivedAt` > 14 days ago + any child orders still `received` (not `distributed`) → generate digest for that batch
- Digest summarizes count + family list

Implementation hint: return a plan object `{ toSend: [{ type: 'batch-due', ... }, { type: 'unclaimed', ... }] }` that tests inspect. Actual sending happens in a separate step (call `sendGearBatchDueEmail` etc. inside a dispatch function). This separation makes testing easier.

- [ ] **Step 2: Implement**

```ts
import { getDb } from "@/lib/db";
import { gearBatches, gearOrders, locations, organizations } from "@/lib/db/schema";
import { and, eq, lte, gte, isNotNull, sql, lt } from "drizzle-orm";
import { getGearAdminRecipients } from "./recipients";

type ReminderMilestone = "submit" | "receive" | "distribute";
const REMIND_DAYS_OUT: Record<ReminderMilestone, number[]> = {
  submit: [7, 3, 1, 0],
  receive: [3, 1, 0],
  distribute: [3, 1, 0],
};

export interface BatchDueReminder {
  type: "batch-due";
  batchId: string;
  milestone: ReminderMilestone;
  daysUntilDue: number;
  isOverdue: boolean;
  recipients: Array<{ userId: string; email: string }>;
  batchName: string;
  locationName: string;
  seasonName: string | null;
  organizationId: string;
  batchUrl: string;
}

export interface UnclaimedReminder {
  type: "unclaimed";
  batchId: string;
  recipients: Array<{ userId: string; email: string }>;
  unclaimedCount: number;
  unclaimedList: Array<{ familyMemberName: string; parentName: string; teamName?: string }>;
  batchName: string;
  batchUrl: string;
  cutoffDays: number;
  organizationId: string;
}

export type GearReminderPlan = Array<BatchDueReminder | UnclaimedReminder>;

export async function checkGearBatchDueReminders(now: Date = new Date()): Promise<GearReminderPlan> {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const plan: GearReminderPlan = [];

  // Fetch relevant batches joined with location/org/season info
  const batches = await getDb()
    .select()
    .from(gearBatches)
    .innerJoin(locations, eq(gearBatches.locationId, locations.id))
    .where(sql`${gearBatches.status} NOT IN ('closed','cancelled')`);

  for (const row of batches) {
    const batch = row.gear_batches;
    const location = row.locations;

    // Figure out active milestone
    let milestone: ReminderMilestone | null = null;
    let dueDate: Date | null = null;

    if (batch.status === "open" && batch.submitDueDate) {
      milestone = "submit";
      dueDate = new Date(batch.submitDueDate);
    } else if (batch.status === "submitted" && batch.receivedDueDate) {
      milestone = "receive";
      dueDate = new Date(batch.receivedDueDate);
    } else if (batch.status === "received" && batch.distributeDueDate) {
      milestone = "distribute";
      dueDate = new Date(batch.distributeDueDate);
    }

    if (milestone && dueDate) {
      const diffDays = Math.round((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      const isOverdue = diffDays < 0;
      const matches = REMIND_DAYS_OUT[milestone].includes(diffDays);
      // Also fire on overdue regardless of specific day-count
      if (matches || isOverdue) {
        const recipients = await getGearAdminRecipients(batch.organizationId, batch.locationId);
        if (recipients.length) {
          plan.push({
            type: "batch-due",
            batchId: batch.id,
            milestone,
            daysUntilDue: diffDays,
            isOverdue,
            recipients: recipients.map((r) => ({ userId: r.userId, email: r.email })),
            batchName: batch.name,
            locationName: location.name,
            seasonName: null, // populate via another join if needed
            organizationId: batch.organizationId,
            batchUrl: `${process.env.PUBLIC_APP_URL}/admin/gear/batches/${batch.id}`,
          });
        }
      }
    }

    // Unclaimed orders for received batches with receivedAt > 14 days ago
    if (batch.status === "received" && batch.receivedAt) {
      const daysSinceReceive = Math.round((today.getTime() - new Date(batch.receivedAt).getTime()) / (1000 * 60 * 60 * 24));
      if (daysSinceReceive >= 14) {
        const unclaimed = await getDb()
          .select({ id: gearOrders.id }) // join family_member for name; keep simple here
          .from(gearOrders)
          .where(and(eq(gearOrders.batchId, batch.id), eq(gearOrders.status, "received")));
        if (unclaimed.length > 0) {
          // Fetch parent/family names — do a join or a second query; shown as sketch below
          const details = await fetchUnclaimedDetails(batch.id);
          const recipients = await getGearAdminRecipients(batch.organizationId, batch.locationId);
          if (recipients.length) {
            plan.push({
              type: "unclaimed",
              batchId: batch.id,
              recipients: recipients.map((r) => ({ userId: r.userId, email: r.email })),
              unclaimedCount: unclaimed.length,
              unclaimedList: details,
              batchName: batch.name,
              batchUrl: `${process.env.PUBLIC_APP_URL}/admin/gear/batches/${batch.id}/distribute`,
              cutoffDays: 14,
              organizationId: batch.organizationId,
            });
          }
        }
      }
    }
  }

  return plan;
}

async function fetchUnclaimedDetails(batchId: string): Promise<Array<{ familyMemberName: string; parentName: string; teamName?: string }>> {
  // Query: gearOrders joined with familyMembers, users (parent), and current roster/team for the familyMember
  // Implementation details depend on existing rosters/teams schema. Pattern-match pickup API from Plan 3.
  // Return empty array if join path not reachable; dispatch will still send a count-only email via the template.
  return [];
}

export async function dispatchGearReminders(plan: GearReminderPlan): Promise<void> {
  // Import send helpers locally to avoid circular imports
  const { sendGearBatchDueEmail, sendGearOrdersUnclaimedEmail } = await import("@/lib/email/send");
  for (const item of plan) {
    for (const r of item.recipients) {
      if (item.type === "batch-due") {
        await sendGearBatchDueEmail({
          userId: r.userId,
          organizationId: item.organizationId,
          to: r.email,
          batchName: item.batchName,
          locationName: item.locationName,
          seasonName: item.seasonName,
          milestone: item.milestone,
          daysUntilDue: Math.max(0, item.daysUntilDue),
          isOverdue: item.isOverdue,
          batchUrl: item.batchUrl,
        });
      } else {
        await sendGearOrdersUnclaimedEmail({
          userId: r.userId,
          organizationId: item.organizationId,
          to: r.email,
          batchName: item.batchName,
          unclaimedCount: item.unclaimedCount,
          unclaimedList: item.unclaimedList,
          cutoffDays: item.cutoffDays,
          batchUrl: item.batchUrl,
        });
      }
    }
  }
}
```

- [ ] **Step 3: Run tests — pass**

Run: `npm run test:api -- tests/lib/reminders/gear-batch-reminders.test.ts`

- [ ] **Step 4: Commit**

```bash
git add src/lib/reminders/gear-batch-reminders.ts \
        tests/lib/reminders/gear-batch-reminders.test.ts
git commit -m "feat(reminders): gear batch and unclaimed order reminder logic"
```

---

## Task 5: Sponsor expiry reminder logic

**Files:**
- Create: `src/lib/reminders/sponsor-expiry-reminders.ts`
- Create: `tests/lib/reminders/sponsor-expiry-reminders.test.ts`

- [ ] **Step 1: Write failing tests**

Required cases:
- Finds active sponsor assignments whose `activeEndDate` is 30/14/7 days out (or the sponsor's own `activeEndDate` when the assignment's is null)
- Generates one digest email per (organizationId, recipient) summarizing all expiring placements
- Does not fire for assignments whose sponsor is inactive (`sponsors.active=false`)

- [ ] **Step 2: Implement**

```ts
import { getDb } from "@/lib/db";
import { sponsors, sponsorAssignments } from "@/lib/db/schema";
import { and, eq, or, isNull, inArray, sql } from "drizzle-orm";
import { getGearAdminRecipients } from "./recipients";

const REMIND_DAYS = [30, 14, 7];

export interface SponsorExpiryReminder {
  type: "sponsor-expiry";
  organizationId: string;
  recipients: Array<{ userId: string; email: string }>;
  expiring: Array<{ sponsorName: string; placementType: string; expiresOn: string; daysUntilExpiry: number }>;
  sponsorsAdminUrl: string;
}

export async function checkSponsorExpiryReminders(now: Date = new Date()): Promise<SponsorExpiryReminder[]> {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const rows = await getDb()
    .select()
    .from(sponsorAssignments)
    .innerJoin(sponsors, eq(sponsorAssignments.sponsorId, sponsors.id))
    .where(eq(sponsors.active, true));

  const byOrg = new Map<string, SponsorExpiryReminder["expiring"]>();
  for (const r of rows) {
    const endStr = r.sponsor_assignments.activeEndDate ?? r.sponsors.activeEndDate;
    if (!endStr) continue;
    const end = new Date(endStr);
    const diffDays = Math.round((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (!REMIND_DAYS.includes(diffDays)) continue;

    const list = byOrg.get(r.sponsors.organizationId) ?? [];
    list.push({
      sponsorName: r.sponsors.name,
      placementType: r.sponsor_assignments.placementType,
      expiresOn: endStr as string,
      daysUntilExpiry: diffDays,
    });
    byOrg.set(r.sponsors.organizationId, list);
  }

  const reminders: SponsorExpiryReminder[] = [];
  for (const [orgId, expiring] of byOrg.entries()) {
    const recipients = await getGearAdminRecipients(orgId);
    if (!recipients.length) continue;
    reminders.push({
      type: "sponsor-expiry",
      organizationId: orgId,
      recipients: recipients.map((r) => ({ userId: r.userId, email: r.email })),
      expiring,
      sponsorsAdminUrl: `${process.env.PUBLIC_APP_URL}/admin/sponsors`,
    });
  }
  return reminders;
}

export async function dispatchSponsorExpiryReminders(plan: SponsorExpiryReminder[]): Promise<void> {
  const { sendSponsorExpiryWarningEmail } = await import("@/lib/email/send");
  for (const rem of plan) {
    for (const r of rem.recipients) {
      await sendSponsorExpiryWarningEmail({
        userId: r.userId,
        organizationId: rem.organizationId,
        to: r.email,
        sponsors: rem.expiring,
        sponsorsAdminUrl: rem.sponsorsAdminUrl,
      });
    }
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/reminders/sponsor-expiry-reminders.ts \
        tests/lib/reminders/sponsor-expiry-reminders.test.ts
git commit -m "feat(reminders): sponsor expiry reminders"
```

---

## Task 6: Cron endpoint + Netlify scheduled function

**Files:**
- Create: `src/pages/api/cron/gear-reminders.ts`
- Modify: `netlify.toml` — register scheduled function
- Look for existing Netlify scheduled functions to mirror the pattern. If none exist, use the inline scheduler as documented at https://docs.netlify.com/functions/scheduled-functions/ — expressed via `netlify.toml` pointing at the HTTP endpoint.

- [ ] **Step 1: Write the endpoint**

```ts
import type { APIRoute } from "astro";
import { checkGearBatchDueReminders, dispatchGearReminders } from "@/lib/reminders/gear-batch-reminders";
import { checkSponsorExpiryReminders, dispatchSponsorExpiryReminders } from "@/lib/reminders/sponsor-expiry-reminders";

export const POST: APIRoute = async ({ request }) => {
  // Basic shared-secret auth
  const expectedSecret = import.meta.env.CRON_SECRET;
  const provided = request.headers.get("x-cron-secret");
  if (!expectedSecret || provided !== expectedSecret) {
    return new Response("forbidden", { status: 403 });
  }

  try {
    const gearPlan = await checkGearBatchDueReminders();
    await dispatchGearReminders(gearPlan);
    const sponsorPlan = await checkSponsorExpiryReminders();
    await dispatchSponsorExpiryReminders(sponsorPlan);

    return new Response(
      JSON.stringify({
        gearRemindersSent: gearPlan.reduce((n, r) => n + r.recipients.length, 0),
        sponsorRemindersSent: sponsorPlan.reduce((n, r) => n + r.recipients.length, 0),
      }),
      { status: 200 },
    );
  } catch (e) {
    console.error("gear reminders cron error:", e);
    return new Response(JSON.stringify({ error: "Reminder job failed" }), { status: 500 });
  }
};
```

Add `CRON_SECRET` to the env vars list in `BETA_LAUNCH_CHECKLIST.md`.

- [ ] **Step 2: Register with Netlify**

Add to `netlify.toml`:

```toml
[functions."gear-reminders-scheduled"]
  schedule = "@daily"
```

Create `netlify/functions/gear-reminders-scheduled.ts`:

```ts
import type { Handler } from "@netlify/functions";
import { schedule } from "@netlify/functions";

const handler: Handler = async () => {
  const url = `${process.env.PUBLIC_APP_URL}/api/cron/gear-reminders`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "x-cron-secret": process.env.CRON_SECRET ?? "" },
  });
  if (!res.ok) {
    return { statusCode: 500, body: `Cron invocation failed: ${res.status}` };
  }
  return { statusCode: 200, body: await res.text() };
};

export default schedule("@daily", handler);
```

Verify in dev by running the endpoint manually: `curl -X POST localhost:4321/api/cron/gear-reminders -H "x-cron-secret: <secret>"` and inspect response + email logs.

- [ ] **Step 3: Write endpoint test**

`tests/api/cron/gear-reminders.test.ts`:
- Without secret → 403
- With wrong secret → 403
- With correct secret → 200 and response body contains counts

- [ ] **Step 4: Commit**

```bash
git add src/pages/api/cron/gear-reminders.ts \
        netlify/functions/gear-reminders-scheduled.ts \
        netlify.toml \
        tests/api/cron/gear-reminders.test.ts \
        BETA_LAUNCH_CHECKLIST.md
git commit -m "feat(reminders): daily cron for gear and sponsor reminders"
```

---

## Task 7: manage_gear permission audit

**Files:**
- Modify: `src/lib/auth/` — add a `requireGearManagement(context)` helper
- Modify: admin gear endpoints from Plans 1, 3, 4 to use the new helper (optional — only endpoints you want gear-staff to access without admin role)

- [ ] **Step 1: Identify existing helpers**

Look at `src/lib/auth/` (specifically `requireAdminAccess`). Understand how role + permission checks are composed.

- [ ] **Step 2: Add new helper**

```ts
// src/lib/auth/require-gear-management.ts
import type { APIContext } from "astro";

export async function requireGearManagement(context: APIContext) {
  if (!context.locals.user) {
    return {
      authorized: false as const,
      response: new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }),
    };
  }
  const org = context.locals.organization;
  if (!org) {
    return {
      authorized: false as const,
      response: new Response(JSON.stringify({ error: "No organization context" }), { status: 403 }),
    };
  }
  // Look up user_organization_access for this user + org; allow if role in admin set OR permissions includes "manage_gear"
  // ... query userOrganizationAccess; check role OR permissions array membership
  // return { authorized: true, user, org } on success
}
```

Full implementation should load the access row, check `role in ('owner','admin','manager')` or `permissions` array contains `"manage_gear"`.

- [ ] **Step 3: Update nav / admin UI**

On the admin sidebar, the Gear section should appear for users with `manage_gear` permission (not just admins). Adjust the existing nav-rendering component to check this.

- [ ] **Step 4: Optional: switch gear endpoints**

For endpoints currently gated by `requireAdminAccess`, decide case-by-case whether to relax to `requireGearManagement`. Recommended:
- Catalog CRUD, bindings, batches, pickup, sponsors — all switch to `requireGearManagement`
- Leave refund + cross-cutting admin operations on `requireAdminAccess`

- [ ] **Step 5: Tests**

Extend the existing endpoint tests from Plans 1/3/4 to add a case: a staff user with `permissions=["manage_gear"]` can access gear endpoints; without the permission they get 403.

- [ ] **Step 6: Commit**

```bash
git add src/lib/auth/ src/pages/api/admin/ tests/
git commit -m "feat(gear): manage_gear permission + endpoint gating"
```

---

## Task 8: Final polish — edge cases surfaced during E2E

- [ ] **Step 1: Season cancellation → batch cleanup**

Add a hook (either app-level on season cancellation or a migration note): when a season is marked cancelled, any open batches tied to that season should be closable (admin UI already supports the close action, but ensure no phantom orders block it). Document this in the admin batch UI as an "orphaned batch" state.

- [ ] **Step 2: Empty batches**

Batches with zero orders should still be submittable (maybe admin wants to place a rush one-off). Verify no test forbids this; if it does, update.

- [ ] **Step 3: Parent address prefill**

In Plan 2 Task 10 (post-registration flow), shipping address prefill was scoped to "last-used shipping address." Verify the implementation checks the most recent `gear_orders.shippingAddress` with `fulfillmentMethod='ship'` for that user; fix if broken.

- [ ] **Step 4: Run the full test suite and fix any broken tests discovered across plans**

Run: `npm run test:api`
Run: `npm run test`
Run: `npx astro check`

- [ ] **Step 5: Commit any fixes**

```bash
git add -u
git commit -m "chore(gear): final polish and edge-case fixes"
```

---

## Task 9: Documentation updates

- [ ] **Step 1: Update BETA_LAUNCH_CHECKLIST.md**

Append a "Gear & Sponsors" section documenting:
- `CRON_SECRET` env var
- Migration order: Plans 1 → 2 → 3 → 4 → 5
- First-admin-time steps: create a batch, configure shipping fee, configure external store

- [ ] **Step 2: Update docs/MULTI_TENANT_ARCHITECTURE.md if appropriate**

Note: all new entities are org-scoped, matching the existing pattern. Add a small paragraph describing gear + sponsors for future developers.

- [ ] **Step 3: Commit**

```bash
git add BETA_LAUNCH_CHECKLIST.md docs/MULTI_TENANT_ARCHITECTURE.md
git commit -m "docs(gear): update beta checklist and architecture docs"
```

---

## Task 10: Plan 5 wrap-up

- [ ] **Step 1: Full test run**

Run: `npm run test:api`
Run: `npm run test`

- [ ] **Step 2: Manual cron test**

`curl -X POST $PUBLIC_APP_URL/api/cron/gear-reminders -H "x-cron-secret: $CRON_SECRET"`

Verify in `email_logs` that reminders were logged.

- [ ] **Step 3: End-to-end smoke**

Seed a batch with `submitDueDate` tomorrow, run the cron, verify the admin receives an email.

Plan 5 complete. All plans 1–5 deliver the approved design.

---

## Self-review notes

- Recipients resolver uses jsonb array membership operator `?` which is Postgres-specific and matches existing patterns.
- Reminder logic is pure (returns a plan) + dispatch is separate → easier testing, no time-dependent mocking needed for the core query.
- Cron endpoint protects itself with a shared secret; Netlify scheduled function proxies with that secret.
- `manage_gear` is an opt-in permission; existing admin workflows are unchanged unless endpoints are explicitly switched. Default behavior is safe.
- Plan 5 is the smallest plan; mostly glue and polish. Nothing here blocks Plans 1–4 from being valuable individually.
