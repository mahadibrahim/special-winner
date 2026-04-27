# Unified People Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow adults to register themselves for programs while preserving the parent-registers-child flow, by evolving `family_members` into a People primitive (dependent-or-self).

**Architecture:** Add a nullable `self_user_id` column to `family_members` and make `parent_user_id` nullable. Enforce exactly-one-of via CHECK constraint. Update the registration wizard's Step 1 from "Select a child" to "Who are you registering?" with self listed alongside dependents. Branch waiver copy by self-vs-dependent. No splash page, no subdomain split — single product surface; programs filter by age.

**Tech Stack:** Astro 5, React 19, Drizzle/Postgres, Lucia auth, Stripe Checkout, Tailwind 4, Vitest (API tests), Playwright (E2E).

---

## Pre-flight (read once before starting)

- Worktree: `/Users/mahadibrahim/Documents/Coding/aspire-sports-people-model` on branch `feat/unified-people-model`. Cut from `main` at commit `6a8df59`.
- Dev server: must be running for API tests. Start with `R2_MOCK=1 NETLIFY_DEV=1 npm run dev` in one terminal.
- Test seed: `npm run db:seed:e2e` (idempotent; re-run if test data drifts).
- Pre-commit hooks: do NOT skip with `--no-verify`.
- CI policy reminder: pushes to main run `build` only. Run `gh workflow run CI` on this branch before merging to get full test signal.

## File Structure

**New files:**
- `src/lib/db/migrations/NNNN_unified_people_model.sql` — schema migration
- `src/lib/registrations/resolve-person.ts` — shared "find-or-create person (self or dependent)" helper
- `tests/api/registrations-self.spec.ts` — adult self-registration API tests
- `tests/registration-adult.spec.ts` — Playwright E2E for adult self path
- `src/components/registration/who-step.tsx` — Step 1 "Who are you registering?" component (extracted from wizard)
- `src/components/marketing/dual-cta-hero.tsx` — homepage hero with dual CTAs

**Modified files:**
- `src/lib/db/schema/registrations.ts` — add `selfUserId`, nullable `parentUserId`, type updates
- `src/lib/registrations/create-registration.ts` — accept person regardless of self/dependent
- `src/pages/api/registrations/index.ts` — POST accepts self path
- `src/pages/api/registrations/guest-checkout.ts` — adult guest path
- `src/pages/api/admin/walk-up-registration.ts` — adult walk-up
- `src/components/registration/registration-wizard.tsx` — wire new Step 1, branch waiver copy
- `src/components/admin/walk-up-registration-form.tsx` — adult mode toggle
- `src/pages/index.astro` — dual CTA hero replaces existing
- `src/pages/programs/index.astro` (or equivalent) — age filter UI
- `src/pages/dashboard/index.astro` — "Players" tab includes self
- `CLAUDE.md` — add a "People model" section under conventions

---

## Phase 1 — Schema

### Task 1.1: Update Drizzle schema definitions

**Files:**
- Modify: `src/lib/db/schema/registrations.ts`

- [ ] **Step 1: Open the schema and locate `familyMembers` (lines 46–83)**

The current shape requires `parentUserId.notNull()`. We need to make it nullable and add a sibling `selfUserId` column.

- [ ] **Step 2: Edit `familyMembers` table definition**

Replace the `parentUserId` line and add `selfUserId` immediately after. Final shape:

```typescript
export const familyMembers = pgTable(
  "family_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Exactly one of parentUserId or selfUserId is non-null. Enforced by
    // a DB CHECK constraint added in the migration. parentUserId means
    // "this person is a dependent of that user" (youth/COPPA path).
    // selfUserId means "this person IS that user" (adult self path).
    parentUserId: uuid("parent_user_id").references(() => users.id, {
      onDelete: "cascade",
    }),
    selfUserId: uuid("self_user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .unique(),
    firstName: varchar("first_name", { length: 100 }).notNull(),
    // ... rest unchanged
```

Keep all other columns identical. Add a new index for `selfUserId`:

```typescript
  (table) => [
    index("family_members_parent_user_idx").on(table.parentUserId),
    index("family_members_self_user_idx").on(table.selfUserId),
  ],
```

- [ ] **Step 3: Update relations block (lines 158–164)**

```typescript
export const familyMembersRelations = relations(familyMembers, ({ one, many }) => ({
  parent: one(users, {
    fields: [familyMembers.parentUserId],
    references: [users.id],
    relationName: "parent_of",
  }),
  self: one(users, {
    fields: [familyMembers.selfUserId],
    references: [users.id],
    relationName: "self_of",
  }),
  registrations: many(registrations),
}));
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/db/schema/registrations.ts
git commit -m "schema: add self_user_id to family_members, nullable parent_user_id"
```

---

### Task 1.2: Generate the migration

**Files:**
- Create: `src/lib/db/migrations/NNNN_unified_people_model.sql` (drizzle-kit picks the number)

- [ ] **Step 1: Run drizzle-kit generate**

```bash
npm run db:generate
```

Expected: a new `NNNN_*.sql` file appears under `src/lib/db/migrations/` containing `ALTER TABLE family_members` statements.

- [ ] **Step 2: Open the generated migration and append the CHECK constraint**

Drizzle-kit will not generate the exactly-one-of CHECK on its own. After the auto-generated content, append:

