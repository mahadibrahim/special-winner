# Phase 1 — Coach Compliance & Hire→Account Handoff Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/plans/2026-07-06-coach-lifecycle-and-delivery-ops.md` — Phase 1 only.

**Goal:** Give the org a system of record for coach compliance credentials and a one-click path from a hired job application to a working, org-scoped coach account with an emailed invite.

**Architecture:** A new `coach_credentials` table (org-scoped, nullable org = global) plus a pure-function compliance module drive three surfaces: a hire endpoint that creates/links a user and reuses the existing magic-link invite flow, an `/admin/coaches` compliance grid backed by a tenant-scoped list/upsert API, and a non-blocking warning attached to team coach-assignment responses. Everything reuses established house patterns: `requireOrgAdminAccess`, `requireUserInOrg`, magic links, Resend templates, and the careers R2 upload plumbing.

**Tech Stack:** Existing stack only — Astro 5 + React 19, Drizzle/Postgres, Lucia auth, Resend, R2, Vitest.

## Global Constraints

Copied from the program plan — every task's requirements implicitly include these:

- Schema changes go through `npm run db:generate` → commit migration → `db:migrate`; never `db:push` against remote DBs. Write migrations idempotently (`ADD COLUMN IF NOT EXISTS`, `DO $$ ... duplicate_object` guard).
- Every admin API endpoint validates tenant ownership via `requireSameOrg*` helpers (`src/lib/auth/require-resource-ownership.ts`). Coach endpoints use `requireCoachAccess*` helpers scoped to team assignments. (This phase's admin endpoints use `requireOrgAdminAccess` + `requireUserInOrg` — the org-aware guards from that module family.)
- New tables follow the curriculum convention: nullable `organizationId` where NULL = global default, org rows override.
- Any `findFirst`/`.limit(1)` gets an explicit `orderBy` (shared CI database hazard).
- All coach/admin pages are SSR (no `prerender = true`); UI states use `ErrorBanner` / `EmptyState` / `LoadingSkeleton` primitives.
- New timestamps in UTC, displayed in org timezone.
- E2E specs run post-merge only — grep `tests/e2e/` for affected surfaces before merging route changes.
- Each phase's implementation runs in a worktree (≥3 tasks, subagent-driven). Confirm the branch with `git branch --show-current` before the first edit.

## Execution prerequisites

- Work in a worktree (`superpowers:using-git-worktrees`), branched from `main`.
- API tests hit a running dev server. Start it with test-equivalent env before Tasks 4, 6, 7, 9:
  ```bash
  E2E_TEST_ENDPOINTS=yes R2_MOCK=1 npm run dev:bws
  ```
- Seed fixtures once per session: `npm run db:seed:e2e` (idempotent; provides `admin@test.aspiresports.com` / `TestAdmin123!`, `admin-orgb@test.aspiresports.com`, org A "aspire-sports", org B "orgb").
- API test files import `getDb()` directly (established pattern — see `tests/api/careers/apply.test.ts`), so run them with DB env: `./scripts/with-bws.sh npx vitest run --config vitest.config.ts --project api <file>`.
- The local `DATABASE_URL` points at **staging** — Tasks 1 and 2 apply their migrations there with `./scripts/with-bws.sh npm run db:migrate` so subsequent API tests can run.

## Design decisions (where the spec left room)

1. **Invite email = magic link, not password-reset token.** The old bespoke password-reset tokens were generalized into `src/lib/auth/magic-link.ts` (see comment in `src/pages/api/auth/forgot-password.ts`). The hire flow mints a `purpose: "login"` link (72h, same as `api/admin/users/invite.ts`) with `purposeContext.redirectTo = "/coach"` so redemption lands on the coach dashboard.
2. **Middleware gap fix folded in.** `/coach` access currently requires a *team assignment* (`locals.isCoach`), so a freshly hired coach with an org-scoped `coach` role but no team would bounce to `/dashboard`. Task 4 adds `userRoleNames.includes("coach")` to the middleware check — required to meet the acceptance criterion "invite lands them in `/coach`".
3. **Upsert key handled at the app layer.** Postgres treats NULLs as distinct in unique indexes, so the `(userId, organizationId, credentialType)` unique index does not dedupe NULL-org rows. v1 admin writes always set `organizationId`, and the upsert endpoint does an explicit lookup-then-update, so this is safe without a PG15-only `NULLS NOT DISTINCT` constraint.
4. **`job_applications.status` is a `varchar(30)`, not a pg enum** — adding `hired` is a code-level value, no `ALTER TYPE` needed. Only `hired_user_id` needs a migration.
5. **"Verify" is part of upsert.** Setting `status: "valid"` stamps `verifiedByUserId` with the acting admin; any other status clears it. No separate verify route.
6. **Credential documents ship in v1 as admin-uploaded PDFs** (spec scope-out is *coach self-service* upload). `[id]/document.ts` mirrors `careers/apply.ts` (PUT) and `applications/[id]/resume.ts` (GET redirect).

## File structure

| File | Responsibility |
|---|---|
| `src/lib/db/schema/coach-credentials.ts` (create) | Table + enums + relations + types |
| `src/lib/compliance/coach-credentials.ts` (create) | Pure: required-set constant, effective status, gap computation |
| `src/lib/compliance/coach-credential-gaps.ts` (create) | DB query → warnings for team-assignment soft gate |
| `src/lib/db/schema/job-applications.ts` (modify) | `hiredUserId` column, `hired` status value |
| `src/pages/api/admin/applications/[id]/hire.ts` (create) | Hire action |
| `src/lib/email/templates/coach-invite.tsx` (create), `src/lib/email/send.ts` (modify) | Invite email |
| `src/pages/api/admin/coaches/credentials/index.ts` (create) | List + upsert/verify |
| `src/pages/api/admin/coaches/credentials/[id]/document.ts` (create) | PDF upload / signed-URL download |
| `src/pages/admin/coaches.astro`, `src/components/admin/coach-credentials-grid.tsx` (create) | Compliance grid |
| `src/components/admin/applications-list.tsx` (modify) | Mark-hired UI |
| `src/pages/api/admin/teams.ts`, `src/components/admin/teams-list.tsx` (modify) | Soft warning on coach assignment |
| `src/middleware.ts` (modify) | Role-holding coaches may enter `/coach` |
| `src/lib/admin/nav-super-admin.ts`, `src/lib/admin/nav-venue-manager.ts` (modify) | Nav entry |

---

### Task 1: `coach_credentials` schema, compliance module, migration

**Files:**
- Create: `src/lib/db/schema/coach-credentials.ts`
- Create: `src/lib/compliance/coach-credentials.ts`
- Modify: `src/lib/db/schema/index.ts` (add one export line)
- Create: `src/lib/db/migrations/00NN_coach_credentials.sql` (generated, then idempotency-edited)
- Test: `tests/unit/coach-credential-status.test.ts`

**Interfaces:**
- Consumes: `users`, `organizations` tables.
- Produces (later tasks import these exact names):
  - `coachCredentials` table, `credentialTypeEnum`, `credentialStatusEnum`, `CoachCredential` type (from `@/lib/db/schema`)
  - `REQUIRED_COACH_CREDENTIALS: readonly ["safesport","background_check","cpr_first_aid","concussion_protocol"]`
  - `EXPIRING_SOON_DAYS = 60`
  - `effectiveCredentialStatus(cred: CredentialLike | null | undefined, now: Date): EffectiveCredentialStatus`
  - `requiredCredentialGaps(rowsForUser: CredentialLike[], now: Date): CredentialGap[]`
  - types `CredentialLike`, `EffectiveCredentialStatus`, `CredentialGap` (all from `@/lib/compliance/coach-credentials`)

- [x] **Step 1: Write the failing unit test**

Create `tests/unit/coach-credential-status.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  REQUIRED_COACH_CREDENTIALS,
  EXPIRING_SOON_DAYS,
  effectiveCredentialStatus,
  requiredCredentialGaps,
} from "@/lib/compliance/coach-credentials";

const NOW = new Date("2026-07-06T12:00:00Z");
const daysFromNow = (n: number) =>
  new Date(NOW.getTime() + n * 24 * 60 * 60 * 1000);

describe("REQUIRED_COACH_CREDENTIALS", () => {
  it("is the hardcoded child-safety set", () => {
    expect([...REQUIRED_COACH_CREDENTIALS]).toEqual([
      "safesport",
      "background_check",
      "cpr_first_aid",
      "concussion_protocol",
    ]);
    expect(EXPIRING_SOON_DAYS).toBe(60);
  });
});

describe("effectiveCredentialStatus", () => {
  it("missing when there is no row", () => {
    expect(effectiveCredentialStatus(null, NOW)).toBe("missing");
    expect(effectiveCredentialStatus(undefined, NOW)).toBe("missing");
  });

  it("valid with no expiry stays valid", () => {
    expect(
      effectiveCredentialStatus({ status: "valid", expiresAt: null }, NOW),
    ).toBe("valid");
  });

  it("valid far in the future stays valid", () => {
    expect(
      effectiveCredentialStatus(
        { status: "valid", expiresAt: daysFromNow(120) },
        NOW,
      ),
    ).toBe("valid");
  });

  it("valid expiring exactly at the 60-day threshold is expiring_soon", () => {
    expect(
      effectiveCredentialStatus(
        { status: "valid", expiresAt: daysFromNow(60) },
        NOW,
      ),
    ).toBe("expiring_soon");
  });

  it("valid but past its expiry date is expired (date wins over status)", () => {
    expect(
      effectiveCredentialStatus(
        { status: "valid", expiresAt: daysFromNow(-1) },
        NOW,
      ),
    ).toBe("expired");
  });

  it("pending / expired / rejected pass through", () => {
    expect(
      effectiveCredentialStatus({ status: "pending", expiresAt: null }, NOW),
    ).toBe("pending");
    expect(
      effectiveCredentialStatus({ status: "expired", expiresAt: null }, NOW),
    ).toBe("expired");
    expect(
      effectiveCredentialStatus({ status: "rejected", expiresAt: null }, NOW),
    ).toBe("rejected");
  });
});

describe("requiredCredentialGaps", () => {
  it("reports all four required credentials as missing for an empty row set", () => {
    const gaps = requiredCredentialGaps([], NOW);
    expect(gaps.map((g) => g.credentialType)).toEqual([
      ...REQUIRED_COACH_CREDENTIALS,
    ]);
    expect(gaps.every((g) => g.reason === "missing")).toBe(true);
  });

  it("a valid credential clears its gap", () => {
    const gaps = requiredCredentialGaps(
      [
        {
          credentialType: "safesport",
          status: "valid",
          expiresAt: daysFromNow(365),
        },
      ],
      NOW,
    );
    expect(gaps.map((g) => g.credentialType)).toEqual([
      "background_check",
      "cpr_first_aid",
      "concussion_protocol",
    ]);
  });

  it("expiring_soon is NOT a gap (still valid today)", () => {
    const gaps = requiredCredentialGaps(
      [
        {
          credentialType: "safesport",
          status: "valid",
          expiresAt: daysFromNow(30),
        },
      ],
      NOW,
    );
    expect(gaps.map((g) => g.credentialType)).not.toContain("safesport");
  });

  it("a date-expired credential is a gap with reason expired", () => {
    const gaps = requiredCredentialGaps(
      [
        {
          credentialType: "background_check",
          status: "valid",
          expiresAt: daysFromNow(-10),
        },
      ],
      NOW,
    );
    const bg = gaps.find((g) => g.credentialType === "background_check");
    expect(bg?.reason).toBe("expired");
  });

  it("non-required types never appear as gaps", () => {
    const gaps = requiredCredentialGaps(
      [
        {
          credentialType: "coaching_license",
          status: "rejected",
          expiresAt: null,
        },
      ],
      NOW,
    );
    expect(gaps.map((g) => g.credentialType)).not.toContain("coaching_license");
    expect(gaps).toHaveLength(4); // the four required ones, all missing
  });
});
```

- [x] **Step 2: Run the test to verify it fails**

Run: `npx vitest run --config vitest.config.ts --project unit tests/unit/coach-credential-status.test.ts`
Expected: FAIL — `Cannot find module '@/lib/compliance/coach-credentials'` (or equivalent resolve error).

- [x] **Step 3: Create the compliance module**

Create `src/lib/compliance/coach-credentials.ts`:

```typescript
/**
 * Coach compliance — pure functions only (no DB imports; unit-testable).
 *
 * The required set is a hardcoded constant per the Phase 1 spec
 * (docs/superpowers/plans/2026-07-06-coach-lifecycle-and-delivery-ops.md):
 * SafeSport + background check + CPR/first-aid + concussion protocol, per
 * docs/research/03-effective-coaching-practices.md. A `credential_requirements`
 * table is YAGNI until a second org wants a different set.
 */

export const REQUIRED_COACH_CREDENTIALS = [
  "safesport",
  "background_check",
  "cpr_first_aid",
  "concussion_protocol",
] as const;

export type RequiredCoachCredential =
  (typeof REQUIRED_COACH_CREDENTIALS)[number];

/** Valid credentials expiring within this many days get an amber warning. */
export const EXPIRING_SOON_DAYS = 60;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Minimal shape needed to evaluate a credential row (structural — full
 *  `CoachCredential` rows from the schema satisfy it). */
export interface CredentialLike {
  credentialType?: string;
  status: "pending" | "valid" | "expired" | "rejected";
  expiresAt: Date | null;
}

export type EffectiveCredentialStatus =
  | "missing"
  | "pending"
  | "valid"
  | "expiring_soon"
  | "expired"
  | "rejected";

/**
 * Collapse stored status + expiry date into a single display/decision status.
 * The expiry date wins over a stale `valid` status — nobody updates rows the
 * day a cert lapses.
 */
export function effectiveCredentialStatus(
  cred: CredentialLike | null | undefined,
  now: Date,
): EffectiveCredentialStatus {
  if (!cred) return "missing";
  if (cred.status !== "valid") return cred.status;
  if (cred.expiresAt) {
    const remainingMs = cred.expiresAt.getTime() - now.getTime();
    if (remainingMs <= 0) return "expired";
    if (remainingMs <= EXPIRING_SOON_DAYS * DAY_MS) return "expiring_soon";
  }
  return "valid";
}

export interface CredentialGap {
  credentialType: RequiredCoachCredential;
  reason: "missing" | "pending" | "expired" | "rejected";
}

/**
 * Which of the REQUIRED credentials does this user lack?
 * `rowsForUser` is every credential row for one user (any type; non-required
 * types are ignored). `expiring_soon` is deliberately NOT a gap — the
 * credential is still valid today; the grid surfaces the amber warning.
 */
export function requiredCredentialGaps(
  rowsForUser: CredentialLike[],
  now: Date,
): CredentialGap[] {
  const byType = new Map(rowsForUser.map((r) => [r.credentialType, r]));
  const gaps: CredentialGap[] = [];
  for (const credentialType of REQUIRED_COACH_CREDENTIALS) {
    const eff = effectiveCredentialStatus(byType.get(credentialType), now);
    if (
      eff === "missing" ||
      eff === "pending" ||
      eff === "expired" ||
      eff === "rejected"
    ) {
      gaps.push({ credentialType, reason: eff });
    }
  }
  return gaps;
}
```

- [x] **Step 4: Run the unit test to verify it passes**

Run: `npx vitest run --config vitest.config.ts --project unit tests/unit/coach-credential-status.test.ts`
Expected: PASS (12 tests).

- [x] **Step 5: Create the schema file**

Create `src/lib/db/schema/coach-credentials.ts`:

```typescript
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { users } from "./users";
import { organizations } from "./organizations";

/**
 * Coach compliance credentials — the system of record proving a coach on the
 * floor is cleared to be there (Phase 1 of the coach-lifecycle program).
 *
 * organizationId is nullable per the curriculum convention: NULL = a global
 * credential (e.g. a portable SafeSport cert), an org row overrides. v1 is
 * admin-entered and always org-scoped; the app-layer upsert in
 * api/admin/coaches/credentials keys on (userId, organizationId,
 * credentialType) because Postgres unique indexes treat NULLs as distinct.
 */
export const credentialTypeEnum = pgEnum("credential_type", [
  "safesport",
  "background_check",
  "cpr_first_aid",
  "concussion_protocol",
  "coaching_license",
  "other",
]);

export const credentialStatusEnum = pgEnum("credential_status", [
  "pending",
  "valid",
  "expired",
  "rejected",
]);

export const coachCredentials = pgTable(
  "coach_credentials",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id").references(
      () => organizations.id,
      { onDelete: "cascade" },
    ), // null = global credential
    credentialType: credentialTypeEnum("credential_type").notNull(),
    status: credentialStatusEnum("status").default("pending").notNull(),
    issuedAt: timestamp("issued_at"),
    expiresAt: timestamp("expires_at"),
    // R2 object key (reuses the careers resume plumbing) — never a signed URL,
    // those expire. The admin document endpoint redirects to a fresh one.
    documentKey: text("document_key"),
    verifiedByUserId: uuid("verified_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("coach_credentials_user_org_type_uniq").on(
      table.userId,
      table.organizationId,
      table.credentialType,
    ),
    index("coach_credentials_org_idx").on(table.organizationId),
    index("coach_credentials_user_idx").on(table.userId),
  ],
);

export const coachCredentialsRelations = relations(
  coachCredentials,
  ({ one }) => ({
    user: one(users, {
      fields: [coachCredentials.userId],
      references: [users.id],
    }),
    organization: one(organizations, {
      fields: [coachCredentials.organizationId],
      references: [organizations.id],
    }),
    verifiedBy: one(users, {
      fields: [coachCredentials.verifiedByUserId],
      references: [users.id],
    }),
  }),
);

export type CoachCredential = typeof coachCredentials.$inferSelect;
export type NewCoachCredential = typeof coachCredentials.$inferInsert;
```

- [x] **Step 6: Export from the schema index**

In `src/lib/db/schema/index.ts`, directly below the line `export * from "./coach-guidance";`, add:

```typescript
export * from "./coach-credentials";
```

- [x] **Step 7: Generate the migration**

Run: `npm run db:generate -- --name coach_credentials`
Expected output ends with something like: `Your SQL migration file ➜ src/lib/db/migrations/0063_coach_credentials.sql 🚀` (the number may be higher if main has moved — use whatever it prints; referred to as `00NN` below).

- [x] **Step 8: Edit the generated migration for idempotency**

Open `src/lib/db/migrations/00NN_coach_credentials.sql`. Drizzle emits bare `CREATE TYPE` statements; wrap each in the 0023/0024 guard pattern so a drifted DB doesn't kill the deploy. The first two statements must become exactly:

```sql
DO $$ BEGIN CREATE TYPE "public"."credential_type" AS ENUM('safesport', 'background_check', 'cpr_first_aid', 'concussion_protocol', 'coaching_license', 'other'); EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."credential_status" AS ENUM('pending', 'valid', 'expired', 'rejected'); EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
```

Leave the `CREATE TABLE "coach_credentials"`, FK, and index statements as generated (new table — the 0023/0024 precedent only guards types). Do NOT edit files under `src/lib/db/migrations/meta/`.

- [x] **Step 9: Apply the migration to the staging DB and type-check**

Run: `./scripts/with-bws.sh npm run db:migrate`
Expected: completes without error (applies `00NN_coach_credentials`).
Run: `npx tsc --noEmit`
Expected: zero errors.

- [x] **Step 10: Commit**

```bash
git add src/lib/db/schema/coach-credentials.ts src/lib/db/schema/index.ts src/lib/compliance/coach-credentials.ts src/lib/db/migrations tests/unit/coach-credential-status.test.ts
git commit -m "feat(compliance): coach_credentials table + required-credential module

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: `job_applications` — `hiredUserId` column + `hired` status value

**Files:**
- Modify: `src/lib/db/schema/job-applications.ts`
- Create: `src/lib/db/migrations/00NN_job_applications_hired.sql` (generated, then idempotency-edited)

**Interfaces:**
- Produces: `jobApplications.hiredUserId` (uuid, nullable, FK → users, `set null`); the status value convention `"new" | "archived" | "hired"` (status is a `varchar(30)`, not a pg enum — no type change needed). Task 4 writes both fields; Task 5 reads them.

- [x] **Step 1: Update the schema file**

In `src/lib/db/schema/job-applications.ts`, make three edits.

Replace the import of organizations:

```typescript
import { organizations } from "./organizations";
```

with:

```typescript
import { organizations } from "./organizations";
import { users } from "./users";
```

Replace the status doc comment:

```typescript
 * `status` exists only for the admin fallback list (new → archived);
 * hiring stages live in Notion and are never synced back.
```

with:

```typescript
 * `status` exists only for the admin fallback list (new → archived);
 * hiring stages live in Notion and are never synced back — EXCEPT the
 * terminal `hired` value, stamped by POST /api/admin/applications/[id]/hire
 * together with `hiredUserId` (the created/linked coach account).
```

Replace:

```typescript
  status: varchar("status", { length: 30 }).default("new").notNull(),
```

with:

```typescript
  status: varchar("status", { length: 30 }).default("new").notNull(), // new | archived | hired
  hiredUserId: uuid("hired_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
```

- [x] **Step 2: Generate the migration**

Run: `npm run db:generate -- --name job_applications_hired`
Expected: `Your SQL migration file ➜ src/lib/db/migrations/00NN_job_applications_hired.sql`.

- [x] **Step 3: Edit the generated migration for idempotency**

Replace the generated file's contents with exactly (idempotent column + guarded FK):

```sql
ALTER TABLE "job_applications" ADD COLUMN IF NOT EXISTS "hired_user_id" uuid;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "job_applications" ADD CONSTRAINT "job_applications_hired_user_id_users_id_fk" FOREIGN KEY ("hired_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;
```

- [x] **Step 4: Apply and type-check**

Run: `./scripts/with-bws.sh npm run db:migrate`
Expected: completes without error.
Run: `npx tsc --noEmit`
Expected: zero errors.

- [x] **Step 5: Commit**

```bash
git add src/lib/db/schema/job-applications.ts src/lib/db/migrations
git commit -m "feat(ats): hired status value + hiredUserId on job_applications

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Coach invite email (template + sender)

**Files:**
- Create: `src/lib/email/templates/coach-invite.tsx`
- Modify: `src/lib/email/send.ts`
- Test: `tests/unit/coach-invite-email.test.ts`

**Interfaces:**
- Consumes: `renderEmail` from `@/lib/email/render`, `EmailLayout` primitives from `@/lib/email/components/email-layout`, `sendTransactionalEmail` (module-private in send.ts).
- Produces: `sendCoachInviteEmail(params: SendCoachInviteParams): Promise<{ success: boolean; messageId?: string; error?: string }>` exported from `@/lib/email/send`, where `SendCoachInviteParams = { userId: string; recipientEmail: string; name: string; inviteUrl: string; expiresIn?: string; brand?: BrandId }`. Task 4 calls it.

- [x] **Step 1: Write the failing render test**

Create `tests/unit/coach-invite-email.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { renderEmail } from "@/lib/email/render";
import { CoachInviteEmail } from "@/lib/email/templates/coach-invite";

describe("CoachInviteEmail", () => {
  it("renders the invite URL, name, and expiry into html and text", async () => {
    const { html, text } = await renderEmail(
      CoachInviteEmail({
        name: "Sam",
        inviteUrl: "https://example.com/m/tok123",
        expiresIn: "72 hours",
      }),
    );
    expect(html).toContain("https://example.com/m/tok123");
    expect(html).toContain("Sam");
    expect(html).toContain("72 hours");
    expect(text).toContain("https://example.com/m/tok123");
  });

  it("falls back gracefully with no name", async () => {
    const { html } = await renderEmail(
      CoachInviteEmail({
        name: "",
        inviteUrl: "https://example.com/m/tok456",
        expiresIn: "72 hours",
      }),
    );
    expect(html).toContain("there");
  });
});
```

- [x] **Step 2: Run the test to verify it fails**

Run: `npx vitest run --config vitest.config.ts --project unit tests/unit/coach-invite-email.test.ts`
Expected: FAIL — cannot resolve `@/lib/email/templates/coach-invite`.

- [x] **Step 3: Create the template**

Create `src/lib/email/templates/coach-invite.tsx` (mirrors `sign-in-link.tsx`):

```tsx
import { Link, Text } from "@react-email/components";
import {
  Button,
  Content,
  EmailLayout,
  H1,
  P,
} from "@/lib/email/components/email-layout";
import { emailThemeFor } from "@/lib/email/components/email-theme";
import { getBrandTheme, type BrandId } from "@/lib/branding/themes";

interface CoachInviteEmailProps {
  name: string;
  inviteUrl: string;
  expiresIn: string;
  brand?: BrandId;
}

export function CoachInviteEmail({
  name,
  inviteUrl,
  expiresIn,
  brand,
}: CoachInviteEmailProps) {
  const t = emailThemeFor(brand);
  const brandName = getBrandTheme(brand).displayName;
  return (
    <EmailLayout
      preview={`You're hired — set up your ${brandName} coach account`}
      brand={brand}
    >
      <Content>
        <H1>Welcome to the {brandName} coaching team</H1>
        <P>Hi {name || "there"},</P>
        <P>
          Your coach account is ready. Tap the button below to sign in — no
          password needed. You&apos;ll land on your coach dashboard, where you
          can see your teams, plan practices, and track player development.
        </P>
        <Button href={inviteUrl}>Set up my coach account</Button>
        <P>
          This link expires in <strong>{expiresIn}</strong>. If it expires,
          use &quot;Forgot password&quot; on the sign-in page with this email
          address to get a fresh one.
        </P>
        <P>
          If the button above doesn&apos;t work, copy and paste this link into
          your browser:
        </P>
        <Text style={linkLine(t.tokens.inkMuted)}>
          <Link href={inviteUrl} style={linkStyle(t.tokens.primary)}>
            {inviteUrl}
          </Link>
        </Text>
      </Content>
    </EmailLayout>
  );
}

const linkLine = (inkMuted: string) => ({
  fontSize: "13px",
  lineHeight: "1.5",
  color: inkMuted,
  margin: "0 0 16px",
  wordBreak: "break-all" as const,
});

const linkStyle = (primary: string) => ({
  color: primary,
  textDecoration: "underline",
});

export default CoachInviteEmail;
```

- [x] **Step 4: Add the sender to send.ts**

In `src/lib/email/send.ts`, below the existing template imports (after the line `import { SignInLinkEmail } from "./templates/sign-in-link";`), add:

```typescript
import { CoachInviteEmail } from "./templates/coach-invite";
```

Then, directly after the closing brace of `sendSignInLinkEmail` (line ~647), add:

```typescript
// Coach hire invite (sent by POST /api/admin/applications/[id]/hire)
export interface SendCoachInviteParams {
  userId: string;
  recipientEmail: string;
  name: string;
  inviteUrl: string;
  expiresIn?: string;
  brand?: BrandId;
}

export async function sendCoachInviteEmail(params: SendCoachInviteParams) {
  if (!isEmailConfigured()) {
    console.warn("Email not configured, skipping coach invite email");
    return { success: false, error: "Email not configured" };
  }

  const brandName = getBrandTheme(params.brand).displayName;

  const { html, text } = await renderEmail(
    CoachInviteEmail({
      name: params.name,
      inviteUrl: params.inviteUrl,
      expiresIn: params.expiresIn ?? "72 hours",
      brand: params.brand,
    }),
  );

  return sendTransactionalEmail({
    userId: params.userId,
    emailType: "coach_invite",
    to: params.recipientEmail,
    subject: `Welcome to the ${brandName} coaching team`,
    html,
    text,
    from: fromForBrand(params.brand),
  });
}
```

- [x] **Step 5: Run test + type check**

Run: `npx vitest run --config vitest.config.ts --project unit tests/unit/coach-invite-email.test.ts`
Expected: PASS (2 tests).
Run: `npx tsc --noEmit`
Expected: zero errors.

- [x] **Step 6: Commit**

```bash
git add src/lib/email/templates/coach-invite.tsx src/lib/email/send.ts tests/unit/coach-invite-email.test.ts
git commit -m "feat(email): coach hire invite template + sender

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Hire endpoint `POST /api/admin/applications/[id]/hire` + middleware coach-role fix

**Files:**
- Create: `src/pages/api/admin/applications/[id]/hire.ts`
- Modify: `src/middleware.ts` (one check)
- Test: `tests/api/admin/applications-hire.test.ts`

**Interfaces:**
- Consumes: `jobApplications.hiredUserId` (Task 2), `sendCoachInviteEmail` (Task 3), existing `requireOrgAdminAccess`, `hashPassword`, `normalizeForUniqueness`, `createMagicLink`, `buildMagicLinkUrl`.
- Produces: `POST /api/admin/applications/[id]/hire` → `200 { hired: true, userId: string, createdNewUser: boolean }` | `404` (not yours/unknown) | `409 { error, hiredUserId }` (already hired). Task 5's UI calls it.

**Requires dev server running** (see Execution prerequisites) with the Task 1+2 migrations applied.

- [x] **Step 1: Write the failing API test**

Create `tests/api/admin/applications-hire.test.ts`:

```typescript
/**
 * Hire handoff: application → coach account.
 *
 * Uses the real public apply endpoint to create fixture applications
 * (Turnstile fails open in dev/CI — same contract as careers/apply.test.ts)
 * and asserts side effects directly in the DB (established pattern there).
 */
import { describe, it, expect, beforeAll } from "vitest";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  jobApplications,
  magicLinks,
  roles,
  userRoles,
  users,
} from "@/lib/db/schema";
import { userOrganizationAccess } from "@/lib/db/schema/organizations";
import {
  getAdminCookie,
  getParentCookie,
  apiFetch,
  expectJson,
} from "../setup/test-helpers";

const BASE = process.env.TEST_BASE_URL || "http://localhost:4321";

function applicationForm(email: string): FormData {
  const fd = new FormData();
  fd.append("role", "coach");
  fd.append("firstName", "Hire");
  fd.append("lastName", "Candidate");
  fd.append("email", email);
  fd.append("experience", "Five seasons coaching U8 soccer.");
  fd.append("availability", "weeknights");
  fd.append("certifications", "SafeSport (2025), CPR");
  return fd;
}

async function createApplication(email: string): Promise<string> {
  const res = await fetch(`${BASE}/api/public/careers/apply`, {
    method: "POST",
    body: applicationForm(email),
  });
  expect(res.status).toBe(200);
  const body = await res.json();
  const [row] = await getDb()
    .select()
    .from(jobApplications)
    .where(eq(jobApplications.id, body.id));
  // The hire endpoint pins the application to the caller's org — localhost
  // must resolve the HQ org for the fixture to be hireable.
  expect(row.organizationId).not.toBeNull();
  return body.id as string;
}

describe("POST /api/admin/applications/[id]/hire", () => {
  let adminCookie: string;

  beforeAll(async () => {
    adminCookie = await getAdminCookie();
  });

  it("401 unauthenticated", async () => {
    const res = await apiFetch(
      "/api/admin/applications/00000000-0000-0000-0000-000000000001/hire",
      { method: "POST" },
    );
    expect(res.status).toBe(401);
  });

  it("403 for a parent (no admin role)", async () => {
    const parentCookie = await getParentCookie();
    const res = await apiFetch(
      "/api/admin/applications/00000000-0000-0000-0000-000000000001/hire",
      { method: "POST", cookie: parentCookie },
    );
    expect(res.status).toBe(403);
  });

  it("404 for an unknown application id", async () => {
    const res = await apiFetch(
      "/api/admin/applications/00000000-0000-0000-0000-000000000099/hire",
      { method: "POST", cookie: adminCookie },
    );
    expect(res.status).toBe(404);
  });

  it("creates the user, org-scoped coach role, invite link, and stamps the application", async () => {
    const email = `hire-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
    const applicationId = await createApplication(email);

    const res = await apiFetch(
      `/api/admin/applications/${applicationId}/hire`,
      { method: "POST", cookie: adminCookie },
    );
    const json = await expectJson(res, 200);
    expect(json.hired).toBe(true);
    expect(json.createdNewUser).toBe(true);
    expect(json.userId).toBeTruthy();

    const db = getDb();

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, json.userId));
    expect(user.email).toBe(email);
    expect(user.firstName).toBe("Hire");
    expect(user.passwordHash).toBeTruthy(); // unusable random password

    const [app] = await db
      .select()
      .from(jobApplications)
      .where(eq(jobApplications.id, applicationId));
    expect(app.status).toBe("hired");
    expect(app.hiredUserId).toBe(json.userId);

    const [coachRole] = await db
      .select()
      .from(roles)
      .where(eq(roles.name, "coach"));
    const roleRows = await db
      .select()
      .from(userRoles)
      .where(
        and(
          eq(userRoles.userId, json.userId),
          eq(userRoles.roleId, coachRole.id),
          eq(userRoles.scopeType, "organization"),
          eq(userRoles.scopeId, app.organizationId!),
        ),
      );
    expect(roleRows).toHaveLength(1);

    const accessRows = await db
      .select()
      .from(userOrganizationAccess)
      .where(
        and(
          eq(userOrganizationAccess.userId, json.userId),
          eq(userOrganizationAccess.organizationId, app.organizationId!),
        ),
      );
    expect(accessRows).toHaveLength(1);

    // The invite magic link is minted before the (CI-skipped) email send —
    // proxy assertion for "applicant receives a working invite".
    const linkRows = await db
      .select()
      .from(magicLinks)
      .where(
        and(
          eq(magicLinks.userId, json.userId),
          eq(magicLinks.purpose, "login"),
        ),
      );
    expect(linkRows.length).toBeGreaterThanOrEqual(1);
    expect(
      (linkRows[0].purposeContext as { redirectTo?: string })?.redirectTo,
    ).toBe("/coach");
  });

  it("second hire on the same application → 409", async () => {
    const email = `hire-dup-${Date.now()}@example.com`;
    const applicationId = await createApplication(email);
    await expectJson(
      await apiFetch(`/api/admin/applications/${applicationId}/hire`, {
        method: "POST",
        cookie: adminCookie,
      }),
      200,
    );
    const res = await apiFetch(
      `/api/admin/applications/${applicationId}/hire`,
      { method: "POST", cookie: adminCookie },
    );
    expect(res.status).toBe(409);
  });

  it("links an existing user by email instead of duplicating (idempotent role)", async () => {
    const email = `hire-link-${Date.now()}@example.com`;
    const first = await createApplication(email);
    const res1 = await expectJson(
      await apiFetch(`/api/admin/applications/${first}/hire`, {
        method: "POST",
        cookie: adminCookie,
      }),
      200,
    );
    const second = await createApplication(email);
    const res2 = await expectJson(
      await apiFetch(`/api/admin/applications/${second}/hire`, {
        method: "POST",
        cookie: adminCookie,
      }),
      200,
    );
    expect(res2.userId).toBe(res1.userId);
    expect(res2.createdNewUser).toBe(false);

    // Coach role not duplicated
    const db = getDb();
    const [coachRole] = await db
      .select()
      .from(roles)
      .where(eq(roles.name, "coach"));
    const roleRows = await db
      .select()
      .from(userRoles)
      .where(
        and(
          eq(userRoles.userId, res1.userId),
          eq(userRoles.roleId, coachRole.id),
        ),
      );
    expect(roleRows).toHaveLength(1);
  });
});
```

- [x] **Step 2: Run the test to verify it fails**

Run: `./scripts/with-bws.sh npx vitest run --config vitest.config.ts --project api tests/api/admin/applications-hire.test.ts`
Expected: FAIL — the 404/hire assertions fail because the route doesn't exist yet (Astro returns 404 for the route, so the "unknown id" test may pass; the 200-path tests must FAIL).

- [x] **Step 3: Implement the endpoint**

Create `src/pages/api/admin/applications/[id]/hire.ts`:

```typescript
import type { APIRoute } from "astro";
import crypto from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { jobApplications, roles, userRoles, users } from "@/lib/db/schema";
import { userOrganizationAccess } from "@/lib/db/schema/organizations";
import { requireOrgAdminAccess } from "@/lib/auth";
import { hashPassword } from "@/lib/auth/password";
import { normalizeForUniqueness } from "@/lib/auth/email-normalize";
import { createMagicLink, buildMagicLinkUrl } from "@/lib/auth/magic-link";
import { sendCoachInviteEmail } from "@/lib/email/send";
import { brandFromHost } from "@/lib/organization/soccerone-routing";

