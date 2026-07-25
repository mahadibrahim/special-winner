# SoccerOne Rentals UX Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refresh the SoccerOne rentals page (`/soccerone/rent`) — correct field data/copy, remove member pricing entirely, drop the numbered-step system, add per-field info cards and a futsal "Coming September" interest capture — then propagate the brand-agnostic bits to Aspire `/rentals`.

**Architecture:** Mostly UI/copy edits on `rent.astro` + `FieldCalendar.tsx` (SoccerOne) and `RentalBooking.tsx` (Aspire), one shared booking-endpoint change (kill member discount/window), one guarded venue-data correction, and one small futsal-interest capture endpoint + table.

**Tech Stack:** Astro 5 (SSR), React 19 islands, Drizzle ORM + PostgreSQL, Vitest (API), Tailwind + SoccerOne design tokens.

## Global Constraints

- **Scope:** SoccerOne `/soccerone/rent` (`rent.astro`, `FieldCalendar.tsx`); shared booking endpoint `src/pages/api/rentals/bookings/index.ts`; Aspire `RentalBooking.tsx` for brand-agnostic propagation. `FieldCalendar` is SoccerOne-only; `RentalBooking` is Aspire-only.
- **Fields (ground truth):** Worthington = **Orange** + **Blue**, each **110×60**, boarded, sand-filled turf, 535 Lakeview Plaza Blvd. Downtown = **Yellow**, **130×45**, built for 6v6, 980 E Starr Ave. A spurious **"Field 3"** venue at Worthington must be removed from the rental selector.
- **Member pricing:** remove from rentals **entirely** — UI messaging, the `applyMemberRentalDiscount` call, AND the member booking-window extension (`resolveBookingWindowDays`). Rentals use flat `DEFAULT_BOOKING_WINDOW_DAYS` for everyone. Leave the membership system intact everywhere else.
- **Numbered steps:** remove the `01./02./03.` `section-num` / `section-num-sm` treatment; plain headings only. (Also drop the `.rmc-eyebrow` "SAVE EVERY VISIT" — eyebrow/kicker text is disallowed per house style.)
- **Request flow:** copy must reflect request→approve→pay with **≥48h lead time** and a **7-day** far window (flat). Do NOT promise the per-player emailed waiver flow (that's Sub-project 2) — state the waiver *requirement* only.
- **Futsal:** generic "Coming September" (no court count) + email interest capture.
- **DB writes:** venue correction + any migration go through guarded scripts / `db:generate` → commit → controller applies to staging. NEVER `db:push` to remote.
- **Prerender:** `rent.astro` stays SSR (`prerender = false`, reads `?facility`).
- **Verify in a browser on affected brands** — accent tokens are never a text colour; SoccerOne `BrandTheme` inverts Aspire tokens, so check contrast on the dark SoccerOne surface.
- **Pre-push:** `npm run build`, `npx tsc --noEmit` (0 errors), affected API tests green.

---

## File Structure

- Modify `src/pages/api/rentals/bookings/index.ts` — remove member discount + window extension (shared).
- Modify `src/pages/soccerone/rent.astro` — copy, numbered system, member UI, field count, futsal section.
- Modify `src/components/soccerone/FieldCalendar.tsx` — member UI/props, window copy, field names + info cards, waiver copy.
- Create `src/lib/soccerone/field-info.ts` — static per-field spec map.
- Modify `src/components/rentals/RentalBooking.tsx` — waiver-expectation copy (Aspire).
- Create `src/lib/db/schema/futsal-interest.ts` (+ migration) — interest table.
- Create `src/pages/api/soccerone/futsal-interest.ts` — capture endpoint.
- Create `tests/api/soccerone/futsal-interest.test.ts` — endpoint test.
- Modify `src/lib/db/schema/index.ts` — export the new table.
- One-off: `scripts/fix-worthington-field3.ts` (guarded, deleted after run) — disable the spurious venue.

---

## Task 1: Remove member discount + window extension from the booking endpoint

**Files:**
- Modify: `src/pages/api/rentals/bookings/index.ts`
- Test: `tests/api/rentals/bookings.test.ts` (regression only — must still pass)

**Interfaces:**
- Produces: `POST /api/rentals/bookings` prices at the base rate for everyone (no member discount) and uses the flat `DEFAULT_BOOKING_WINDOW_DAYS` window.

- [ ] **Step 1: Remove the membership lookup + discount + window extension**

In `src/pages/api/rentals/bookings/index.ts`:

Delete the membership lookup block (the `let membership … getActiveMembershipForOrg(…)` try/catch, ~lines 112–118).

In the far-window check (~lines 152–153), replace the membership-derived window with the flat default:

```ts
    const windowDays = DEFAULT_BOOKING_WINDOW_DAYS;
    if (startsAt >= bookingWindowEndUtc(new Date(), windowDays, orgTimeZone)) {
```

Replace the discount block (~lines 200–210, `let amountDueCents = baseAmountDueCents; if (membership) { amountDueCents = applyMemberRentalDiscount(…) }`) with:

```ts
  // Rentals are flat-priced — no member discount (removed 2026-07). Members
  // get no rental discount; the membership system is unaffected elsewhere.
  const amountDueCents = baseAmountDueCents;
```

- [ ] **Step 2: Remove now-unused imports**

Delete the imports that are no longer referenced: `getActiveMembershipForOrg` (line 29), `applyMemberRentalDiscount` (line 30), and `resolveBookingWindowDays` (from the `booking-window` import on lines 31–34) — keep `bookingWindowEndUtc` and `DEFAULT_BOOKING_WINDOW_DAYS`. Confirm `DEFAULT_BOOKING_WINDOW_DAYS` is imported (add to the `booking-window` import if it isn't already).

- [ ] **Step 3: Type-check**

Run: `cd /Volumes/MahadData/Aspire-Sports/web-app-rentals-ux && npx tsc --noEmit`
Expected: zero errors (no unused-import errors).

- [ ] **Step 4: Regression test (dev server already running on :4321)**

Run: `cd /Volumes/MahadData/Aspire-Sports/web-app-rentals-ux && TEST_BASE_URL=http://localhost:4321 npm run test:api -- rentals/bookings rentals/conflict`
Expected: PASS (request flow still returns `{ requested: true }`; no regression). The dev server hot-reloads the endpoint edit.

> No positive "member gets no discount" test exists — staging has no seeded member with a rental discount, so removal is verified by code + the passing suite. Do not add a member fixture for this.

- [ ] **Step 5: Commit**

```bash
git add src/pages/api/rentals/bookings/index.ts
git commit -m "feat(rentals): remove member discount + window extension (flat pricing)"
```

---

## Task 2: Field data correction — disable the spurious Worthington venue

**Files:**
- Create (then delete after run): `scripts/fix-worthington-field3.ts`
- Modify: `src/pages/soccerone/rent.astro` (derive field count from real venues)

**Interfaces:**
- Produces: the SoccerOne Worthington rental selector returns exactly **Orange** + **Blue**; the facility bar shows the real field count.

- [ ] **Step 1: Write a guarded one-off correction script**

Create `scripts/fix-worthington-field3.ts`. It resolves the SoccerOne org's Worthington location, lists its rental-enabled venues, and sets `rentalEnabled = false` on any whose name is NOT "Orange"/"Blue" (case-insensitive, allowing "Orange Field" etc.). Soft-disable (not delete) to avoid FK restrict on `field_rentals.venue_id` and preserve history. Dry-run by default; applies only with `APPLY=yes`.

```ts
/**
 * One-off: disable the spurious extra rental venue at SoccerOne Worthington so
 * the rental selector shows only Orange + Blue. Soft-disables (rental_enabled=
 * false) — never deletes (field_rentals.venue_id is onDelete restrict).
 * Dry-run unless APPLY=yes. Delete this script after the merge.
 */
import { getDb } from "@/lib/db";
import { locations, venues } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";

const SOCCERONE_ORG_ID = "04836321-9e38-430e-b6a1-4bf4e6ca1b62";
const KEEP = ["orange", "blue"];

async function main() {
  const db = getDb();
  const [loc] = await db
    .select({ id: locations.id })
    .from(locations)
    .where(and(eq(locations.organizationId, SOCCERONE_ORG_ID), eq(locations.slug, "worthington")))
    .limit(1);
  if (!loc) throw new Error("Worthington location not found for SoccerOne org");

  const rows = await db
    .select({ id: venues.id, name: venues.name, rentalEnabled: venues.rentalEnabled })
    .from(venues)
    .where(eq(venues.locationId, loc.id));

  const toDisable = rows.filter(
    (v) => v.rentalEnabled && !KEEP.some((k) => v.name.toLowerCase().includes(k)),
  );
  console.log("Worthington rental venues:", rows.map((r) => `${r.name} (enabled=${r.rentalEnabled})`));
  console.log("Would disable:", toDisable.map((r) => r.name));

  if (process.env.APPLY === "yes") {
    for (const v of toDisable) {
      await db.update(venues).set({ rentalEnabled: false }).where(eq(venues.id, v.id));
      console.log("Disabled:", v.name);
    }
  } else {
    console.log("(dry-run; set APPLY=yes to apply)");
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Dry-run against staging**

Run: `cd /Volumes/MahadData/Aspire-Sports/web-app-rentals-ux && ./scripts/with-bws.sh npx tsx scripts/fix-worthington-field3.ts`
Expected: prints the Worthington venues and the one it *would* disable (the non-Orange/Blue one, e.g. "Field 3"). Confirm it lists Orange + Blue as kept. **Report the output — the controller will decide/apply against staging + prod.**

> The controller applies (`APPLY=yes … tsx …`) to staging + prod, not the implementer. Do NOT run with APPLY here.

- [ ] **Step 3: Derive field count from real venues in `rent.astro`**

In `src/pages/soccerone/rent.astro`, replace the hardcoded `const fieldCount = facility === 'downtown' ? '1 field' : '2 fields';` with a count from the fetched `venueList`:

```ts
const fieldCount = `${venueList.length} field${venueList.length === 1 ? '' : 's'}`;
```

(Place it after `venueList` is resolved.)

- [ ] **Step 4: Type-check + commit**

Run: `npx tsc --noEmit` → zero errors.

```bash
git add scripts/fix-worthington-field3.ts src/pages/soccerone/rent.astro
git commit -m "fix(rentals): derive field count from venues + script to disable spurious Worthington venue"
```

---

## Task 3: Strip member UI, numbered system, and stale copy (SoccerOne)

**Files:**
- Modify: `src/pages/soccerone/rent.astro`
- Modify: `src/components/soccerone/FieldCalendar.tsx`

**Interfaces:**
- Consumes: Task 1 (endpoint no longer discounts) so removing the member UI can't mislead.
- Produces: `rent.astro` + `FieldCalendar` with no member messaging, no numbered headers, accurate request/window copy, and no `memberDiscountPct` plumbing.

- [ ] **Step 1: `rent.astro` — remove member plumbing + UI**

- Delete the `getActiveMembershipForOrg` import (line 9) and the `memberDiscountPct` / membership block (lines 29–39); keep `bookingWindowDays = DEFAULT_BOOKING_WINDOW_DAYS` as a flat constant (drop the `resolveBookingWindowDays` import + usage).
- Remove the `<p class="rt-member-note">Members save 10% · founding members save 25%.</p>` line (122) and its `.rt-member-note` CSS (~491).
- Remove the entire membership CTA band: the `.rmc-*` section (the `<section>` containing `rmc-inner` ~269–276, including the `rmc-eyebrow` "SAVE EVERY VISIT", `rmc-title`, `rmc-sub`, `rmc-btn`) and its CSS (`.rmc-*` rules ~583–588, 745).
- In the `<FieldCalendar … />` tag (line 179), drop the `memberDiscountPct={memberDiscountPct}` prop; keep `venues`, `timeZone`, `bookingWindowDays`.

- [ ] **Step 2: `rent.astro` — remove numbered headers + fix hero/count copy**

- Remove the `<span class="section-num-sm">01.</span>` / `02.` / `03.` spans (lines ~168, 190, 287) and the `.section-num-sm` CSS (~551). Leave the heading text (e.g. "Select a time slot") as a plain heading.
- Hero description (line 92): change "Request any of our 4 indoor fields." to reflect reality without a wrong count, e.g. "Request a field at {facilityLabel}. We review each request and email you a secure link to pay — the slot is held while we confirm. **Requests must be at least 48 hours out and up to 7 days ahead** — call or email us for anything sooner or further."
- Update `<title>`/`description` meta: drop "members save", fix counts (Worthington 2, Downtown 1; futsal coming September).

- [ ] **Step 3: `FieldCalendar.tsx` — remove member note + prop, fix window copy**

- Remove the `memberDiscountPct` prop from the props interface (line 163) and the destructure default (line 187); remove the `standardCents`/`discountedCents` member-pricing computation (lines ~298–299) — display the base price only.
- Remove the member-note block (lines 443–446, both the "Member discount … applied" and "Members save up to 25% — sign in" branches). If a price line is shown, keep just the plain price.
- Fix the window copy (line 422): "Online booking opens {bookingWindowDays} days ahead — email …" → request-flow phrasing, e.g. "Requests open up to {bookingWindowDays} days ahead and must be at least 48 hours out — email hello@gosoccerone.com for other dates."

- [ ] **Step 4: Verify build + tsc**

Run: `cd /Volumes/MahadData/Aspire-Sports/web-app-rentals-ux && ./scripts/with-bws.sh npm run build` → succeeds.
Run: `npx tsc --noEmit` → zero errors.

- [ ] **Step 5: Browser check (controller-assisted)**

Load `http://localhost:4321/soccerone/rent?facility=worthington` and `?facility=downtown`. Confirm: no "Members save"/"sign in" text, no numbered "01./02./03." headers, no membership CTA band, accurate request/48h copy, price shows base rate. Note contrast on the dark SoccerOne surface. **The controller runs the browser check** (build poisons the dev Vite cache; controller restarts + verifies).

- [ ] **Step 6: Commit**

```bash
git add src/pages/soccerone/rent.astro src/components/soccerone/FieldCalendar.tsx
git commit -m "feat(rentals): remove member UI + numbered steps + fix window copy (SoccerOne)"
```

---

## Task 4: Field names + per-field info cards (SoccerOne)

**Files:**
- Create: `src/lib/soccerone/field-info.ts`
- Modify: `src/components/soccerone/FieldCalendar.tsx`

**Interfaces:**
- Consumes: the `venues` prop (`{ id, name }[]`) already passed to `FieldCalendar`.
- Produces: the field selector shows real field names (Orange/Blue/Yellow) and a per-field info card (dimensions, surface/format, location).

- [ ] **Step 1: Static field-info map**

Create `src/lib/soccerone/field-info.ts`:

```ts
/**
 * Static per-field specs for the SoccerOne rental booking UI. Keyed by a
 * normalized field name (lowercased, "field" suffix stripped). Marketing data
 * that mirrors the Worthington/Downtown location pages.
 */
export interface FieldInfo {
  label: string;       // display name, e.g. "Orange Field"
  dimensions: string;  // e.g. "110 × 60"
  surface: string;     // e.g. "Boarded, sand-filled turf"
  format: string;      // e.g. "Full-size" / "Built for 6v6"
  location: string;    // where it sits in the facility
}

export const FIELD_INFO: Record<string, FieldInfo> = {
  orange: {
    label: "Orange Field",
    dimensions: "110 × 60",
    surface: "Boarded, sand-filled turf",
    format: "Full-size",
    location: "Worthington — 535 Lakeview Plaza Blvd",
  },
  blue: {
    label: "Blue Field",
    dimensions: "110 × 60",
    surface: "Boarded, sand-filled turf",
    format: "Full-size",
    location: "Worthington — 535 Lakeview Plaza Blvd",
  },
  yellow: {
    label: "Yellow Field",
    dimensions: "130 × 45",
    surface: "Sand-filled turf",
    format: "Built for 6v6",
    location: "Downtown — 980 E Starr Ave",
  },
};

/** Resolve a venue's display name to its FieldInfo, or null if unknown. */
export function fieldInfoForName(name: string): FieldInfo | null {
  const key = name.toLowerCase().replace(/\bfield\b/g, "").trim();
  return FIELD_INFO[key] ?? null;
}
```

- [ ] **Step 2: Wire names + info card into `FieldCalendar`**

In `src/components/soccerone/FieldCalendar.tsx`:

- Import `fieldInfoForName` from `@/lib/soccerone/field-info`.
- The field selector currently labels options as `Field ${n}`. Map each selectable field to its venue name via the `venues` prop, and label options with the venue name (falling back to `Field N` if no venue name). Read the file's selector (`<select value={selectedField} …>` ~397–410) and the `venues`/`availability.fields` wiring, then render `venues.find(...)?.name ?? \`Field ${n}\``.
- Below the selector (or in the Request Slot panel), render the selected field's info card from `fieldInfoForName(selectedVenueName)`: dimensions, surface, format, location. Style with the existing SoccerOne tokens (mono labels, muted values) consistent with the surrounding panel. If `fieldInfoForName` returns null, render nothing (no broken card).

- [ ] **Step 3: Build + tsc**

Run: `./scripts/with-bws.sh npm run build` → succeeds; `npx tsc --noEmit` → zero errors.

- [ ] **Step 4: Browser check (controller-assisted)**

Load `?facility=worthington` — selector shows **Orange Field** / **Blue Field** with a "110 × 60 · Boarded sand-filled turf · Full-size" card; `?facility=downtown` shows **Yellow Field** with "130 × 45 · Built for 6v6". Controller runs it.

- [ ] **Step 5: Commit**

```bash
git add src/lib/soccerone/field-info.ts src/components/soccerone/FieldCalendar.tsx
git commit -m "feat(rentals): real field names + per-field info cards (SoccerOne)"
```

---

## Task 5: Futsal "Coming September" + interest capture

**Files:**
- Create: `src/lib/db/schema/futsal-interest.ts`
- Modify: `src/lib/db/schema/index.ts` (export)
- Create: migration (`npm run db:generate`)
- Create: `src/pages/api/soccerone/futsal-interest.ts`
- Create: `tests/api/soccerone/futsal-interest.test.ts`
- Modify: `src/pages/soccerone/rent.astro` (futsal section)

**Interfaces:**
- Produces: `POST /api/soccerone/futsal-interest` `{ email }` → `200 { ok: true }` (idempotent on duplicate email); `422` on invalid email.

- [ ] **Step 1: Schema**

Create `src/lib/db/schema/futsal-interest.ts`:

```ts
import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";

export const futsalInterest = pgTable(
  "futsal_interest",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "set null",
    }),
    email: text("email").notNull(),
    emailCanonical: text("email_canonical").notNull().unique(),
    source: text("source").notNull().default("rent_page"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("futsal_interest_created_idx").on(t.createdAt)],
);

export type FutsalInterest = typeof futsalInterest.$inferSelect;
```

Add `export * from "./futsal-interest";` to `src/lib/db/schema/index.ts`.

- [ ] **Step 2: Generate migration**

Run: `cd /Volumes/MahadData/Aspire-Sports/web-app-rentals-ux && ./scripts/with-bws.sh npm run db:generate`
Expected: a new `src/lib/db/migrations/NNNN_*.sql` creating `futsal_interest`. Review it (plain `CREATE TABLE` — no enum hazard). Commit it. **The controller applies it to staging before the endpoint test.**

- [ ] **Step 3: Endpoint (write the failing test first)**

Create `tests/api/soccerone/futsal-interest.test.ts`:

```ts
import { describe, it, expect } from "vitest";
const BASE = process.env.TEST_BASE_URL ?? "http://localhost:4321";

function post(body: unknown) {
  return fetch(`${BASE}/api/soccerone/futsal-interest`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/soccerone/futsal-interest", () => {
  it("422 on invalid email", async () => {
    const res = await post({ email: "nope" });
    expect(res.status).toBe(422);
  });

  it("200 on a valid email, idempotent on duplicate", async () => {
    const email = `futsal_${Date.now()}@test.aspiresports.com`;
    const first = await post({ email });
    expect(first.status).toBe(200);
    expect((await first.json()).ok).toBe(true);
    const dup = await post({ email });
    expect(dup.status).toBe(200); // idempotent, not 409
  });
});
```

- [ ] **Step 4: Run the test to see it fail**

Run: `TEST_BASE_URL=http://localhost:4321 npm run test:api -- soccerone/futsal-interest`
Expected: FAIL (404 — endpoint not created yet).

- [ ] **Step 5: Implement the endpoint**

Create `src/pages/api/soccerone/futsal-interest.ts`:

```ts
import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { futsalInterest } from "@/lib/db/schema/futsal-interest";

export const prerender = false;

const json = (b: unknown, s: number) =>
  new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const POST: APIRoute = async ({ request, locals }) => {
  let body: { email?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  const email = (body.email ?? "").trim();
  if (!email || !EMAIL_RX.test(email)) {
    return json({ error: "A valid email is required" }, 422);
  }
  await getDb()
    .insert(futsalInterest)
    .values({
      organizationId: locals.organization?.id ?? null,
      email,
      emailCanonical: email.toLowerCase(),
      source: "rent_page",
    })
    .onConflictDoNothing({ target: futsalInterest.emailCanonical });
  return json({ ok: true }, 200);
};
```

- [ ] **Step 6: Run the test to pass**

Run: `TEST_BASE_URL=http://localhost:4321 ./scripts/with-bws.sh npm run test:api -- soccerone/futsal-interest`
Expected: PASS (422 invalid; 200 valid + idempotent). (`with-bws` gives the test process no DB need here — it's HTTP-only — but harmless; the running dev server has the migrated table once the controller applies the migration.)

- [ ] **Step 7: Futsal section + capture form on `rent.astro`**

Add a "Futsal — Coming September" section to `src/pages/soccerone/rent.astro` (SoccerOne styling): a heading, one line ("Indoor futsal courts open this September at Worthington. Join the list — we'll email you the moment booking opens."), and a small inline email form that POSTs to `/api/soccerone/futsal-interest` and shows a "You're on the list" confirmation. Since `rent.astro` is Astro, implement the form handler as a tiny inline `<script>` (fetch on submit) or a small React island — prefer a minimal inline `<script>` to avoid a new island. No court count.

- [ ] **Step 8: Build + tsc + commit**

Run: `./scripts/with-bws.sh npm run build` → succeeds; `npx tsc --noEmit` → zero errors.

```bash
git add src/lib/db/schema/futsal-interest.ts src/lib/db/schema/index.ts src/lib/db/migrations src/pages/api/soccerone/futsal-interest.ts tests/api/soccerone/futsal-interest.test.ts src/pages/soccerone/rent.astro
git commit -m "feat(rentals): futsal Coming September section + interest capture"
```

---

## Task 6: Interim waiver-expectation copy (both brands)

**Files:**
- Modify: `src/components/soccerone/FieldCalendar.tsx`
- Modify: `src/components/rentals/RentalBooking.tsx`

**Interfaces:**
- Produces: both booking UIs state that every player must have a signed waiver on file. No functional waiver change; no promise of the emailed per-player flow.

- [ ] **Step 1: FieldCalendar (SoccerOne) waiver copy**

In `src/components/soccerone/FieldCalendar.tsx`, near the existing waiver block (the "Liability waiver" area / `waiverAccepted` checkbox), add a clear line: **"Every player must have a signed waiver on file to play. You'll confirm your roster and waivers after your request is approved."** Keep it a requirement statement — do NOT describe an emailed-link flow (Sub-project 2). Read the current waiver block first and place the copy consistently.

- [ ] **Step 2: RentalBooking (Aspire) waiver copy**

In `src/components/rentals/RentalBooking.tsx`, near the "Liability waiver" block (~line 306–332), add the same requirement line, styled with the Aspire (stone/cream) tokens already used there.

- [ ] **Step 3: Build + tsc**

Run: `./scripts/with-bws.sh npm run build` → succeeds; `npx tsc --noEmit` → zero errors.

- [ ] **Step 4: Confirm Aspire has no member UI**

Grep `src/components/rentals/RentalBooking.tsx` and `src/pages/rentals/index.astro` for "member"/"save"/"sign in to save" — confirm nothing advertises a member rental discount (the endpoint no longer applies one after Task 1). If any such copy exists, remove it. Report what you found.

- [ ] **Step 5: Commit**

```bash
git add src/components/soccerone/FieldCalendar.tsx src/components/rentals/RentalBooking.tsx
git commit -m "feat(rentals): waiver-required copy on both brands (interim, pre per-player signing)"
```

---

## Final verification (before PR)

- [ ] `npx tsc --noEmit` → zero errors.
- [ ] `./scripts/with-bws.sh npm run build` → succeeds.
- [ ] `TEST_BASE_URL=http://localhost:4321 npm run test:api -- rentals soccerone/futsal-interest` → green (transient Railway ECONNRESET blips re-run clean).
- [ ] Browser (both facilities + Aspire `/rentals`): SoccerOne shows Orange/Blue (Worthington) / Yellow (Downtown) with info cards, no member text, no numbered headers, futsal section + working capture, waiver-required copy; Aspire `/rentals` shows waiver-required copy and no member discount messaging.
- [ ] Venue correction dry-run reviewed; controller applied `APPLY=yes` to staging + prod.

## Spec coverage check

Spec §1 (field data) → T2; §2 (copy) → T2/T3; §3 (member removal UI+logic) → T1/T3; §4 (numbered) → T3; §5 (field info cards) → T4; §6 (futsal) → T5; §7 (interim waiver copy) → T6; §8 (Aspire propagation) → T1 (shared endpoint) + T6 (waiver) + T6 Step 4 (member-UI check).