```sql
ALTER TABLE "family_members"
ADD CONSTRAINT "family_members_self_xor_parent"
CHECK (
  (parent_user_id IS NOT NULL AND self_user_id IS NULL)
  OR
  (parent_user_id IS NULL AND self_user_id IS NOT NULL)
);
```

If drizzle-kit emits a journal file (`meta/_journal.json`), commit it alongside.

- [ ] **Step 3: Apply migration locally**

```bash
npm run db:migrate
```

Expected: migration applies cleanly. If it fails because existing rows would violate the constraint, that's impossible (every row currently has `parent_user_id NOT NULL` and `self_user_id` doesn't exist yet) — investigate before bypassing.

- [ ] **Step 4: Verify constraint**

```bash
psql "$DATABASE_URL" -c "\d family_members" | grep -A2 "Check constraints"
```

Expected: `family_members_self_xor_parent` listed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/migrations/
git commit -m "migration: family_members self_user_id + xor check constraint"
```

---

### Task 1.3: Schema-level smoke test

**Files:**
- Create: `tests/api/schema-self-person.spec.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, beforeAll } from "vitest";
import { getDb } from "@/lib/db";
import { familyMembers, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

describe("family_members self/dependent constraint", () => {
  it("rejects rows with both parent_user_id and self_user_id set", async () => {
    const db = getDb();
    const [u] = await db.select().from(users).limit(1);
    expect(u).toBeDefined();

    await expect(
      db.insert(familyMembers).values({
        parentUserId: u.id,
        selfUserId: u.id,
        firstName: "Bad",
        lastName: "Row",
        birthDate: "1990-01-01",
      }),
    ).rejects.toThrow(/family_members_self_xor_parent/);
  });

  it("rejects rows with neither parent_user_id nor self_user_id set", async () => {
    const db = getDb();
    await expect(
      db.insert(familyMembers).values({
        firstName: "Orphan",
        lastName: "Row",
        birthDate: "1990-01-01",
      } as any),
    ).rejects.toThrow(/family_members_self_xor_parent/);
  });

  it("accepts a self-only row", async () => {
    const db = getDb();
    const [u] = await db.select().from(users).limit(1);
    const [row] = await db
      .insert(familyMembers)
      .values({
        selfUserId: u.id,
        firstName: u.firstName ?? "Test",
        lastName: u.lastName ?? "Self",
        birthDate: "1990-01-01",
      })
      .returning();
    expect(row.selfUserId).toBe(u.id);
    expect(row.parentUserId).toBeNull();
    // cleanup
    await getDb().delete(familyMembers).where(eq(familyMembers.id, row.id));
  });
});
```

- [ ] **Step 2: Run test**

```bash
TEST_BASE_URL=http://localhost:4321 npm run test:api -- tests/api/schema-self-person.spec.ts
```

Expected: all three tests pass (the DB CHECK constraint exists from Task 1.2).

- [ ] **Step 3: Commit**

```bash
git add tests/api/schema-self-person.spec.ts
git commit -m "test: family_members xor constraint smoke tests"
```

---

## Phase 2 — Backend: helpers and APIs

### Task 2.1: Add `resolvePerson` helper

**Files:**
- Create: `src/lib/registrations/resolve-person.ts`
- Test: `tests/api/resolve-person.spec.ts`

This helper centralizes "find-or-create the person record this registration points to," whether self or dependent. Both `/api/registrations` and `/api/registrations/guest-checkout` and `/api/admin/walk-up-registration` will use it.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from "vitest";
import { getDb } from "@/lib/db";
import { familyMembers, users } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { resolvePerson } from "@/lib/registrations/resolve-person";

describe("resolvePerson", () => {
  it("returns existing self row if one exists for the user", async () => {
    const db = getDb();
    const [u] = await db.select().from(users).limit(1);
    const existing = await db
      .insert(familyMembers)
      .values({
        selfUserId: u.id,
        firstName: u.firstName ?? "T",
        lastName: u.lastName ?? "U",
        birthDate: "1990-01-01",
      })
      .returning();

    const got = await resolvePerson(db, {
      kind: "self",
      user: { id: u.id, firstName: u.firstName!, lastName: u.lastName!, birthDate: "1990-01-01" },
    });
    expect(got.id).toBe(existing[0].id);

    await db.delete(familyMembers).where(eq(familyMembers.id, existing[0].id));
  });

  it("creates a self row on first call", async () => {
    const db = getDb();
    const [u] = await db
      .insert(users)
      .values({
        email: `resolve-self-${Date.now()}@test.aspire`,
        firstName: "New",
        lastName: "Adult",
        passwordHash: null,
        emailVerified: true,
      })
      .returning();

    const got = await resolvePerson(db, {
      kind: "self",
      user: { id: u.id, firstName: "New", lastName: "Adult", birthDate: "1990-01-01" },
    });
    expect(got.selfUserId).toBe(u.id);
    expect(got.parentUserId).toBeNull();
  });

  it("dedupes dependent by parent + name + DOB (existing behavior preserved)", async () => {
    const db = getDb();
    const [u] = await db.select().from(users).limit(1);
    const first = await resolvePerson(db, {
      kind: "dependent",
      parentUserId: u.id,
      firstName: "Dedup",
      lastName: "Child",
      birthDate: "2015-01-01",
    });
    const second = await resolvePerson(db, {
      kind: "dependent",
      parentUserId: u.id,
      firstName: "Dedup",
      lastName: "Child",
      birthDate: "2015-01-01",
    });
    expect(second.id).toBe(first.id);
    await db.delete(familyMembers).where(eq(familyMembers.id, first.id));
  });
});
```

- [ ] **Step 2: Run test, confirm fail**

```bash
npm run test:api -- tests/api/resolve-person.spec.ts
```

Expected: FAIL — module `resolve-person` not found.

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/registrations/resolve-person.ts
import { eq, and, sql, asc } from "drizzle-orm";
import { familyMembers } from "@/lib/db/schema";
import type { Database } from "@/lib/db";
import type { FamilyMember } from "@/lib/db/schema/registrations";

export type ResolvePersonInput =
  | {
      kind: "self";
      user: {
        id: string;
        firstName: string;
        lastName: string;
        birthDate: string;
        gender?: "male" | "female" | "other" | null;
      };
    }
  | {
      kind: "dependent";
      parentUserId: string;
      firstName: string;
      lastName: string;
      birthDate: string;
      gender?: "male" | "female" | "other" | null;
    };

export async function resolvePerson(
  db: Database,
  input: ResolvePersonInput,
): Promise<FamilyMember> {
  if (input.kind === "self") {
    const existing = await db
      .select()
      .from(familyMembers)
      .where(eq(familyMembers.selfUserId, input.user.id))
      .orderBy(asc(familyMembers.createdAt))
      .limit(1);
    if (existing[0]) return existing[0];

    const [created] = await db
      .insert(familyMembers)
      .values({
        selfUserId: input.user.id,
        firstName: input.user.firstName,
        lastName: input.user.lastName,
        birthDate: input.user.birthDate,
        gender: input.user.gender ?? null,
      })
      .returning();
    return created;
  }

  // dependent path — preserves existing dedupe logic from guest-checkout
  const firstLower = input.firstName.toLowerCase();
  const lastLower = input.lastName.toLowerCase();
  const existing = await db
    .select()
    .from(familyMembers)
    .where(
      and(
        eq(familyMembers.parentUserId, input.parentUserId),
        sql`lower(${familyMembers.firstName}) = ${firstLower}`,
        sql`lower(${familyMembers.lastName}) = ${lastLower}`,
        eq(familyMembers.birthDate, input.birthDate),
      ),
    )
    .orderBy(asc(familyMembers.createdAt))
    .limit(1);
  if (existing[0]) return existing[0];

  const [created] = await db
    .insert(familyMembers)
    .values({
      parentUserId: input.parentUserId,
      firstName: input.firstName,
      lastName: input.lastName,
      birthDate: input.birthDate,
      gender: input.gender ?? null,
    })
    .returning();
  return created;
}
```

- [ ] **Step 4: Run test, confirm pass**

```bash
npm run test:api -- tests/api/resolve-person.spec.ts
```

Expected: all three tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/registrations/resolve-person.ts tests/api/resolve-person.spec.ts
git commit -m "feat(registrations): resolvePerson helper for self+dependent paths"
```

---

### Task 2.2: Update `createRegistration` helper to accept self

**Files:**
- Modify: `src/lib/registrations/create-registration.ts`

- [ ] **Step 1: Read the current file**

The helper takes `familyMember` as input and creates a registration row. Today it doesn't care whether the person is self or dependent — but the calling APIs do an authorization check (parentUserId === user.id). After this change, the helper should additionally accept a self-person where `selfUserId === user.id`.

- [ ] **Step 2: Update authorization logic**

Find the section that validates the family member belongs to the user. Replace the equality check with:

```typescript
const isAuthorized =
  familyMember.parentUserId === user.id ||
  familyMember.selfUserId === user.id;

if (!isAuthorized) {
  throw new RegistrationError(
    "Family member does not belong to this user",
    403,
  );
}
```

- [ ] **Step 3: Update waiver auditing**

Where the helper logs `waiverSignedBy`, ensure self-registrants get their own name (not a parent name). The helper already takes `waiverSignedBy` as input, so this is callsite responsibility — no helper change needed. Add a code comment:

```typescript
// waiverSignedBy is supplied by the caller. For self registrations, the
// caller passes the registrant's own name; for dependents, the parent's name.
```

- [ ] **Step 4: Run existing tests**

```bash
npm run test:api -- tests/api/registrations.spec.ts
```

Expected: existing parent-of-child tests still PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/registrations/create-registration.ts
git commit -m "feat(registrations): createRegistration accepts self persons"
```

---

### Task 2.3: Update `/api/registrations` POST for self path

**Files:**
- Modify: `src/pages/api/registrations/index.ts`
- Test: `tests/api/registrations-self.spec.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, beforeAll } from "vitest";
import { signIn, getSeasonForAdultProgram } from "./helpers";