export const prerender = false;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

/**
 * POST /api/admin/applications/[id]/hire
 *
 * Marks an application hired: creates a user for the applicant's email (or
 * links the existing account), grants an org-scoped `coach` role, records
 * org membership, stamps status='hired' + hiredUserId, and emails a 72-hour
 * magic-link invite that lands on /coach (mirrors api/admin/users/invite.ts).
 * Idempotent by application: a second call returns 409.
 */
export const POST: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;

  const id = context.params.id;
  if (!id) return json(400, { error: "id required" });

  const db = getDb();

  // Pin the application to the caller's org (404 conflates cross-tenant
  // with not-found, per require-resource-ownership convention).
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
  if (application.hiredUserId) {
    return json(409, {
      error: "Application is already marked hired",
      hiredUserId: application.hiredUserId,
    });
  }

  const email = normalizeForUniqueness(application.email);

  // Link the existing account by canonical email, or create one with a
  // random unusable password — the invitee signs in via the emailed link.
  const [existingUser] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .orderBy(asc(users.createdAt))
    .limit(1);

  let hiredUser = existingUser;
  const createdNewUser = !existingUser;
  if (!hiredUser) {
    const passwordHash = await hashPassword(
      crypto.randomBytes(32).toString("base64url"),
    );
    [hiredUser] = await db
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

  // Org membership (idempotent) — mirrors api/admin/users/invite.ts.
  const [existingAccess] = await db
    .select({ userId: userOrganizationAccess.userId })
    .from(userOrganizationAccess)
    .where(
      and(
        eq(userOrganizationAccess.userId, hiredUser.id),
        eq(userOrganizationAccess.organizationId, auth.organizationId),
      ),
    )
    .orderBy(asc(userOrganizationAccess.userId))
    .limit(1);
  if (!existingAccess) {
    await db.insert(userOrganizationAccess).values({
      userId: hiredUser.id,
      organizationId: auth.organizationId,
      role: "staff",
      invitedAt: new Date(),
    });
  }

  // Org-scoped coach role (idempotent).
  const [coachRole] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(eq(roles.name, "coach"))
    .orderBy(asc(roles.id))
    .limit(1);
  if (!coachRole) {
    return json(500, { error: "coach role missing from roles table" });
  }
  const [existingRole] = await db
    .select({ id: userRoles.id })
    .from(userRoles)
    .where(
      and(
        eq(userRoles.userId, hiredUser.id),
        eq(userRoles.roleId, coachRole.id),
        eq(userRoles.scopeType, "organization"),
        eq(userRoles.scopeId, auth.organizationId),
      ),
    )
    .orderBy(asc(userRoles.createdAt))
    .limit(1);
  if (!existingRole) {
    await db.insert(userRoles).values({
      userId: hiredUser.id,
      roleId: coachRole.id,
      scopeType: "organization",
      scopeId: auth.organizationId,
    });
  }

  await db
    .update(jobApplications)
    .set({ status: "hired", hiredUserId: hiredUser.id })
    .where(eq(jobApplications.id, application.id));

  // Invite email — reuse the magic-link login flow (72h window, same as the
  // generic staff invite). A send failure must not roll back the hire; the
  // admin can re-send via forgot-password.
  try {
    const { token } = await createMagicLink({
      userId: hiredUser.id,
      organizationId: auth.organizationId,
      purpose: "login",
      expiresInSeconds: 72 * 60 * 60,
      deliveredChannel: "email",
      deliveredTo: hiredUser.email,
      purposeContext: { redirectTo: "/coach" },
    });
    await sendCoachInviteEmail({
      userId: hiredUser.id,
      recipientEmail: hiredUser.email,
      name: application.firstName,
      inviteUrl: buildMagicLinkUrl(token, {
        origin: new URL(context.request.url).origin,
      }),
      expiresIn: "72 hours",
      brand: brandFromHost(context.request.headers.get("host") ?? ""),
    });
  } catch (err) {
    console.error("[admin/applications/hire] invite email failed:", err);
  }

  return json(200, {
    hired: true,
    userId: hiredUser.id,
    createdNewUser,
  });
};
```

- [x] **Step 4: Fix the middleware coach gate**

The invite lands on `/coach`, but the middleware maps the `"coach"` route role to `locals.isCoach` — which is *team-assignment-based* (`getCoachTeamIds().length > 0`). A freshly hired coach has the role but no team yet and would bounce to `/dashboard?error=unauthorized`. In `src/middleware.ts` (~line 290), replace:

```typescript
        // Check whether the user holds any of the required roles.
        // "admin" in the rule list means location_admin OR super_admin
        // (both of which set isAdmin=true). "coach" means isCoach=true.
        const userRoleNames = context.locals.userRoles.map((r) => r.name);
        const hasRequiredRole = rule.roles.some((required) => {
          if (required === "admin") return context.locals.isAdmin;
          if (required === "coach") return context.locals.isCoach;
          return userRoleNames.includes(required as never);
        });
