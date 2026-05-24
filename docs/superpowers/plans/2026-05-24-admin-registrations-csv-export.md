# Admin Registrations CSV Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admin-only endpoint that returns a registrations CSV for the caller's org, ready to hand to the CPA or load into a spreadsheet for roster ops.

**Architecture:** New dedicated route at `src/pages/api/admin/registrations/export.csv.ts`. Mirrors the existing `GET /api/admin/registrations` query shape (status / paymentStatus / seasonId filters) but streams `text/csv` instead of JSON. Auth via the existing `requireAdminAccess` + `requireOrganizationContext` helpers. No new library — flat string concatenation with RFC 4180 escaping (double-quote on fields containing `,`, `"`, or newline; double up embedded quotes).

**Tech Stack:** Astro `APIRoute`, Drizzle, existing auth/org-context helpers, Vitest.

**Why no `papaparse`:** the row shape is fixed and small; a 40-line CSV writer beats a dep we'd carry for one endpoint. If a second endpoint needs CSV later, extract a shared helper at that point.

**Scope check:** This is one route, one helper, one test file. Single-subsystem plan.

---

## File Structure

| Action | Path | Responsibility |
|---|---|---|
| Create | `src/pages/api/admin/registrations/export.csv.ts` | Tenant-scoped query + CSV streaming response |
| Create | `src/lib/csv/to-csv-row.ts` | Pure RFC 4180 field-escape helper (so it's testable in isolation) |
| Create | `tests/unit/csv/to-csv-row.test.ts` | Unit tests for the escaper |
| Create | `tests/api/admin/registrations-export.test.ts` | API test against the live dev server |
| Modify | `src/components/admin/registrations-list.tsx` | Add an "Export CSV" button next to the existing filters (out of scope for the minimal 1-2h pass; defer to follow-up if needed) |

---

## Task 1: RFC 4180 escape helper

**Files:**
- Create: `src/lib/csv/to-csv-row.ts`
- Test: `tests/unit/csv/to-csv-row.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/unit/csv/to-csv-row.test.ts
import { describe, it, expect } from "vitest";
import { toCsvRow } from "@/lib/csv/to-csv-row";

describe("toCsvRow", () => {
  it("joins plain fields with commas", () => {
    expect(toCsvRow(["a", "b", "c"])).toBe("a,b,c");
  });

  it("quotes fields containing commas", () => {
    expect(toCsvRow(["a", "b,c", "d"])).toBe('a,"b,c",d');
  });

  it("doubles embedded quotes inside quoted fields", () => {
    expect(toCsvRow(['he said "hi"'])).toBe('"he said ""hi"""');
  });

  it("quotes fields containing newlines", () => {
    expect(toCsvRow(["a\nb"])).toBe('"a\nb"');
  });

  it("renders nulls and undefineds as empty strings", () => {
    expect(toCsvRow(["a", null, undefined, "b"])).toBe("a,,,b");
  });

  it("coerces numbers to strings without quoting", () => {
    expect(toCsvRow([1, 2.5, 0])).toBe("1,2.5,0");
  });

  it("renders Date as ISO string", () => {
    const d = new Date("2026-01-15T10:00:00Z");
    expect(toCsvRow([d])).toBe("2026-01-15T10:00:00.000Z");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:unit -- tests/unit/csv/to-csv-row.test.ts`
Expected: FAIL with "Cannot find module '@/lib/csv/to-csv-row'"

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/csv/to-csv-row.ts

/**
 * Format a single CSV row per RFC 4180. Returns the row string without a
 * trailing newline — the caller composes the newline-delimited body so it
 * controls the line ending.
 *
 * - null/undefined → empty field
 * - Date → ISO string
 * - number → toString (unquoted)
 * - string → quoted if it contains `,`, `"`, `\n`, or `\r`
 *
 * No external library; the rules are small enough that a dep would be
 * dead weight. If a second CSV endpoint shows up, factor a row-array
 * builder on top of this.
 */
export function toCsvRow(fields: ReadonlyArray<string | number | Date | null | undefined>): string {
  return fields.map(escapeField).join(",");
}

function escapeField(value: string | number | Date | null | undefined): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "number") return String(value);
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:unit -- tests/unit/csv/to-csv-row.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/csv/to-csv-row.ts tests/unit/csv/to-csv-row.test.ts
git commit -m "feat(csv): RFC 4180 row-escape helper