describe("POST /api/registrations — self registration", () => {
  it("registers an adult user for an adult-eligible season without a child record", async () => {
    const cookie = await signIn("adult-self@test.aspiresports.com", "TestParent123!");
    const seasonId = await getSeasonForAdultProgram(); // seed should provide one

    const res = await fetch(`${TEST_BASE_URL}/api/registrations`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({
        seasonId,
        registerSelf: true,
        registrationType: "full",
        waiverSigned: true,
        waiverSignedBy: "Adult Self",
      }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.registration.familyMemberId).toBeTruthy();
  });

  it("rejects body that supplies both familyMemberId and registerSelf", async () => {
    const cookie = await signIn("adult-self@test.aspiresports.com", "TestParent123!");
    const res = await fetch(`${TEST_BASE_URL}/api/registrations`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({
        seasonId: "00000000-0000-0000-0000-000000000000",
        familyMemberId: "00000000-0000-0000-0000-000000000000",
        registerSelf: true,
        registrationType: "full",
        waiverSigned: true,
        waiverSignedBy: "X",
      }),
    });
    expect(res.status).toBe(400);
  });
});
```

Note: `helpers.ts` test util provides `signIn()` and a season-fetcher; if no adult season exists in seed, this task includes adding one (see Phase 3 Task seed).

- [ ] **Step 2: Run, confirm fail**

```bash
npm run test:api -- tests/api/registrations-self.spec.ts
```

Expected: FAIL — endpoint doesn't accept `registerSelf` yet.

- [ ] **Step 3: Update the zod schema and POST handler**

```typescript
const createRegistrationSchema = z
  .object({
    seasonId: z.string().uuid(),
    familyMemberId: z.string().uuid().optional(),
    registerSelf: z.boolean().optional(),
    registrationType: z.enum(["full", "deposit"]),
    waiverSigned: z.boolean(),
    waiverSignedBy: z.string().min(1),
    notes: z.string().optional(),
  })
  .refine(
    (v) => Boolean(v.familyMemberId) !== Boolean(v.registerSelf),
    { message: "Provide exactly one of familyMemberId or registerSelf:true" },
  );