```

with:

```typescript
        // Check whether the user holds any of the required roles.
        // "admin" in the rule list means location_admin OR super_admin
        // (both of which set isAdmin=true). "coach" means isCoach=true
        // (has team assignments) OR holds a `coach` role — a freshly hired
        // coach has the role before any team assignment and must still
        // reach /coach (Phase 1 hire handoff).
        const userRoleNames = context.locals.userRoles.map((r) => r.name);
        const hasRequiredRole = rule.roles.some((required) => {
          if (required === "admin") return context.locals.isAdmin;
          if (required === "coach")
            return (
              context.locals.isCoach || userRoleNames.includes("coach")
            );
          return userRoleNames.includes(required as never);
        });
```

Note: `/coach` pages already render empty states for zero teams; this only widens the gate, never narrows it.

- [x] **Step 5: Run the API test to verify it passes**

Run: `./scripts/with-bws.sh npx vitest run --config vitest.config.ts --project api tests/api/admin/applications-hire.test.ts`
Expected: PASS (6 tests). If the fixture-org assertion (`organizationId not null`) fails, re-run `npm run db:seed:e2e` and restart the dev server.
Run: `npx tsc --noEmit`
Expected: zero errors.

- [x] **Step 6: Commit**

```bash
git add src/pages/api/admin/applications/[id]/hire.ts src/middleware.ts tests/api/admin/applications-hire.test.ts
git commit -m "feat(ats): hire endpoint — application to org-scoped coach account with magic-link invite

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: "Mark hired" action in the admin applications list