Pure, dep-free string formatter for CSV rows. Used by the next-up
admin registrations export endpoint; isolated for unit-testability
and so any future CSV endpoint can reuse it.
"
```

---

## Task 2: Export endpoint

**Files:**
- Create: `src/pages/api/admin/registrations/export.csv.ts`
- Test: `tests/api/admin/registrations-export.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/api/admin/registrations-export.test.ts
import { describe, it, expect } from "vitest";
import { signIn } from "../../utils/test-helpers";

const BASE = process.env.TEST_BASE_URL || "http://localhost:4321";

describe("GET /api/admin/registrations/export.csv", () => {
  it("returns 401 without admin auth", async () => {
    const res = await fetch(`${BASE}/api/admin/registrations/export.csv`);
    expect(res.status).toBe(401);
  });

  it("returns text/csv with the right headers", async () => {
    const cookie = await signIn("admin");
    const res = await fetch(`${BASE}/api/admin/registrations/export.csv`, {
      headers: { Cookie: cookie },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/^text\/csv/);
    expect(res.headers.get("content-disposition")).toMatch(
      /^attachment; filename="registrations-/,
    );
  });

  it("returns a header row + one row per registration in the caller's org", async () => {
    const cookie = await signIn("admin");
    const res = await fetch(`${BASE}/api/admin/registrations/export.csv`, {
      headers: { Cookie: cookie },
    });
    const body = await res.text();
    const lines = body.trim().split("\n");
    // header + at least one seeded registration
    expect(lines.length).toBeGreaterThan(1);
    expect(lines[0]).toBe(
      "registration_id,status,payment_status,amount_paid_cents,amount_due_cents,player_first_name,player_last_name,parent_email,parent_first_name,parent_last_name,season_name,program_name,sport_name,waiver_signed,created_at,cancelled_at",
    );
  });

  it("honors the status filter (only includes matching rows)", async () => {
    const cookie = await signIn("admin");
    const all = await (
      await fetch(`${BASE}/api/admin/registrations/export.csv`, {
        headers: { Cookie: cookie },
      })
    ).text();
    const cancelled = await (
      await fetch(`${BASE}/api/admin/registrations/export.csv?status=cancelled`, {
        headers: { Cookie: cookie },
      })
    ).text();
    expect(cancelled.split("\n").length).toBeLessThanOrEqual(
      all.split("\n").length,
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Make sure the dev server is up first: `npm run dev` in one shell.

Run: `npm run test:api -- tests/api/admin/registrations-export.test.ts`
Expected: FAIL with 404 on each endpoint call (route doesn't exist yet).

- [ ] **Step 3: Write the endpoint**

```ts
// src/pages/api/admin/registrations/export.csv.ts
import type { APIRoute } from "astro";
import { eq, and, desc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  registrations,
  familyMembers,
  seasons,
  programs,
  sports,
  users,
} from "@/lib/db/schema";
import { locations } from "@/lib/db/schema/organizations";
import { requireAdminAccess, requireOrganizationContext } from "@/lib/auth";
import { toCsvRow } from "@/lib/csv/to-csv-row";

/**
 * GET /api/admin/registrations/export.csv
 *
 * Streams a tenant-scoped CSV of registrations. Same filter surface as
 * GET /api/admin/registrations (status, paymentStatus, seasonId) so the
 * UI can hand the same filter state to either endpoint.
 *
 * No pagination — exports the full match set. For the launch-cohort size
 * (single-digit thousands max), one query and one response is fine; if
 * we outgrow that, switch to a streaming Response body before the row
 * count gets unreasonable.
 */
const HEADER = [
  "registration_id",
  "status",
  "payment_status",
  "amount_paid_cents",
  "amount_due_cents",
  "player_first_name",
  "player_last_name",
  "parent_email",
  "parent_first_name",
  "parent_last_name",
  "season_name",
  "program_name",
  "sport_name",
  "waiver_signed",
  "created_at",
  "cancelled_at",
];

export const GET: APIRoute = async (context) => {
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) return auth.response;

  const orgContext = await requireOrganizationContext(context);
  if (!orgContext.hasOrganization) return orgContext.response;

  const url = new URL(context.request.url);
  const status = url.searchParams.get("status");
  const paymentStatus = url.searchParams.get("paymentStatus");
  const seasonId = url.searchParams.get("seasonId");

  const conditions = [eq(locations.organizationId, orgContext.organizationId)];
  if (status && status !== "all") {
    conditions.push(eq(registrations.status, status as any));
  }
  if (paymentStatus && paymentStatus !== "all") {
    conditions.push(eq(registrations.paymentStatus, paymentStatus as any));
  }
  if (seasonId) {
    conditions.push(eq(registrations.seasonId, seasonId));
  }

  const rows = await getDb()
    .select({
      id: registrations.id,
      status: registrations.status,
      paymentStatus: registrations.paymentStatus,
      amountPaidCents: registrations.amountPaidCents,
      amountDueCents: registrations.amountDueCents,
      playerFirst: familyMembers.firstName,
      playerLast: familyMembers.lastName,
      parentEmail: users.email,
      parentFirst: users.firstName,
      parentLast: users.lastName,
      seasonName: seasons.name,
      programName: programs.name,
      sportName: sports.name,
      waiverSigned: registrations.waiverSigned,
      createdAt: registrations.createdAt,
      cancelledAt: registrations.cancelledAt,
    })
    .from(registrations)
    .innerJoin(familyMembers, eq(registrations.familyMemberId, familyMembers.id))
    .innerJoin(seasons, eq(registrations.seasonId, seasons.id))
    .innerJoin(programs, eq(seasons.programId, programs.id))
    .innerJoin(locations, eq(programs.locationId, locations.id))
    .innerJoin(sports, eq(programs.sportId, sports.id))
    .innerJoin(users, eq(registrations.registeredByUserId, users.id))
    .where(and(...conditions))
    .orderBy(desc(registrations.createdAt));

  const lines = [
    toCsvRow(HEADER),
    ...rows.map((r) =>
      toCsvRow([
        r.id,
        r.status,
        r.paymentStatus,
        r.amountPaidCents,
        r.amountDueCents,
        r.playerFirst,
        r.playerLast,
        r.parentEmail,
        r.parentFirst,
        r.parentLast,
        r.seasonName,
        r.programName,
        r.sportName,
        r.waiverSigned ? "yes" : "no",
        r.createdAt,
        r.cancelledAt,
      ]),
    ),
  ];

  const body = lines.join("\n") + "\n";
  const dateStamp = new Date().toISOString().slice(0, 10);

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="registrations-${dateStamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:api -- tests/api/admin/registrations-export.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Manual smoke**

In a browser as admin, hit `https://aspiresportsohio.com/api/admin/registrations/export.csv`. File downloads as `registrations-YYYY-MM-DD.csv`. Open in a spreadsheet, verify columns + escaping on a row with a comma in any field.

- [ ] **Step 6: Commit**

```bash
git add src/pages/api/admin/registrations/export.csv.ts tests/api/admin/registrations-export.test.ts
git commit -m "feat(admin): GET /api/admin/registrations/export.csv

Tenant-scoped CSV export of registrations, same filter surface as the
existing list endpoint (status/paymentStatus/seasonId). For the CPA
intake + roster ops. No pagination — full match set per request,
acceptable at launch-cohort size.
"
```

---

## Task 3 (optional follow-up, not required for the 1-2h scope)

Add an "Export CSV" button to `src/components/admin/registrations-list.tsx` that opens `/api/admin/registrations/export.csv?<current filters>` in a new tab. Defer until the CPA actually asks; the URL works on its own.

---

## Self-Review

- **Spec coverage:** Single-feature scope; one endpoint, one helper, one test file. Each tracker item resolved (Tier 2 #9).
- **Placeholders:** None. Code blocks complete.
- **Type consistency:** `toCsvRow` accepts `string | number | Date | null | undefined`, matching every cell type the export selects. `HEADER` array length matches row array length (16 columns).
- **One missing test:** export of a row whose player name contains a comma would exercise the escape helper end-to-end via the endpoint — folded into the manual smoke step rather than a dedicated test because seeding such a row from the API-test runner is a side-trip; the unit tests on `toCsvRow` already cover the escape rules.