```

In the POST handler, replace the family-member fetch with:

```typescript
import { resolvePerson } from "@/lib/registrations/resolve-person";

// ... after validation ...

let familyMember;
if (data.registerSelf) {
  familyMember = await resolvePerson(db, {
    kind: "self",
    user: {
      id: user.id,
      firstName: user.firstName ?? "",
      lastName: user.lastName ?? "",
      birthDate: user.birthDate ?? "1990-01-01",
      // birthDate fallback only used if user hasn't completed profile;
      // adult registration UI requires DOB before allowing self registration.
    },
  });
} else {
  const [fm] = await db
    .select()
    .from(familyMembers)
    .where(
      and(
        eq(familyMembers.id, data.familyMemberId!),
        eq(familyMembers.parentUserId, user.id),
      ),
    );
  if (!fm) {
    return new Response(JSON.stringify({ error: "Family member not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }
  familyMember = fm;
}
```

- [ ] **Step 4: Add `birthDate` to users table if missing**

Check `src/lib/db/schema/users.ts`. If `users` table lacks `birthDate`, add it:

```typescript
birthDate: date("birth_date"),
```

Then generate + apply migration (same flow as Task 1.2). The `birthDate` is needed because age-eligibility for self-registrants is computed from the user's own DOB.

- [ ] **Step 5: Run test, confirm pass**

```bash
npm run test:api -- tests/api/registrations-self.spec.ts
```

Expected: PASS.

- [ ] **Step 6: Run existing registrations tests**

```bash
npm run test:api -- tests/api/registrations.spec.ts
```

Expected: PASS (no regression).

- [ ] **Step 7: Commit**

```bash
git add src/pages/api/registrations/index.ts src/lib/db/schema/users.ts src/lib/db/migrations/ tests/api/registrations-self.spec.ts
git commit -m "feat(registrations): POST accepts registerSelf:true for adults"
```

---

### Task 2.4: Update `/api/registrations/guest-checkout` for adult self

**Files:**
- Modify: `src/pages/api/registrations/guest-checkout.ts`
- Test: extend `tests/api/registrations-self.spec.ts`

- [ ] **Step 1: Add a failing test for adult guest checkout**

Append to `tests/api/registrations-self.spec.ts`:

```typescript
describe("POST /api/registrations/guest-checkout — adult self path", () => {
  it("creates user + self person + registration when registrant is an adult", async () => {
    const seasonId = await getSeasonForAdultProgram();
    const email = `adult-${Date.now()}@example.com`;

    const res = await fetch(`${TEST_BASE_URL}/api/registrations/guest-checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        seasonId,
        registrant: {
          firstName: "Sam",
          lastName: "Adult",
          email,
          phone: "+15555550100",
          birthDate: "1985-06-15",
          isSelf: true,
        },
        registrationType: "full",
        waiverSigned: true,
        waiverSignedBy: "Sam Adult",
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.checkoutUrl ?? body.paid).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run, confirm fail**

Expected: FAIL — current schema requires `parent` + `child` keys.

- [ ] **Step 3: Update the zod schema to accept either shape**

Replace `guestCheckoutSchema`:

```typescript
const guestRegistrantSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  isSelf: z.literal(true),
  gender: z.enum(["male", "female", "other"]).optional(),
});

const guestCheckoutSchema = z.union([
  // Legacy parent + child shape (preserved)
  z.object({
    seasonId: z.string().uuid(),
    parent: z.object({
      firstName: z.string().min(1),
      lastName: z.string().min(1),
      email: z.string().email(),
      phone: z.string().optional(),
    }),
    child: z.object({
      firstName: z.string().min(1),
      lastName: z.string().min(1),
      birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      gender: z.enum(["male", "female", "other"]).optional(),
    }),
    registrationType: z.enum(["full", "deposit"]),
    waiverSigned: z.boolean(),
    waiverSignedBy: z.string().min(1),
    discountCode: z.string().optional(),
  }),
  // New adult self shape
  z.object({
    seasonId: z.string().uuid(),
    registrant: guestRegistrantSchema,
    registrationType: z.enum(["full", "deposit"]),
    waiverSigned: z.boolean(),
    waiverSignedBy: z.string().min(1),
    discountCode: z.string().optional(),
  }),
]);
```

- [ ] **Step 4: Branch the handler on shape**

After validation, check `"registrant" in data`. For the adult path:

```typescript
if ("registrant" in data) {
  const r = data.registrant;
  const normalizedEmail = r.email.toLowerCase().trim();
  // upsert user (same pattern as today, but with birthDate)
  // ... insert with birthDate: r.birthDate ...
  // resolvePerson({ kind: "self", user: { id, firstName, lastName, birthDate } })
} else {
  // existing parent+child path (untouched)
}
```

Reuse `resolvePerson` from Task 2.1.

- [ ] **Step 5: Run tests**

```bash
npm run test:api -- tests/api/registrations-self.spec.ts tests/api/guest-checkout.spec.ts
```

Expected: both new and existing tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/pages/api/registrations/guest-checkout.ts tests/api/registrations-self.spec.ts
git commit -m "feat(registrations): guest-checkout adult self path"
```

---

## Phase 3 — Wizard

### Task 3.1: Extract Step 1 into `who-step.tsx`

**Files:**
- Create: `src/components/registration/who-step.tsx`
- Modify: `src/components/registration/registration-wizard.tsx`

- [ ] **Step 1: Read current Step 1 in `registration-wizard.tsx` (~lines 700–840 for authed path, 842–946 for guest path)**

Note the props/state it consumes: list of family members, currently-selected member ID, callback to add a new member.

- [ ] **Step 2: Create `who-step.tsx`**

```tsx
"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export type Person =
  | { id: string; kind: "self"; firstName: string; lastName: string }
  | { id: string; kind: "dependent"; firstName: string; lastName: string; birthDate: string };

export type WhoStepProps = {
  /** Current user's first/last name. If null, user has not signed in. */
  selfOption: { firstName: string; lastName: string; ageEligible: boolean } | null;
  dependents: Array<{ id: string; firstName: string; lastName: string; birthDate: string; ageEligible: boolean }>;
  selectedKey: string | null; // "self" or dependent id
  onSelect: (key: string) => void;
  onAddDependent: () => void;
};

export function WhoStep({
  selfOption,
  dependents,
  selectedKey,
  onSelect,
  onAddDependent,
}: WhoStepProps) {
  return (
    <div className="space-y-3">
      <h2 className="text-2xl font-serif">Who are you registering?</h2>
      <p className="text-muted-foreground">
        Pick yourself or one of your players. You can add a new player below.
      </p>

      {selfOption && (
        <Card
          role="button"
          aria-pressed={selectedKey === "self"}
          aria-disabled={!selfOption.ageEligible}
          onClick={() => selfOption.ageEligible && onSelect("self")}
          className={`p-4 cursor-pointer ${
            selectedKey === "self" ? "border-primary ring-2 ring-primary/30" : ""
          } ${!selfOption.ageEligible ? "opacity-50 cursor-not-allowed" : ""}`}
        >
          <div className="flex items-center justify-between">
            <div>
              <div className="font-semibold">Myself — {selfOption.firstName} {selfOption.lastName}</div>
              {!selfOption.ageEligible && (
                <div className="text-xs text-muted-foreground">
                  This program isn't in your age range.
                </div>
              )}
            </div>
          </div>
        </Card>
      )}

      {dependents.map((d) => (
        <Card
          key={d.id}
          role="button"
          aria-pressed={selectedKey === d.id}
          aria-disabled={!d.ageEligible}
          onClick={() => d.ageEligible && onSelect(d.id)}
          className={`p-4 cursor-pointer ${
            selectedKey === d.id ? "border-primary ring-2 ring-primary/30" : ""
          } ${!d.ageEligible ? "opacity-50 cursor-not-allowed" : ""}`}
        >
          <div className="font-semibold">{d.firstName} {d.lastName}</div>
          {!d.ageEligible && (
            <div className="text-xs text-muted-foreground">Not in age range for this program.</div>
          )}
        </Card>
      ))}

      <Button variant="outline" onClick={onAddDependent} className="w-full">
        + Add a player
      </Button>
    </div>
  );
}
```

- [ ] **Step 3: Wire the new component into `registration-wizard.tsx`**

Replace the existing Step 1 JSX in the authenticated path with `<WhoStep ... />`. Compute `selfOption` from current user profile (only show if user has `birthDate` set and is age-eligible for the season). Compute `dependents` from the family-members list as before. Add a state key `selectedKey` of type `"self" | string | null`.

When the wizard submits in Step 2, derive the body:
```typescript
const body = selectedKey === "self"
  ? { seasonId, registerSelf: true, ... }
  : { seasonId, familyMemberId: selectedKey, ... };
```

- [ ] **Step 4: Quick render check**

```bash
npm run dev
```

Visit `/register/[seasonId]` while signed in. Verify "Myself" appears at the top of the list when your account has a birthDate, and is disabled with a clear note when out of age range.

- [ ] **Step 5: Commit**

```bash
git add src/components/registration/who-step.tsx src/components/registration/registration-wizard.tsx
git commit -m "feat(registration): WhoStep component with self + dependents"
```

---

### Task 3.2: Branch waiver copy by self-vs-dependent

**Files:**
- Modify: `src/components/registration/registration-wizard.tsx`

- [ ] **Step 1: Locate the waiver block (~line 1016 per audit)**

Today it reads "...on behalf of [name]." We need two templates.

- [ ] **Step 2: Replace with a branched template**

```tsx
const isSelfRegistration = selectedKey === "self";
const playerLabel = isSelfRegistration
  ? `${currentUser.firstName} ${currentUser.lastName}`
  : `${selectedDependent.firstName} ${selectedDependent.lastName}`;

const waiverText = isSelfRegistration ? (
  <p>
    I, <strong>{playerLabel}</strong>, agree to participate in this program and
    accept the terms of the participation waiver.
  </p>
) : (
  <p>
    I authorize <strong>{playerLabel}</strong> to participate in this program on
    my behalf as their parent or legal guardian, and accept the terms of the
    participation waiver.
  </p>
);
```

- [ ] **Step 3: Add a Playwright assertion for waiver copy**

In `tests/registration-adult.spec.ts` (created in Task 3.3), include:

```typescript
await expect(page.getByText(/I, .*, agree to participate/)).toBeVisible();
await expect(page.getByText(/I authorize/)).not.toBeVisible();
```

- [ ] **Step 4: Commit**

```bash
git add src/components/registration/registration-wizard.tsx
git commit -m "feat(registration): branched waiver copy for self vs dependent"
```

---

### Task 3.3: Playwright E2E for adult self-registration

**Files:**
- Create: `tests/registration-adult.spec.ts`

- [ ] **Step 1: Write the test**

```typescript
import { test, expect } from "@playwright/test";
import { waitForHydration } from "./utils/test-helpers";

test("adult registers themselves end-to-end", async ({ page }) => {
  // Seed-provided adult user account; see seed-e2e-tests.ts
  await page.goto("/signin", { waitUntil: "domcontentloaded" });
  await waitForHydration(page);
  await page.getByLabel("Email").fill("adult-self@test.aspiresports.com");
  await page.getByLabel("Password").fill("TestParent123!");
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL("**/dashboard");

  // Navigate to an adult-eligible season
  await page.goto("/register/SEASON_ID_FROM_SEED", { waitUntil: "domcontentloaded" });
  await waitForHydration(page);

  // Step 1: Who?
  await expect(page.getByText("Who are you registering?")).toBeVisible();
  await page.getByRole("button", { name: /Myself/ }).click();
  await page.getByRole("button", { name: /next/i }).click();

  // Step 2: Waiver copy is self-flavored
  await expect(page.getByText(/I, .*, agree to participate/)).toBeVisible();
  await page.getByRole("checkbox", { name: /I agree/i }).check();
  await page.getByRole("button", { name: /next/i }).click();

  // Step 3: Stripe checkout button (don't actually pay in CI; verify it's reached)
  await expect(page.getByRole("button", { name: /pay|checkout/i })).toBeVisible();
});
```

- [ ] **Step 2: Update `src/lib/db/seeds/seed-e2e-tests.ts`**

Add an adult-eligible season + an adult user account:

```typescript
// Adult test user
await db.insert(users).values({
  email: "adult-self@test.aspiresports.com",
  passwordHash: await hashPassword("TestParent123!"),
  firstName: "Adult",
  lastName: "Self",
  birthDate: "1985-06-15",
  emailVerified: true,
}).onConflictDoNothing();

// Adult Open soccer program + season under the existing test org/location
// (use minAge: 18, maxAge: 99 on the age group)
```

Re-run seed: `npm run db:seed:e2e`.

- [ ] **Step 3: Run the test**

```bash
PLAYWRIGHT_BASE_URL=http://localhost:4321 npx playwright test tests/registration-adult.spec.ts --headed
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add tests/registration-adult.spec.ts src/lib/db/seeds/seed-e2e-tests.ts
git commit -m "test: e2e adult self-registration flow"
```

---

## Phase 4 — Account dashboard

### Task 4.1: Players tab includes self

**Files:**
- Modify: `src/pages/dashboard/index.astro` (or the specific dashboard page that lists family members)
- Modify: `src/pages/api/family-members/index.ts` (the GET endpoint)

- [ ] **Step 1: Update GET to return self alongside dependents**

The current endpoint returns rows where `parentUserId === user.id`. Update to also return rows where `selfUserId === user.id`:

```typescript
const rows = await db
  .select()
  .from(familyMembers)
  .where(
    or(
      eq(familyMembers.parentUserId, user.id),
      eq(familyMembers.selfUserId, user.id),
    ),
  );
```

Add a derived `kind: "self" | "dependent"` field to the response so the UI can label rows.

- [ ] **Step 2: Update dashboard rendering**

In the dashboard component, label the self row "You" with a small badge. Render a "Register myself for a program" CTA at the top of the players list when the user has `birthDate` set and there are age-eligible programs at the current org.

- [ ] **Step 3: Visual smoke check via dev server**

Sign in as a test user with a self-registration. Confirm the "You" row is at the top.

- [ ] **Step 4: Commit**

```bash
git add src/pages/dashboard src/pages/api/family-members
git commit -m "feat(dashboard): show self alongside dependents in Players list"
```

---

### Task 4.2: "Register myself" entry on empty state

**Files:**
- Modify: dashboard empty-state component

- [ ] **Step 1: Locate the empty state copy** ("You haven't added any players yet.")

- [ ] **Step 2: Replace with a two-action card**

```tsx
<EmptyState>
  <h3>Get started</h3>
  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
    <Button onClick={() => navigate("/register?for=self")}>
      Register myself
    </Button>
    <Button variant="outline" onClick={openAddChildDialog}>
      Add a child
    </Button>
  </div>
</EmptyState>
```

- [ ] **Step 3: Commit**

```bash
git add src/pages/dashboard
git commit -m "feat(dashboard): dual entry point on empty Players list"
```

---

## Phase 5 — Marketing surface

### Task 5.1: Dual-CTA homepage hero

**Files:**
- Create: `src/components/marketing/dual-cta-hero.tsx`
- Modify: `src/pages/index.astro`

- [ ] **Step 1: Build the hero component**

```tsx
"use client";
import { Button } from "@/components/ui/button";

export function DualCtaHero() {
  return (
    <section className="container mx-auto py-20 text-center space-y-6">
      <h1 className="text-5xl font-serif">Sports for kids. Sports for adults.</h1>
      <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
        One platform. Programs at your local facility, registration in minutes,
        schedules on every device.
      </p>
      <div className="flex justify-center gap-4 flex-wrap">
        <Button size="lg" asChild>
          <a href="/programs?audience=youth">Register your child</a>
        </Button>
        <Button size="lg" variant="outline" asChild>
          <a href="/programs?audience=adult">Register yourself</a>
        </Button>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Replace existing hero in `index.astro`**

Locate the current hero block and swap in `<DualCtaHero client:load />`. Preserve the rest of the page (testimonials, features, etc.).

- [ ] **Step 3: Verify in browser**

`npm run dev`, visit `/`, confirm both CTAs render and route correctly.

- [ ] **Step 4: Commit**

```bash
git add src/components/marketing/dual-cta-hero.tsx src/pages/index.astro
git commit -m "feat(marketing): dual-CTA hero on homepage"
```

---

### Task 5.2: Age filter on programs index

**Files:**
- Modify: `src/pages/programs/index.astro` (or equivalent — verify path during execution)

- [ ] **Step 1: Add `audience` query-param parsing**

```astro
---
const audience = Astro.url.searchParams.get("audience"); // "youth" | "adult" | null
const ageFilter =
  audience === "adult" ? { minAge: 18 } :
  audience === "youth" ? { maxAge: 17 } : null;
// pass into the existing programs query
---
```

- [ ] **Step 2: Add a visible filter chip / segmented control**

Three chips: "All", "Youth", "Adult". Active chip reflects current `audience`. Click updates the URL.

- [ ] **Step 3: Confirm SEO**

Each filtered URL is its own page (different querystring); ensure crawlers can index them — add `<link rel="canonical">` only on the unfiltered view, leave filtered views as their own canonical.

- [ ] **Step 4: Commit**

```bash
git add src/pages/programs/
git commit -m "feat(marketing): audience filter on programs index"
```

---

## Phase 6 — Walk-up admin

### Task 6.1: Adult mode toggle in walk-up form

**Files:**
- Modify: `src/components/admin/walk-up-registration-form.tsx`

- [ ] **Step 1: Add a mode toggle at the top of the form**

```tsx
const [mode, setMode] = useState<"child" | "adult">("child");
// ... in JSX:
<RadioGroup value={mode} onChange={setMode}>
  <RadioGroup.Option value="child">Registering a child</RadioGroup.Option>
  <RadioGroup.Option value="adult">Registering an adult</RadioGroup.Option>
</RadioGroup>
```

- [ ] **Step 2: Adapt fields based on mode**

When `mode === "adult"`, hide the parent-info fields, relabel "Player info" to "Registrant info" and require a single set of name/email/phone/DOB. Adult mode posts `{ adultMode: true, registrant: {...} }`.

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/walk-up-registration-form.tsx
git commit -m "feat(admin): walk-up form supports adult mode"
```

---

### Task 6.2: Walk-up API handles adult registrants

**Files:**
- Modify: `src/pages/api/admin/walk-up-registration.ts`

- [ ] **Step 1: Branch the zod schema (same union pattern as Task 2.4)**

Either parent+child shape (existing) or `{ adultMode: true, registrant: {...} }`.

- [ ] **Step 2: In the handler**

For adult mode: upsert user, then `resolvePerson({ kind: "self", ... })`, then `createRegistration({ ... })`. Reuse `resolvePerson` from Task 2.1.

- [ ] **Step 3: API test**

Add a test in `tests/api/registrations-self.spec.ts`:

```typescript
it("admin walk-up creates an adult self registration", async () => {
  const adminCookie = await signIn("admin@test.aspiresports.com", "TestAdmin123!");
  const seasonId = await getSeasonForAdultProgram();
  const res = await fetch(`${TEST_BASE_URL}/api/admin/walk-up-registration`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: adminCookie },
    body: JSON.stringify({
      seasonId,
      adultMode: true,
      registrant: {
        firstName: "Walkup",
        lastName: "Adult",
        email: `walkup-${Date.now()}@example.com`,
        phone: "+15555550101",
        birthDate: "1990-03-03",
      },
      registrationType: "full",
      waiverSigned: true,
      waiverSignedBy: "Walkup Adult",
    }),
  });
  expect(res.status).toBeLessThan(300);
});
```

- [ ] **Step 4: Run tests, commit**

```bash
npm run test:api -- tests/api/registrations-self.spec.ts
git add src/pages/api/admin/walk-up-registration.ts tests/api/registrations-self.spec.ts
git commit -m "feat(admin): walk-up registration adult mode"
```

---

## Phase 7 — Free-agent flag

### Task 7.1: Add `lookingForTeam` to registrations + admin surface

**Files:**
- Modify: `src/lib/db/schema/registrations.ts`
- Migration: auto-generated
- Modify: registration wizard Step 2/3 (after waiver) for adult registrants only — show optional checkbox
- Modify: admin roster-assignment view to filter by free-agent status

- [ ] **Step 1: Schema**

Add to `registrations` table:

```typescript
lookingForTeam: boolean("looking_for_team").default(false).notNull(),
```

Generate + apply migration.

- [ ] **Step 2: UI — adult-only checkbox**

Inside the wizard, conditionally render only when `selectedKey === "self"`:

```tsx
<Checkbox
  checked={lookingForTeam}
  onCheckedChange={setLookingForTeam}
  label="I'm not registering with a team — please place me with one."
/>
```

Pass through in the API request body. Add to zod schemas. Persist on the registration row.

- [ ] **Step 3: Admin roster view**

In the admin's roster-assignment screen, add a "Free agents" filter that shows registrations where `lookingForTeam = true` and not yet rostered.

- [ ] **Step 4: Test + commit**

Add a test that sets `lookingForTeam: true` on a registration and verifies it's persisted and surfaces in the admin list.

```bash
git add ...
git commit -m "feat(registrations): free-agent flag for adult self-registrants"
```

---

## Phase 8 — Final validation

### Task 8.1: Full pre-merge sweep

- [ ] **Step 1: Type check**

```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 2: API tests**

```bash
CRON_SECRET=ci-cron-test-secret TEST_BASE_URL=http://localhost:4321 npm run test:api
```

Expected: all PASS.

- [ ] **Step 3: Playwright**

```bash
PLAYWRIGHT_BASE_URL=http://localhost:4321 npm test
```

Expected: all PASS, including new `registration-adult.spec.ts`.

- [ ] **Step 4: Build**

```bash
npm run build
```

Expected: clean.

- [ ] **Step 5: Update `CLAUDE.md`**

Add a new short section under "Conventions":

```markdown
### People model

`family_members` rows represent **people** — either a dependent of a user (`parent_user_id` set) or the user themselves (`self_user_id` set). Exactly one is non-null per row, enforced by a DB CHECK constraint. New code that creates family-member rows should use `resolvePerson()` in `src/lib/registrations/resolve-person.ts` rather than inserting directly.
```

- [ ] **Step 6: Trigger full CI on this branch before merging**

```bash
gh workflow run CI --ref feat/unified-people-model
gh run watch
```

Expected: green.

- [ ] **Step 7: Final commit**

```bash
git add CLAUDE.md
git commit -m "docs: people-model convention in CLAUDE.md"
```

---

## Self-review checklist

**Spec coverage:**
- ✅ Schema: nullable parent_user_id + self_user_id + check constraint (Tasks 1.1–1.3)
- ✅ Backend self-path: registrations POST, guest-checkout, walk-up (Tasks 2.3, 2.4, 6.2)
- ✅ Wizard self-vs-dependent (Tasks 3.1–3.3)
- ✅ Branched waiver copy (Task 3.2)
- ✅ Dashboard self row (Task 4.1)
- ✅ Marketing dual-CTA + age filter (Tasks 5.1, 5.2)
- ✅ Walk-up adult mode (Tasks 6.1, 6.2)
- ✅ Free-agent flag (Task 7.1)
- ✅ Pre-merge validation (Task 8.1)

**Type consistency:**
- `resolvePerson` signature: `(db, input: ResolvePersonInput) => Promise<FamilyMember>` — used identically in 2.3, 2.4, 6.2
- Wizard `selectedKey: "self" | string | null` — consistent across 3.1, 3.2
- Request body shape `{ registerSelf: true }` (authed) vs `{ registrant: {...} }` (guest) vs `{ adultMode: true, registrant: {...} }` (admin walk-up) — three distinct shapes by surface, deliberate

**Placeholders:** none.

**Open questions for the executing agent:**
- Confirm `users` table birthDate column status before Task 2.3 Step 4 — if it already exists, skip the migration step.
- Confirm exact path of programs index page in Task 5.2 — could be `/programs/index.astro` or `/seasons/index.astro`.