**Files:**
- Modify: `src/components/admin/applications-list.tsx`

**Interfaces:**
- Consumes: `POST /api/admin/applications/[id]/hire` → `{ hired, userId, createdNewUser }` (Task 4). `GET /api/admin/applications` already `select()`s all columns, so `status` and `hiredUserId` flow through with no endpoint change.
- Produces: UI only.

No unit-test harness exists for React admin components (established house pattern: admin list components are exercised by post-merge E2E and type-checked); this task's verification cycle is `tsc` + the Task 10 build. Do not add new E2E specs (they only run post-merge and would not gate the PR).

- [ ] **Step 1: Extend the row interface and imports**

In `src/components/admin/applications-list.tsx`, replace:

```tsx
import { useEffect, useState } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingSkeleton } from "@/components/ui/loading-skeleton";
import { ErrorBanner } from "@/components/ui/error-banner";
```

with:

```tsx
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingSkeleton } from "@/components/ui/loading-skeleton";
import { ErrorBanner } from "@/components/ui/error-banner";
```

and in `interface ApplicationRow`, replace:

```tsx
  notionPageId: string | null;
  notionSyncedAt: string | null;
  createdAt: string;
```

with:

```tsx
  notionPageId: string | null;
  notionSyncedAt: string | null;
  status: string;
  hiredUserId: string | null;
  createdAt: string;
```

- [ ] **Step 2: Add the hire handler**

Inside the `ApplicationsList` component, directly after the `useEffect(...)` block, add:

```tsx
  const [hiringId, setHiringId] = useState<string | null>(null);

  async function markHired(id: string) {
    setHiringId(id);
    try {
      const res = await fetch(`/api/admin/applications/${id}/hire`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setRows(
        (prev) =>
          prev?.map((r) =>
            r.id === id
              ? { ...r, status: "hired", hiredUserId: data.userId }
              : r,
          ) ?? prev,
      );
      toast.success(
        data.createdNewUser
          ? "Hired — coach account created and invite emailed."
          : "Hired — existing account linked and invite emailed.",
      );
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not mark hired.",
      );
    } finally {
      setHiringId(null);
    }
  }
```

- [ ] **Step 3: Add the Hiring column**

In the `<thead>` row, after `<th className="py-2 pr-4">Notion</th>`, add:

```tsx
            <th className="py-2 pr-4">Hiring</th>
```

In the `<tbody>` row, after the Notion `<td>` (`<td className="py-2 pr-4">{a.notionSyncedAt ? "Synced" : "Pending"}</td>`), add:

```tsx
              <td className="py-2 pr-4">
                {a.status === "hired" ? (
                  <span className="rounded bg-green-100 px-2 py-1 text-xs font-medium text-green-800">
                    Hired
                  </span>
                ) : (
                  <button
                    type="button"
                    disabled={hiringId === a.id}
                    onClick={() => markHired(a.id)}
                    className="rounded border border-border px-2 py-1 text-xs font-medium hover:bg-gray-50 disabled:opacity-50"
                  >
                    {hiringId === a.id ? "Hiring…" : "Mark hired"}
                  </button>
                )}
              </td>
```

- [ ] **Step 4: Type check**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/applications-list.tsx
git commit -m "feat(admin): mark-hired action on the applications list

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Credentials API — list + upsert/verify, tenant-scoped

**Files:**
- Create: `src/pages/api/admin/coaches/credentials/index.ts`
- Test: `tests/api/admin/coach-credentials.test.ts`

**Interfaces:**
- Consumes: `coachCredentials`, `REQUIRED_COACH_CREDENTIALS`, `EXPIRING_SOON_DAYS`, `effectiveCredentialStatus`, `requiredCredentialGaps` (Task 1); `jobApplications.hiredUserId` (Task 2); `requireOrgAdminAccess`, `requireUserInOrg`, `ownershipDeniedResponse`.
- Produces (Tasks 7–9 depend on these shapes):
  - `GET /api/admin/coaches/credentials` → `200 { coaches: CoachRow[], requiredTypes: string[], expiringSoonDays: number }` where `CoachRow = { id, firstName, lastName, email, applicationCertifications: string | null, credentials: Array<{ id, credentialType, status, effectiveStatus, issuedAt, expiresAt, documentKey, notes, verifiedByUserId }>, gaps: Array<{ credentialType, reason }> }`
  - `POST /api/admin/coaches/credentials` body `{ userId, credentialType, status, issuedAt?: "YYYY-MM-DD" | null, expiresAt?: "YYYY-MM-DD" | null, notes?: string | null }` → `200 { credential }` | `404` (user not in org) | `400` (validation)

- [ ] **Step 1: Write the failing API test**

Create `tests/api/admin/coach-credentials.test.ts`:

```typescript
/**
 * Coach credentials API: tenant isolation + CRUD.
 *
 * Fixture users are created directly in the DB (org membership via
 * user_organization_access, coach role via user_roles) so the test does not
 * depend on the shape the e2e seed gives the shared coach@test account.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  coachCredentials,
  organizations,
  roles,
  userRoles,
  users,
} from "@/lib/db/schema";
import { userOrganizationAccess } from "@/lib/db/schema/organizations";
import {
  getAdminCookie,
  getAuthCookie,
  getParentCookie,
  apiFetch,
  expectJson,
} from "../setup/test-helpers";

let adminACookie: string;
let orgAId: string;
let orgBId: string;
let coachRoleId: string;
let orgACoachId: string; // fresh coach in org A, no credentials yet
let orgBCoachId: string; // fresh coach in org B, one credential row

async function createCoachUser(orgId: string, tag: string): Promise<string> {
  const db = getDb();
  const [user] = await db
    .insert(users)
    .values({
      email: `cred-${tag}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
      firstName: `Cred${tag}`,
      lastName: "Coach",
      emailVerified: false,
    })
    .returning();
  await db.insert(userOrganizationAccess).values({
    userId: user.id,
    organizationId: orgId,
    role: "staff",
    invitedAt: new Date(),
  });
  await db.insert(userRoles).values({
    userId: user.id,
    roleId: coachRoleId,
    scopeType: "organization",
    scopeId: orgId,
  });
  return user.id;
}

beforeAll(async () => {
  adminACookie = await getAdminCookie();
  const db = getDb();

  const [orgA] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.slug, "aspire-sports"))
    .orderBy(asc(organizations.createdAt))
    .limit(1);
  const [orgB] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.slug, "orgb"))
    .orderBy(asc(organizations.createdAt))
    .limit(1);
  expect(orgA).toBeTruthy();
  expect(orgB).toBeTruthy();
  orgAId = orgA.id;
  orgBId = orgB.id;

  const [coachRole] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(eq(roles.name, "coach"))
    .orderBy(asc(roles.id))
    .limit(1);
  coachRoleId = coachRole.id;

  orgACoachId = await createCoachUser(orgAId, "a");
  orgBCoachId = await createCoachUser(orgBId, "b");
  await db.insert(coachCredentials).values({
    userId: orgBCoachId,
    organizationId: orgBId,
    credentialType: "safesport",
    status: "valid",
    expiresAt: new Date("2030-01-01T00:00:00Z"),
  });
});

describe("auth gates", () => {
  it("GET unauthenticated → 401", async () => {
    const res = await apiFetch("/api/admin/coaches/credentials");
    expect(res.status).toBe(401);
  });

  it("GET as parent → 403", async () => {
    const parentCookie = await getParentCookie();
    const res = await apiFetch("/api/admin/coaches/credentials", {
      cookie: parentCookie,
    });
    expect(res.status).toBe(403);
  });

  it("GET as Org B admin in Org A context → 403 (org-scoped admin gate)", async () => {
    const adminBCookie = await getAuthCookie(
      "admin-orgb@test.aspiresports.com",
      "TestAdmin123!",
    );
    const res = await apiFetch("/api/admin/coaches/credentials", {
      cookie: adminBCookie,
    });
    expect(res.status).toBe(403);
  });
});

describe("tenant isolation", () => {
  it("Org A admin list contains the Org A coach but never the Org B coach", async () => {
    const json = await expectJson(
      await apiFetch("/api/admin/coaches/credentials", {
        cookie: adminACookie,
      }),
      200,
    );
    const ids = (json.coaches as Array<{ id: string }>).map((c) => c.id);
    expect(ids).toContain(orgACoachId);
    expect(ids).not.toContain(orgBCoachId);
  });

  it("Org A admin cannot upsert a credential for an Org B user → 404", async () => {
    const res = await apiFetch("/api/admin/coaches/credentials", {
      method: "POST",
      cookie: adminACookie,
      body: JSON.stringify({
        userId: orgBCoachId,
        credentialType: "safesport",
        status: "valid",
        expiresAt: "2030-01-01",
      }),
    });
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe("Resource not found");
  });
});

describe("upsert + verify + list", () => {
  it("creates a pending credential", async () => {
    const json = await expectJson(
      await apiFetch("/api/admin/coaches/credentials", {
        method: "POST",
        cookie: adminACookie,
        body: JSON.stringify({
          userId: orgACoachId,
          credentialType: "safesport",
          status: "pending",
          notes: "Awaiting SafeSport completion email",
        }),
      }),
      200,
    );
    expect(json.credential.status).toBe("pending");
    expect(json.credential.verifiedByUserId).toBeNull();
    expect(json.credential.organizationId).toBe(orgAId);
  });

  it("upserts to valid (same row), stamping verifiedByUserId", async () => {
    const json = await expectJson(
      await apiFetch("/api/admin/coaches/credentials", {
        method: "POST",
        cookie: adminACookie,
        body: JSON.stringify({
          userId: orgACoachId,
          credentialType: "safesport",
          status: "valid",
          issuedAt: "2026-06-01",
          expiresAt: "2030-01-01",
        }),
      }),
      200,
    );
    expect(json.credential.status).toBe("valid");
    expect(json.credential.verifiedByUserId).toBeTruthy();

    // Still exactly one row for (user, org, type) — app-level upsert.
    const rows = await getDb()
      .select()
      .from(coachCredentials)
      .where(
        and(
          eq(coachCredentials.userId, orgACoachId),
          eq(coachCredentials.organizationId, orgAId),
          eq(coachCredentials.credentialType, "safesport"),
        ),
      );
    expect(rows).toHaveLength(1);
  });

  it("expiring-within-60-days shows effectiveStatus expiring_soon and is not a gap", async () => {
    const soon = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    await expectJson(
      await apiFetch("/api/admin/coaches/credentials", {
        method: "POST",
        cookie: adminACookie,
        body: JSON.stringify({
          userId: orgACoachId,
          credentialType: "cpr_first_aid",
          status: "valid",
          expiresAt: soon,
        }),
      }),
      200,
    );

    const json = await expectJson(
      await apiFetch("/api/admin/coaches/credentials", {
        cookie: adminACookie,
      }),
      200,
    );
    const coach = (json.coaches as Array<any>).find(
      (c) => c.id === orgACoachId,
    );
    expect(coach).toBeTruthy();

    const cpr = coach.credentials.find(
      (c: any) => c.credentialType === "cpr_first_aid",
    );
    expect(cpr.effectiveStatus).toBe("expiring_soon");

    const gapTypes = coach.gaps.map((g: any) => g.credentialType);
    expect(gapTypes).not.toContain("safesport"); // valid
    expect(gapTypes).not.toContain("cpr_first_aid"); // expiring, still valid
    expect(gapTypes).toContain("background_check"); // never recorded
    expect(gapTypes).toContain("concussion_protocol");
    expect(json.requiredTypes).toEqual([
      "safesport",
      "background_check",
      "cpr_first_aid",
      "concussion_protocol",
    ]);
    expect(json.expiringSoonDays).toBe(60);
  });

  it("rejects a malformed date → 400", async () => {
    const res = await apiFetch("/api/admin/coaches/credentials", {
      method: "POST",
      cookie: adminACookie,
      body: JSON.stringify({
        userId: orgACoachId,
        credentialType: "safesport",
        status: "valid",
        expiresAt: "not-a-date",
      }),
    });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `./scripts/with-bws.sh npx vitest run --config vitest.config.ts --project api tests/api/admin/coach-credentials.test.ts`
Expected: FAIL — GET/POST return 404 (route missing).

- [ ] **Step 3: Implement the endpoint**

Create `src/pages/api/admin/coaches/credentials/index.ts`:

```typescript
import type { APIRoute } from "astro";
import { and, asc, desc, eq, inArray, isNull, or } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import {
  coachCredentials,
  jobApplications,
  roles,
  userRoles,
  users,
} from "@/lib/db/schema";
import { requireOrgAdminAccess } from "@/lib/auth";
import {
  requireUserInOrg,
  ownershipDeniedResponse,
} from "@/lib/auth/require-resource-ownership";
import {
  REQUIRED_COACH_CREDENTIALS,
  EXPIRING_SOON_DAYS,
  effectiveCredentialStatus,
  requiredCredentialGaps,
} from "@/lib/compliance/coach-credentials";

export const prerender = false;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

/**
 * GET  — compliance grid data: every coach holding an org-scoped `coach`
 *        role in the caller's org, with their credential rows (org rows +
 *        NULL-org globals), effective statuses, required-credential gaps,
 *        and the free-text certifications from their hired application as a
 *        starting reference.
 * POST — admin upsert keyed on (userId, organizationId, credentialType).
 *        status='valid' stamps verifiedByUserId with the acting admin; any
 *        other status clears it.
 */
export const GET: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;
  const db = getDb();

  const coachRows = await db
    .select({
      id: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
    })
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .innerJoin(users, eq(userRoles.userId, users.id))
    .where(
      and(
        eq(roles.name, "coach"),
        eq(userRoles.scopeType, "organization"),
        eq(userRoles.scopeId, auth.organizationId),
      ),
    )
    .orderBy(asc(users.lastName), asc(users.firstName), asc(users.id));

  const seen = new Set<string>();
  const uniqueCoaches = coachRows.filter((c) =>
    seen.has(c.id) ? false : (seen.add(c.id), true),
  );
  const coachIds = uniqueCoaches.map((c) => c.id);

  const credentialRows =
    coachIds.length > 0
      ? await db
          .select()
          .from(coachCredentials)
          .where(
            and(
              inArray(coachCredentials.userId, coachIds),
              or(
                eq(coachCredentials.organizationId, auth.organizationId),
                isNull(coachCredentials.organizationId),
              ),
            ),
          )
      : [];

  const hiredApplications =
    coachIds.length > 0
      ? await db
          .select({
            hiredUserId: jobApplications.hiredUserId,
            certifications: jobApplications.certifications,
          })
          .from(jobApplications)
          .where(
            and(
              eq(jobApplications.organizationId, auth.organizationId),
              inArray(jobApplications.hiredUserId, coachIds),
            ),
          )
          .orderBy(desc(jobApplications.createdAt))
      : [];
  const certsByUser = new Map<string, string>();
  for (const a of hiredApplications) {
    if (a.hiredUserId && a.certifications && !certsByUser.has(a.hiredUserId)) {
      certsByUser.set(a.hiredUserId, a.certifications);
    }
  }

  const now = new Date();
  const coaches = uniqueCoaches.map((c) => {
    const rows = credentialRows.filter((r) => r.userId === c.id);
    return {
      id: c.id,
      firstName: c.firstName,
      lastName: c.lastName,
      email: c.email,
      applicationCertifications: certsByUser.get(c.id) ?? null,
      credentials: rows.map((r) => ({
        id: r.id,
        credentialType: r.credentialType,
        status: r.status,
        effectiveStatus: effectiveCredentialStatus(r, now),
        issuedAt: r.issuedAt,
        expiresAt: r.expiresAt,
        documentKey: r.documentKey,
        notes: r.notes,
        verifiedByUserId: r.verifiedByUserId,
      })),
      gaps: requiredCredentialGaps(rows, now),
    };
  });

  return json(200, {
    coaches,
    requiredTypes: REQUIRED_COACH_CREDENTIALS,
    expiringSoonDays: EXPIRING_SOON_DAYS,
  });
};

// "YYYY-MM-DD" | null | absent → Date | null (UTC midnight, house
// convention: store UTC, display in org timezone).
const dateField = z
  .union([
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
    z.null(),
    z.undefined(),
  ])
  .transform((v) => (v ? new Date(`${v}T00:00:00Z`) : null));

const upsertSchema = z.object({
  userId: z.string().uuid(),
  credentialType: z.enum([
    "safesport",
    "background_check",
    "cpr_first_aid",
    "concussion_protocol",
    "coaching_license",
    "other",
  ]),
  status: z.enum(["pending", "valid", "expired", "rejected"]),
  issuedAt: dateField,
  expiresAt: dateField,
  notes: z.string().max(2000).nullable().optional(),
});

export const POST: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;

  let parsed;
  try {
    parsed = upsertSchema.safeParse(await context.request.json());
  } catch {
    return json(400, { error: "Invalid JSON" });
  }
  if (!parsed.success) {
    return json(400, {
      error: "Validation failed",
      details: parsed.error.flatten().fieldErrors,
    });
  }

  // Tenant pin: the target user must be visible to the caller's org.
  const ownership = await requireUserInOrg(
    auth.organizationId,
    parsed.data.userId,
  );
  if (!ownership.ok) return ownershipDeniedResponse();

  const db = getDb();
  const [existing] = await db
    .select()
    .from(coachCredentials)
    .where(
      and(
        eq(coachCredentials.userId, parsed.data.userId),
        eq(coachCredentials.organizationId, auth.organizationId),
        eq(coachCredentials.credentialType, parsed.data.credentialType),
      ),
    )
    .orderBy(asc(coachCredentials.createdAt))
    .limit(1);

  const values = {
    status: parsed.data.status,
    issuedAt: parsed.data.issuedAt,
    expiresAt: parsed.data.expiresAt,
    notes: parsed.data.notes ?? null,
    verifiedByUserId: parsed.data.status === "valid" ? auth.user.id : null,
  };

  let credential;
  if (existing) {
    [credential] = await db
      .update(coachCredentials)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(coachCredentials.id, existing.id))
      .returning();
  } else {
    [credential] = await db
      .insert(coachCredentials)
      .values({
        userId: parsed.data.userId,
        organizationId: auth.organizationId,
        credentialType: parsed.data.credentialType,
        ...values,
      })
      .returning();
  }

  return json(200, { credential });
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `./scripts/with-bws.sh npx vitest run --config vitest.config.ts --project api tests/api/admin/coach-credentials.test.ts`
Expected: PASS (9 tests).
Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 5: Commit**

```bash
git add src/pages/api/admin/coaches/credentials/index.ts tests/api/admin/coach-credentials.test.ts
git commit -m "feat(compliance): tenant-scoped coach credentials list + upsert/verify API

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: Credential document upload/download (R2 plumbing reuse)

**Files:**
- Create: `src/pages/api/admin/coaches/credentials/[id]/document.ts`
- Test: `tests/api/admin/coach-credential-document.test.ts`

**Interfaces:**
- Consumes: `coachCredentials.documentKey` (Task 1), `putObject` / `getSignedGetUrl` from `@/lib/storage/r2` (mock-aware: `putObject` no-ops and GET returns `https://mock-r2.local/<key>` under `R2_MOCK=1`).
- Produces: `POST /api/admin/coaches/credentials/[id]/document` (multipart field `document`, PDF ≤5MB) → `200 { documentKey }`; `GET` → `302` to a fresh signed URL. Task 8's grid links to the GET.

- [ ] **Step 1: Write the failing API test**

Create `tests/api/admin/coach-credential-document.test.ts`:

```typescript
/**
 * Credential document endpoints — mirrors the careers resume plumbing
 * (upload: public/careers/apply.ts; download: applications/[id]/resume.ts).
 * The dev server runs with R2_MOCK=1, so putObject no-ops and GET redirects
 * to a deterministic mock URL.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { coachCredentials, organizations, users } from "@/lib/db/schema";
import { userOrganizationAccess } from "@/lib/db/schema/organizations";
import { getAdminCookie, apiFetch } from "../setup/test-helpers";

const BASE = process.env.TEST_BASE_URL || "http://localhost:4321";

let adminCookie: string;
let orgAId: string;
let orgBId: string;
let orgACredentialId: string;
let orgBCredentialId: string;

async function createUserInOrg(orgId: string): Promise<string> {
  const db = getDb();
  const [user] = await db
    .insert(users)
    .values({
      email: `cred-doc-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
      firstName: "Doc",
      lastName: "Coach",
      emailVerified: false,
    })
    .returning();
  await db.insert(userOrganizationAccess).values({
    userId: user.id,
    organizationId: orgId,
    role: "staff",
    invitedAt: new Date(),
  });
  return user.id;
}

beforeAll(async () => {
  adminCookie = await getAdminCookie();
  const db = getDb();

  const [orgA] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.slug, "aspire-sports"))
    .orderBy(asc(organizations.createdAt))
    .limit(1);
  const [orgB] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.slug, "orgb"))
    .orderBy(asc(organizations.createdAt))
    .limit(1);
  orgAId = orgA.id;
  orgBId = orgB.id;

  const [credA] = await db
    .insert(coachCredentials)
    .values({
      userId: await createUserInOrg(orgAId),
      organizationId: orgAId,
      credentialType: "background_check",
      status: "pending",
    })
    .returning();
  orgACredentialId = credA.id;

  const [credB] = await db
    .insert(coachCredentials)
    .values({
      userId: await createUserInOrg(orgBId),
      organizationId: orgBId,
      credentialType: "background_check",
      status: "pending",
    })
    .returning();
  orgBCredentialId = credB.id;
});

function pdfForm(): FormData {
  const fd = new FormData();
  fd.append(
    "document",
    new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], "cert.pdf", {
      type: "application/pdf",
    }),
  );
  return fd;
}

describe("credential document endpoints", () => {
  it("POST unauthenticated → 401", async () => {
    const res = await fetch(
      `${BASE}/api/admin/coaches/credentials/${orgACredentialId}/document`,
      { method: "POST", body: pdfForm() },
    );
    expect(res.status).toBe(401);
  });

  it("POST attaches a PDF and stamps documentKey", async () => {
    const res = await fetch(
      `${BASE}/api/admin/coaches/credentials/${orgACredentialId}/document`,
      { method: "POST", body: pdfForm(), headers: { Cookie: adminCookie } },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.documentKey).toMatch(/^compliance\/credentials\/.+\.pdf$/);

    const [row] = await getDb()
      .select()
      .from(coachCredentials)
      .where(eq(coachCredentials.id, orgACredentialId));
    expect(row.documentKey).toBe(body.documentKey);
  });

  it("POST rejects a non-PDF → 400", async () => {
    const fd = new FormData();
    fd.append(
      "document",
      new File([new Uint8Array([1, 2, 3])], "cert.exe", {
        type: "application/octet-stream",
      }),
    );
    const res = await fetch(
      `${BASE}/api/admin/coaches/credentials/${orgACredentialId}/document`,
      { method: "POST", body: fd, headers: { Cookie: adminCookie } },
    );
    expect(res.status).toBe(400);
  });

  it("GET 302-redirects to a signed (mock) URL", async () => {
    const res = await fetch(
      `${BASE}/api/admin/coaches/credentials/${orgACredentialId}/document`,
      { headers: { Cookie: adminCookie }, redirect: "manual" },
    );
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("mock-r2.local");
  });

  it("cross-org credential id → 404 on both verbs", async () => {
    const post = await fetch(
      `${BASE}/api/admin/coaches/credentials/${orgBCredentialId}/document`,
      { method: "POST", body: pdfForm(), headers: { Cookie: adminCookie } },
    );
    expect(post.status).toBe(404);
    const get = await apiFetch(
      `/api/admin/coaches/credentials/${orgBCredentialId}/document`,
      { cookie: adminCookie, redirect: "manual" },
    );
    expect(get.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `./scripts/with-bws.sh npx vitest run --config vitest.config.ts --project api tests/api/admin/coach-credential-document.test.ts`
Expected: FAIL — route missing (404s where 200/302/400 expected; note the cross-org test may coincidentally pass).

- [ ] **Step 3: Implement the endpoint**

Create `src/pages/api/admin/coaches/credentials/[id]/document.ts`:

```typescript
import type { APIRoute } from "astro";
import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { coachCredentials } from "@/lib/db/schema";
import { requireOrgAdminAccess } from "@/lib/auth";
import { putObject, getSignedGetUrl } from "@/lib/storage/r2";

export const prerender = false;

const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

async function loadOrgCredential(orgId: string, id: string) {
  const [row] = await getDb()
    .select()
    .from(coachCredentials)
    .where(
      and(
        eq(coachCredentials.id, id),
        eq(coachCredentials.organizationId, orgId),
      ),
    )
    .orderBy(asc(coachCredentials.createdAt))
    .limit(1);
  return row ?? null;
}

/**
 * POST — attach a PDF (≤5MB) to a credential. Same plumbing as the careers
 * resume upload: server-side put to R2, the object KEY is stored (signed
 * URLs expire), the GET below redirects to a fresh one.
 */
export const POST: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;

  const id = context.params.id;
  if (!id) return json(400, { error: "id required" });

  const credential = await loadOrgCredential(auth.organizationId, id);
  if (!credential) return json(404, { error: "Resource not found" });

  let form: FormData;
  try {
    form = await context.request.formData();
  } catch {
    return json(400, { error: "Expected multipart form data" });
  }

  const document = form.get("document");
  if (!(document instanceof File) || document.size === 0) {
    return json(400, { error: "document file is required" });
  }
  if (
    document.type !== "application/pdf" ||
    !document.name.toLowerCase().endsWith(".pdf")
  ) {
    return json(400, { error: "Document must be a PDF" });
  }
  if (document.size > MAX_DOCUMENT_BYTES) {
    return json(400, { error: "Document must be 5 MB or smaller" });
  }

  const documentKey = `compliance/credentials/${randomUUID()}.pdf`;
  try {
    await putObject(
      documentKey,
      new Uint8Array(await document.arrayBuffer()),
      "application/pdf",
    );
  } catch (err) {
    console.error("[coach-credentials] document upload failed", err);
    return json(502, { error: "Could not store the document" });
  }

  await getDb()
    .update(coachCredentials)
    .set({ documentKey, updatedAt: new Date() })
    .where(eq(coachCredentials.id, credential.id));

  return json(200, { documentKey });
};

/**
 * GET — 302 to a fresh signed R2 URL for the credential's document
 * (mirrors applications/[id]/resume.ts, including the R2_MOCK contract).
 */
export const GET: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;

  const id = context.params.id;
  if (!id) return json(400, { error: "id required" });

  const credential = await loadOrgCredential(auth.organizationId, id);
  if (!credential) return json(404, { error: "Resource not found" });
  if (!credential.documentKey) {
    return json(404, { error: "No document on this credential" });
  }

  if (process.env.R2_MOCK === "1") {
    return context.redirect(
      `https://mock-r2.local/${credential.documentKey}`,
      302,
    );
  }
  const url = await getSignedGetUrl(credential.documentKey);
  return context.redirect(url, 302);
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `./scripts/with-bws.sh npx vitest run --config vitest.config.ts --project api tests/api/admin/coach-credential-document.test.ts`
Expected: PASS (5 tests). Requires the dev server started with `R2_MOCK=1`.
Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 5: Commit**

```bash
git add "src/pages/api/admin/coaches/credentials/[id]/document.ts" tests/api/admin/coach-credential-document.test.ts
git commit -m "feat(compliance): credential PDF upload/download via R2 (resume plumbing reuse)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: `/admin/coaches` compliance grid page + nav

**Files:**
- Create: `src/components/admin/coach-credentials-grid.tsx`
- Create: `src/pages/admin/coaches.astro`
- Modify: `src/lib/admin/nav-super-admin.ts`, `src/lib/admin/nav-venue-manager.ts`

**Interfaces:**
- Consumes: `GET /api/admin/coaches/credentials` response shape and `POST` body (Task 6); `GET .../[id]/document` link (Task 7); UI primitives from `@/components/ui/*`.
- Produces: UI only. `/admin/coaches` is SSR by default (no `prerender` flag — it is middleware-protected admin surface). Not in `SUPER_ADMIN_ONLY_PREFIXES`, so both super-admins and venue managers (org admins) can use it — matching the endpoint's `requireOrgAdminAccess` gate.

Verification cycle: `tsc` here, `npm run build` in Task 10 (house pattern for admin list components — no React unit harness; E2E runs post-merge only, and no new E2E spec is added).

- [ ] **Step 1: Create the grid component**

Create `src/components/admin/coach-credentials-grid.tsx`:

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorBanner } from "@/components/ui/error-banner";
import { LoadingSkeleton } from "@/components/ui/loading-skeleton";

const CREDENTIAL_TYPES = [
  "safesport",
  "background_check",
  "cpr_first_aid",
  "concussion_protocol",
  "coaching_license",
  "other",
] as const;
type CredentialType = (typeof CREDENTIAL_TYPES)[number];

const TYPE_LABELS: Record<CredentialType, string> = {
  safesport: "SafeSport",
  background_check: "Background check",
  cpr_first_aid: "CPR / First aid",
  concussion_protocol: "Concussion",
  coaching_license: "License",
  other: "Other",
};

type StoredStatus = "pending" | "valid" | "expired" | "rejected";
type EffectiveStatus =
  | "missing"
  | "pending"
  | "valid"
  | "expiring_soon"
  | "expired"
  | "rejected";

interface CredentialCell {
  id: string;
  credentialType: CredentialType;
  status: StoredStatus;
  effectiveStatus: EffectiveStatus;
  issuedAt: string | null;
  expiresAt: string | null;
  documentKey: string | null;
  notes: string | null;
}

interface CoachRow {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  applicationCertifications: string | null;
  credentials: CredentialCell[];
  gaps: { credentialType: string; reason: string }[];
}

const STATUS_STYLES: Record<EffectiveStatus, string> = {
  valid: "bg-green-100 text-green-800",
  expiring_soon: "bg-amber-100 text-amber-800",
  pending: "bg-yellow-50 text-yellow-700",
  expired: "bg-red-100 text-red-800",
  rejected: "bg-red-100 text-red-800",
  missing: "bg-gray-100 text-gray-500",
};

const STATUS_LABELS: Record<EffectiveStatus, string> = {
  valid: "Valid",
  expiring_soon: "Expiring",
  pending: "Pending",
  expired: "Expired",
  rejected: "Rejected",
  missing: "—",
};

interface EditState {
  coach: CoachRow;
  credentialType: CredentialType;
  existing: CredentialCell | null;
  status: StoredStatus;
  issuedAt: string; // "YYYY-MM-DD" or ""
  expiresAt: string;
  notes: string;
}

export default function CoachCredentialsGrid() {
  const [coaches, setCoaches] = useState<CoachRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [edit, setEdit] = useState<EditState | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/coaches/credentials");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setCoaches((await res.json()).coaches);
      setError(null);
    } catch {
      setError("Could not load coach credentials.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function openEditor(coach: CoachRow, credentialType: CredentialType) {
    const existing =
      coach.credentials.find((c) => c.credentialType === credentialType) ??
      null;
    setEdit({
      coach,
      credentialType,
      existing,
      status: existing?.status ?? "pending",
      issuedAt: existing?.issuedAt ? existing.issuedAt.slice(0, 10) : "",
      expiresAt: existing?.expiresAt ? existing.expiresAt.slice(0, 10) : "",
      notes: existing?.notes ?? "",
    });
  }

  async function save() {
    if (!edit) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/coaches/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: edit.coach.id,
          credentialType: edit.credentialType,
          status: edit.status,
          issuedAt: edit.issuedAt || null,
          expiresAt: edit.expiresAt || null,
          notes: edit.notes || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      toast.success(`${TYPE_LABELS[edit.credentialType]} updated.`);
      setEdit(null);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  if (error) return <ErrorBanner message={error} />;
  if (!coaches) return <LoadingSkeleton />;
  if (coaches.length === 0)
    return (
      <EmptyState
        title="No coaches yet"
        description="Coaches appear here once they hold an organization coach role — mark an application hired, or invite one from Users & staff."
      />
    );

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b border-border">
              <th className="py-2 pr-4">Coach</th>
              {CREDENTIAL_TYPES.map((t) => (
                <th key={t} className="py-2 pr-4 whitespace-nowrap">
                  {TYPE_LABELS[t]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {coaches.map((coach) => (
              <tr key={coach.id} className="border-b border-border/50 align-top">
                <td className="py-2 pr-4">
                  <div className="font-medium">
                    {coach.firstName || coach.lastName
                      ? `${coach.firstName ?? ""} ${coach.lastName ?? ""}`.trim()
                      : coach.email}
                  </div>
                  <div className="text-xs text-gray-500">{coach.email}</div>
                  {coach.applicationCertifications ? (
                    <div
                      className="mt-1 max-w-[16rem] text-xs text-gray-500"
                      title={coach.applicationCertifications}
                    >
                      From application:{" "}
                      {coach.applicationCertifications.slice(0, 80)}
                      {coach.applicationCertifications.length > 80 ? "…" : ""}
                    </div>
                  ) : null}
                </td>
                {CREDENTIAL_TYPES.map((t) => {
                  const cred =
                    coach.credentials.find((c) => c.credentialType === t) ??
                    null;
                  const eff: EffectiveStatus =
                    cred?.effectiveStatus ?? "missing";
                  return (
                    <td key={t} className="py-2 pr-4">
                      <button
                        type="button"
                        onClick={() => openEditor(coach, t)}
                        className={`rounded px-2 py-1 text-xs font-medium ${STATUS_STYLES[eff]}`}
                        title={
                          cred?.expiresAt
                            ? `Expires ${new Date(cred.expiresAt).toLocaleDateString()}`
                            : "Click to record"
                        }
                      >
                        {STATUS_LABELS[eff]}
                        {eff === "expiring_soon" && cred?.expiresAt
                          ? ` ${new Date(cred.expiresAt).toLocaleDateString()}`
                          : ""}
                      </button>
                      {cred?.documentKey ? (
                        <a
                          className="ml-1 text-xs underline"
                          href={`/api/admin/coaches/credentials/${cred.id}/document`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          PDF
                        </a>
                      ) : null}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-500">
        Required for every coach: SafeSport, background check, CPR/first aid,
        concussion protocol. Amber = valid but expires within 60 days.
      </p>

      <Dialog
        open={edit !== null}
        onOpenChange={(open) => {
          if (!open) setEdit(null);
        }}
      >
        <DialogContent>
          {edit ? (
            <>
              <DialogHeader>
                <DialogTitle>
                  {TYPE_LABELS[edit.credentialType]} —{" "}
                  {edit.coach.firstName || edit.coach.lastName
                    ? `${edit.coach.firstName ?? ""} ${edit.coach.lastName ?? ""}`.trim()
                    : edit.coach.email}
                </DialogTitle>
                <DialogDescription>
                  Setting status to Valid records you as the verifier.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="cred-status">Status</Label>
                  <Select
                    value={edit.status}
                    onValueChange={(value) =>
                      setEdit((prev) =>
                        prev
                          ? { ...prev, status: value as StoredStatus }
                          : prev,
                      )
                    }
                  >
                    <SelectTrigger id="cred-status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="valid">Valid (verified)</SelectItem>
                      <SelectItem value="expired">Expired</SelectItem>
                      <SelectItem value="rejected">Rejected</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="cred-issued">Issued</Label>
                    <Input
                      id="cred-issued"
                      type="date"
                      value={edit.issuedAt}
                      onChange={(e) =>
                        setEdit((prev) =>
                          prev ? { ...prev, issuedAt: e.target.value } : prev,
                        )
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="cred-expires">Expires</Label>
                    <Input
                      id="cred-expires"
                      type="date"
                      value={edit.expiresAt}
                      onChange={(e) =>
                        setEdit((prev) =>
                          prev ? { ...prev, expiresAt: e.target.value } : prev,
                        )
                      }
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cred-notes">Notes</Label>
                  <Textarea
                    id="cred-notes"
                    value={edit.notes}
                    onChange={(e) =>
                      setEdit((prev) =>
                        prev ? { ...prev, notes: e.target.value } : prev,
                      )
                    }
                    placeholder="Provider, reference number, follow-ups…"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setEdit(null)}>
                  Cancel
                </Button>
                <Button onClick={() => void save()} disabled={saving}>
                  {saving ? "Saving…" : "Save"}
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
```

- [ ] **Step 2: Create the page**

Create `src/pages/admin/coaches.astro` (mirrors `applications.astro`; SSR — no prerender flag):

```astro
---
import BaseLayout from '../../layouts/BaseLayout.astro';
import { AdminLayout } from '../../components/admin/admin-layout';
import { getPrimaryRoleName } from "@/lib/auth";
import CoachCredentialsGrid from '../../components/admin/coach-credentials-grid';

// Middleware guarantees user is an admin for /admin routes.
const user = Astro.locals.user!;
const primaryRole = getPrimaryRoleName(Astro.locals.userRoles);
---

<BaseLayout title="Coach compliance — Aspire Sports Admin" navigation={false} footer={false}>
  <AdminLayout
    client:load
    role={primaryRole}
    currentPath="/admin/coaches"
    user={{ firstName: user.firstName, lastName: user.lastName, email: user.email }}
  >
    <div class="space-y-6">
      <div>
        <h1 class="text-3xl font-bold text-gray-900">Coach compliance</h1>
        <p class="text-gray-600 mt-1">Credential status for every coach — SafeSport, background check, CPR/first aid, and concussion protocol are required before floor time.</p>
      </div>

      <CoachCredentialsGrid client:load />
    </div>
  </AdminLayout>
</BaseLayout>
```

- [ ] **Step 3: Add nav entries**

In `src/lib/admin/nav-super-admin.ts`, in the `People` section, after the line `{ name: "Applications", href: "/admin/applications", icon: FileText },` add:

```typescript
      { name: "Coach compliance", href: "/admin/coaches", icon: ShieldCheck },
```

(`ShieldCheck` is already imported in that file.)

In `src/lib/admin/nav-venue-manager.ts`, in its `People` section, after `{ name: "Applications", href: "/admin/applications", icon: FileText },` add:

```typescript
      { name: "Coach compliance", href: "/admin/coaches", icon: ShieldCheck },
```

and add `ShieldCheck` to that file's `lucide-react` import list if it is not already there.

- [ ] **Step 4: Type check**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 5: Manual smoke check (dev server running)**

Sign in as `admin@test.aspiresports.com` / `TestAdmin123!` at `http://localhost:4321/signin`, open `http://localhost:4321/admin/coaches`.
Expected: the grid renders (coaches created by earlier test runs appear); clicking a cell opens the editor; saving updates the badge.

- [ ] **Step 6: Commit**

```bash
git add src/components/admin/coach-credentials-grid.tsx src/pages/admin/coaches.astro src/lib/admin/nav-super-admin.ts src/lib/admin/nav-venue-manager.ts
git commit -m "feat(admin): /admin/coaches compliance grid

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 9: Soft, non-blocking warning on team coach assignment

**Files:**
- Create: `src/lib/compliance/coach-credential-gaps.ts`
- Modify: `src/pages/api/admin/teams.ts` (POST and PUT responses — this is where `teams.coachUserId` / `assistantCoachUserId` are written; the UI writer is `src/components/admin/teams-list.tsx`)
- Modify: `src/components/admin/teams-list.tsx`
- Test: `tests/api/admin/team-compliance-warning.test.ts`

**Interfaces:**
- Consumes: `requiredCredentialGaps`, `CredentialGap` (Task 1); `coachCredentials`; existing teams endpoint behavior.
- Produces: `getCoachCredentialGapWarnings(organizationId: string, userIds: string[]): Promise<CoachComplianceWarning[]>` where `CoachComplianceWarning = { userId: string; coachName: string; gaps: CredentialGap[] }`; teams POST → `201 { team, complianceWarnings }`, PUT → `200 { team, complianceWarnings }`. Additive response field — existing consumers (`teams-list.tsx`, `tests/e2e/seasons-scaffold.spec.ts`) read `data.team`/`data.teams` and are unaffected.

- [ ] **Step 1: Write the failing API test**

Create `tests/api/admin/team-compliance-warning.test.ts`:

```typescript
/**
 * Soft compliance gate: assigning a coach to a team returns non-blocking
 * warnings for missing/expired REQUIRED credentials. The write always
 * succeeds — blocking is a later program decision.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { organizations, users } from "@/lib/db/schema";
import { userOrganizationAccess } from "@/lib/db/schema/organizations";
import { getAdminCookie, apiFetch, expectJson } from "../setup/test-helpers";

let adminCookie: string;
let orgAId: string;
let seasonId: string;
let coachUserId: string; // fresh user, zero credentials
let teamId: string;

beforeAll(async () => {
  adminCookie = await getAdminCookie();
  const db = getDb();

  const [orgA] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.slug, "aspire-sports"))
    .orderBy(asc(organizations.createdAt))
    .limit(1);
  orgAId = orgA.id;

  const seasonsJson = await expectJson(
    await apiFetch("/api/admin/seasons?include_test=1", {
      cookie: adminCookie,
    }),
    200,
  );
  expect((seasonsJson.seasons as any[]).length).toBeGreaterThan(0);
  seasonId = seasonsJson.seasons[0].id;

  const [user] = await db
    .insert(users)
    .values({
      email: `team-warn-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
      firstName: "Uncleared",
      lastName: "Coach",
      emailVerified: false,
    })
    .returning();
  coachUserId = user.id;
  await db.insert(userOrganizationAccess).values({
    userId: coachUserId,
    organizationId: orgAId,
    role: "staff",
    invitedAt: new Date(),
  });
});

describe("team coach assignment compliance warnings", () => {
  it("POST with an uncleared coach → 201 (non-blocking) + all four gaps", async () => {
    const json = await expectJson(
      await apiFetch("/api/admin/teams", {
        method: "POST",
        cookie: adminCookie,
        body: JSON.stringify({
          seasonId,
          name: `Compliance Warn Team ${Date.now()}`,
          coachUserId,
        }),
      }),
      201,
    );
    teamId = json.team.id;
    expect(json.complianceWarnings).toHaveLength(1);
    expect(json.complianceWarnings[0].userId).toBe(coachUserId);
    expect(json.complianceWarnings[0].coachName).toBe("Uncleared Coach");
    expect(
      json.complianceWarnings[0].gaps.map((g: any) => g.credentialType),
    ).toEqual([
      "safesport",
      "background_check",
      "cpr_first_aid",
      "concussion_protocol",
    ]);
  });

  it("a valid credential shrinks the gap list on PUT", async () => {
    await expectJson(
      await apiFetch("/api/admin/coaches/credentials", {
        method: "POST",
        cookie: adminCookie,
        body: JSON.stringify({
          userId: coachUserId,
          credentialType: "safesport",
          status: "valid",
          expiresAt: "2030-01-01",
        }),
      }),
      200,
    );

    const json = await expectJson(
      await apiFetch("/api/admin/teams", {
        method: "PUT",
        cookie: adminCookie,
        body: JSON.stringify({
          id: teamId,
          seasonId,
          name: `Compliance Warn Team Updated ${Date.now()}`,
          coachUserId,
        }),
      }),
      200,
    );
    const gaps = json.complianceWarnings[0].gaps.map(
      (g: any) => g.credentialType,
    );
    expect(gaps).not.toContain("safesport");
    expect(gaps).toHaveLength(3);
  });

  it("no coach assigned → empty warnings array", async () => {
    const json = await expectJson(
      await apiFetch("/api/admin/teams", {
        method: "PUT",
        cookie: adminCookie,
        body: JSON.stringify({
          id: teamId,
          seasonId,
          name: `Compliance Warn Team NoCoach ${Date.now()}`,
          coachUserId: null,
        }),
      }),
      200,
    );
    expect(json.complianceWarnings).toEqual([]);
  });

  it("cleanup: delete the test team", async () => {
    const res = await apiFetch(`/api/admin/teams?id=${teamId}`, {
      method: "DELETE",
      cookie: adminCookie,
    });
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `./scripts/with-bws.sh npx vitest run --config vitest.config.ts --project api tests/api/admin/team-compliance-warning.test.ts`
Expected: FAIL — `json.complianceWarnings` is `undefined` (endpoint doesn't emit it yet).

- [ ] **Step 3: Create the warnings helper**

Create `src/lib/compliance/coach-credential-gaps.ts`:

```typescript
import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { coachCredentials, users } from "@/lib/db/schema";
import {
  requiredCredentialGaps,
  type CredentialGap,
} from "./coach-credentials";

export interface CoachComplianceWarning {
  userId: string;
  coachName: string;
  gaps: CredentialGap[];
}

/**
 * Soft-gate helper for team coach assignment: one warning per assigned coach
 * missing (or expired on) any REQUIRED credential. Non-blocking by design —
 * callers attach the result to a successful response, never turn it into a
 * 4xx (Phase 1 decision: don't strand ops during rollout).
 *
 * Credential visibility matches the grid: org-scoped rows plus NULL-org
 * globals.
 */
export async function getCoachCredentialGapWarnings(
  organizationId: string,
  userIds: string[],
): Promise<CoachComplianceWarning[]> {
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return [];
  const db = getDb();

  const userRows = await db
    .select({
      id: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
    })
    .from(users)
    .where(inArray(users.id, ids));

  const credRows = await db
    .select()
    .from(coachCredentials)
    .where(
      and(
        inArray(coachCredentials.userId, ids),
        or(
          eq(coachCredentials.organizationId, organizationId),
          isNull(coachCredentials.organizationId),
        ),
      ),
    );

  const now = new Date();
  return userRows
    .map((u) => ({
      userId: u.id,
      coachName:
        `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || "This coach",
      gaps: requiredCredentialGaps(
        credRows.filter((r) => r.userId === u.id),
        now,
      ),
    }))
    .filter((w) => w.gaps.length > 0);
}
```

- [ ] **Step 4: Attach warnings to the teams endpoint**

In `src/pages/api/admin/teams.ts`, add to the imports block at the top:

```typescript
import { getCoachCredentialGapWarnings } from "@/lib/compliance/coach-credential-gaps";
```

In the **POST** handler, replace:

```typescript
    return new Response(JSON.stringify({ team: newTeam }), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
```

with:

```typescript
    // Soft compliance gate: warn (never block) when an assigned coach is
    // missing required credentials.
    const complianceWarnings = await getCoachCredentialGapWarnings(
      orgContext.organizationId,
      [newTeam.coachUserId, newTeam.assistantCoachUserId].filter(
        (v): v is string => Boolean(v),
      ),
    );

    return new Response(
      JSON.stringify({ team: newTeam, complianceWarnings }),
      {
        status: 201,
        headers: { "Content-Type": "application/json" },
      },
    );
```

In the **PUT** handler, replace:

```typescript
    return new Response(JSON.stringify({ team: updatedTeam }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
```

with:

```typescript
    // Soft compliance gate — same contract as POST.
    const complianceWarnings = await getCoachCredentialGapWarnings(
      orgContext.organizationId,
      [updatedTeam.coachUserId, updatedTeam.assistantCoachUserId].filter(
        (v): v is string => Boolean(v),
      ),
    );

    return new Response(
      JSON.stringify({ team: updatedTeam, complianceWarnings }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
```

- [ ] **Step 5: Surface the warning in the teams UI**

In `src/components/admin/teams-list.tsx`, inside `handleSubmit`, replace:

```tsx
      if (!response.ok) {
        throw new Error(data.error || "Failed to save team")
      }

      await fetchTeams()
      setIsDialogOpen(false)
```

with:

```tsx
      if (!response.ok) {
        throw new Error(data.error || "Failed to save team")
      }

      // Non-blocking compliance warning: the save succeeded; the assigned
      // coach is missing required credentials (see /admin/coaches).
      if (
        Array.isArray(data.complianceWarnings) &&
        data.complianceWarnings.length > 0
      ) {
        for (const warning of data.complianceWarnings) {
          const missing = warning.gaps
            .map((g: { credentialType: string }) =>
              g.credentialType.replace(/_/g, " "),
            )
            .join(", ")
          toast.warning(
            `${warning.coachName} is missing required credentials: ${missing}. Review at /admin/coaches.`,
            { duration: 8000 },
          )
        }
      }

      await fetchTeams()
      setIsDialogOpen(false)
```

(`toast` is already imported from `sonner` in this file.)

- [ ] **Step 6: Run the test to verify it passes**

Run: `./scripts/with-bws.sh npx vitest run --config vitest.config.ts --project api tests/api/admin/team-compliance-warning.test.ts`
Expected: PASS (4 tests).
Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/compliance/coach-credential-gaps.ts src/pages/api/admin/teams.ts src/components/admin/teams-list.tsx tests/api/admin/team-compliance-warning.test.ts
git commit -m "feat(compliance): non-blocking credential warning on team coach assignment

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 10: Full verification sweep

**Files:** none created — verification only.

- [ ] **Step 1: Re-seed and run the whole API + unit suites**

```bash
./scripts/with-bws.sh npm run db:seed:e2e
./scripts/with-bws.sh npm run test:api
./scripts/with-bws.sh npm run test:unit
```

Expected: all green. Known triage note: per project memory, 2 API failures can be pre-existing staging data-state — triage any failure by whether its file overlaps this branch's changes before assuming regression.

- [ ] **Step 2: Build + type check**

```bash
npm run build
npx tsc --noEmit
```

Expected: build succeeds (`/admin/coaches` is SSR — it must NOT appear in the prerendered-routes output); tsc reports zero errors.

- [ ] **Step 3: E2E surface sweep (post-merge specs don't gate the PR)**

```bash
grep -rn "admin/teams\|admin/applications\|admin/coaches\|/coach" tests/e2e/ --include="*.spec.ts" -l
```

Expected hits include `tests/e2e/admin-dashboard.spec.ts` (visits `/admin/teams`) and `tests/e2e/seasons-scaffold.spec.ts` (calls `/api/admin/teams`). Open each hit and confirm compatibility: this branch's teams changes are **additive** (a new `complianceWarnings` response field and a toast) — existing assertions on `data.team` / `data.teams` and page content still hold. Also grep for coach-surface specs (the middleware change only widens `/coach` access). If any spec asserts an exact response shape or exact `/admin/teams` DOM this branch changed, update the spec in this branch; otherwise record "no e2e changes needed" in the PR description. Optionally run the affected specs locally: `PLAYWRIGHT_BASE_URL=http://localhost:4321 npm test -- admin-dashboard`.

- [ ] **Step 4: Acceptance checklist against the spec**

Confirm each Phase 1 acceptance criterion maps to a passing artifact:
- Admin marks an application hired and the applicant receives a working invite landing in `/coach` with a coach role → `tests/api/admin/applications-hire.test.ts` (magic link + role + `redirectTo: "/coach"`) + middleware fix.
- Compliance grid shows every coach's credential state → `/admin/coaches` + `tests/api/admin/coach-credentials.test.ts` list assertions.
- Team assignment to an uncleared coach shows the warning → `tests/api/admin/team-compliance-warning.test.ts` + teams-list toast.
- Tenant isolation (org A admin cannot read org B credentials) → `tests/api/admin/coach-credentials.test.ts` isolation describe block.
- `tests/api/` green → Step 1.

- [ ] **Step 5: Commit any spec updates from Step 3**

```bash
git add tests/e2e
git commit -m "test(e2e): align specs with additive teams response field" || echo "nothing to commit"
```

Then hand off per the repo release flow: `/ship` (or the full pre-push checklist — this branch carries schema changes) → PR → after merge, watch the post-merge `test-full` job.
