# Guest Rental Requests + Account-at-Payment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Let a guest submit a rental request with no account (name/email/phone + waiver); create the account at payment via an emailed **claim link** that attaches the pending booking to the new user and drops them into the existing dashboard pay/roster/waiver flow.

**Architecture:** `field_rentals` already stores guest contact + a nullable `renterUserId`. Remove the sign-in gate on the request; on approval of a guest booking, mint a `rental_claim` self-serve token and point the approval email at `/rentals/claim/[token]`; the claim page/endpoint creates-or-signs-in a user (email trusted via the token), sets `renterUserId`, and creates a session. Everything downstream is unchanged.

**Tech Stack:** Astro 5 (SSR), React 19, Drizzle + Postgres, Lucia auth, Stripe, Vitest, Playwright. Reuses `self_service_tokens`, the rental messaging, and the existing `/dashboard/bookings` pay/roster flow.

## Global Constraints

- **Both brands** via the shared endpoint; brand from `field_rentals.brand`.
- **Auth is shared infra — reuse, don't hand-roll:** `hashPassword`/`verifyPassword` (`@/lib/auth`), `createSession(userId, context)` (`@/lib/auth/session`), `normalizeForUniqueness` (the email-canonical helper signin/signup use). Users insert shape: `{ email, emailCanonical, passwordHash, firstName, lastName, phone, emailVerified }`.
- **The claim token is the capability.** Only mint/act on it for the specific rental; a claim requires a valid unconsumed+unexpired token AND the rental still unclaimed (`renterUserId IS NULL`). Email is locked to `rental.renterEmail` (trusted → `emailVerified: true`). No email-match auto-claim.
- **Public writes are rate-limited** by IP (`@/lib/auth/rate-limit`): the guest request endpoint and the claim endpoint.
- **Migrations:** the one new enum value `rental_claim` is added `IF NOT EXISTS`, isolated per the 55P04 lesson; controller applies to staging before DB tests, prod on merge.
- **Don't change** approve/decline mechanics, Stripe, pricing, or the per-player waiver system — only guest access + the claim attach.
- **Verify:** `npm run build`, `npx tsc --noEmit` 0 errors, affected API/unit tests green. SoccerOne can't be browser-verified on localhost (301 to prod); Aspire `/rentals` is verifiable and is where the E2E runs.

---

## File Structure

- Modify `src/lib/db/schema/self-service-tokens.ts` — add `rental_claim` kind (+ migration).
- Modify `src/lib/check-in/resolve-signer.ts` — `rental_claim` is NOT a signer kind; keep it out of `SELF_SERVICE_KINDS` (it's not a waiver/photo target). (No signer resolution needed.)
- Modify `src/pages/api/rentals/bookings/index.ts` — guest support + rate-limit.
- Modify `src/lib/rentals/messages/dispatch.ts` — approval/confirmation email URL = claim link for guests.
- Create `src/lib/rentals/claim.ts` — `mintRentalClaimToken(rental)` + `claimRentalForUser(db, rentalId, userId)` helpers.
- Create `src/pages/api/rentals/claim/[token].ts` — POST (create-account | sign-in → claim → session).
- Create `src/pages/rentals/claim/[token].astro` — the claim page (form / redirect).
- Modify `src/components/soccerone/FieldCalendar.tsx` + `src/components/rentals/RentalBooking.tsx` — guest fields + drop sign-in gate; `signedIn` prop.
- Modify `src/pages/soccerone/rent.astro` + `src/pages/rentals/index.astro` — pass `signedIn` (+ prefill).
- Tests under `tests/api/rentals/`, `tests/unit/`, `tests/e2e/`.

---

## Task 1: Schema — `rental_claim` token kind

**Files:** Modify `src/lib/db/schema/self-service-tokens.ts`; create migration.

**Interfaces:** Produces `rental_claim` on `self_service_token_kind`.

- [ ] **Step 1:** In `selfServiceTokenKindEnum`, add `"rental_claim"` (after `"rental_player"`):
```ts
export const selfServiceTokenKindEnum = pgEnum("self_service_token_kind", [
  "drop_in_booking", "field_rental", "rental_player", "rental_claim",
  "roster_entry", "walkin_session", "email_consent",
]);
```
- [ ] **Step 2:** Confirm `rental_claim` is NOT added to `SELF_SERVICE_KINDS` / `SelfServiceKind` in `resolve-signer.ts` (it's a claim capability, never routed through waiver/photo/check-in). Leave those as-is.
- [ ] **Step 3:** `./scripts/with-bws.sh npm run db:generate`. In the generated SQL ensure the line reads `ALTER TYPE "public"."self_service_token_kind" ADD VALUE IF NOT EXISTS 'rental_claim' BEFORE 'roster_entry';` and nothing in the same file uses it (safe).
- [ ] **Step 4:** `npx tsc --noEmit` → 0 errors. Commit:
```bash
git add src/lib/db/schema/self-service-tokens.ts src/lib/db/migrations
git commit -m "feat(rentals): rental_claim self-serve token kind"
```
> Controller applies the migration to staging before Tasks 2/4/5 DB tests.

---

## Task 2: Booking endpoint — guest support

**Files:** Modify `src/pages/api/rentals/bookings/index.ts`; Modify `tests/api/rentals/bookings.test.ts`; create `tests/api/rentals/guest-request.test.ts`.

**Interfaces:** Consumes nothing new. Produces: `POST /api/rentals/bookings` accepts a guest (no session) with `{ renterName, renterEmail, renterPhone? }` and creates a `requested` row with `renterUserId = null`.

- [ ] **Step 1: Remove the 401 in POST, branch on session.**
In `src/pages/api/rentals/bookings/index.ts`, the `POST` currently starts with `if (!locals.user) return json({ error: "Unauthorized" }, 401);` (line ~75). Replace with a rate-limit + guest/user resolution:
```ts
  // Rate-limit guest submissions (public unauthenticated write path).
  if (!locals.user) {
    const ip = clientAddress || "unknown";
    const rl = rateLimit(`rental-request:ip:${ip}`, 8, 60_000);
    if (!rl.allowed) return rateLimitedResponse(rl.retryAfter ?? 60);
  }
```
Add `clientAddress` to the handler context params and import `rateLimit, rateLimitedResponse` from `@/lib/auth/rate-limit`.

- [ ] **Step 2: Resolve renter identity (user or guest).**
After the body is parsed + validated (keep the existing `validateRentalBookingRequest`), compute:
```ts
  // Guest path: no session. Require contact fields; store renterUserId = null.
  let renterUserId: string | null = null;
  let renterName: string;
  let renterEmail: string | null;
  let renterPhone: string | null = null;
  if (locals.user) {
    renterUserId = locals.user.id;
    renterName = waiverName;                 // signed-in: waiver name is the renter
    renterEmail = locals.user.email;
  } else {
    const gName = (body.renterName as string | undefined)?.trim() || waiverName;
    const gEmail = (body.renterEmail as string | undefined)?.trim() ?? "";
    if (!gName) return json({ error: "Your name is required" }, 422);
    if (!gEmail || gEmail.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(gEmail)) {
      return json({ error: "A valid email is required" }, 422);
    }
    renterName = gName;
    renterEmail = gEmail;
    renterPhone = (body.renterPhone as string | undefined)?.trim() || null;
  }
```
Then in BOTH `createRentalRequest(...)` call sites (the request-mode create) pass `renterUserId`, `renterName`, `renterEmail`, `renterPhone`, `createdByUserId: renterUserId` (was `locals.user.id`). Search the file for `renterUserId: locals.user.id` / `renterEmail: locals.user.email` / `createdByUserId: locals.user.id` and replace with the resolved vars. (There is one `createRentalRequest` call in request-mode — update it.)

- [ ] **Step 3: Keep GET authed.**
Leave `GET /api/rentals/bookings`'s `if (!locals.user) return 401` as-is (a guest has no "my rentals" list until they claim).

- [ ] **Step 4: Update `bookings.test.ts`.**
The existing "401 when not authenticated" test for POST must change — a guest POST is now allowed. Change it to assert a guest request with contact succeeds:
```ts
  it("guest (no auth) can request with contact info", async () => {
    const res = await fetch(`${BASE}/api/rentals/bookings`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validBody({ fieldNumber: 1, ...slot(12, 1),
        renterName: "Guest Gal", renterEmail: `guest_${Date.now()}@test.aspiresports.com` })),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).requested).toBe(true);
  });
```
(`validBody` already includes waiver fields; add renterName/renterEmail to the guest case.)

- [ ] **Step 5: New guest test file** `tests/api/rentals/guest-request.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { eq, desc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { fieldRentals } from "@/lib/db/schema/field-rentals";
import { E2E_RENTAL_VENUE_ID } from "@/lib/db/seeds/seed-e2e-tests";
const BASE = process.env.TEST_BASE_URL ?? "http://localhost:4321";
const RUN = Date.UTC(2045, 0, 1) + Math.floor(Math.random()*3_650)*86_400_000;
const slot = (h:number)=>({ startsAt:new Date(RUN+h*3_600_000).toISOString(), endsAt:new Date(RUN+(h+1)*3_600_000).toISOString() });
const body = (o={}) => ({ venueId: E2E_RENTAL_VENUE_ID, fieldNumber: 5, ...slot(10), partySize: 6, waiverAccepted: true, waiverName: "Guest Gal", ...o });
function post(b:unknown){ return fetch(`${BASE}/api/rentals/bookings`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(b)}); }

describe("guest rental request", () => {
  it("422 when guest omits email", async () => {
    const res = await post(body({ renterName: "No Email" }));
    expect(res.status).toBe(422);
  });
  it("200 + renterUserId null + email stored", async () => {
    const email = `guest_${Date.now()}@test.aspiresports.com`;
    const res = await post(body({ fieldNumber: 6, renterName: "Guest Gal", renterEmail: email }));
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.requested).toBe(true);
    const [row] = await getDb().select({ renterUserId: fieldRentals.renterUserId, renterEmail: fieldRentals.renterEmail })
      .from(fieldRentals).where(eq(fieldRentals.id, j.rentalId)).limit(1);
    expect(row.renterUserId).toBeNull();
    expect(row.renterEmail).toBe(email);
  });
});
```

- [ ] **Step 6:** Run: `TEST_BASE_URL=http://localhost:4321 E2E_TEST_ENDPOINTS=yes ALLOW_E2E_SEED=yes ./scripts/with-bws.sh npm run test:api -- rentals/guest-request rentals/bookings` → PASS. `npx tsc --noEmit` → 0. Commit:
```bash
git add src/pages/api/rentals/bookings/index.ts tests/api/rentals/bookings.test.ts tests/api/rentals/guest-request.test.ts
git commit -m "feat(rentals): allow guest rental requests (no account, rate-limited)"
```

---

## Task 3: Claim helpers + approval email → claim link

**Files:** Create `src/lib/rentals/claim.ts`; Modify `src/lib/rentals/messages/dispatch.ts`; Test: `tests/api/rentals/claim-link.test.ts`.

**Interfaces:**
- Produces `mintRentalClaimToken(rental): Promise<string>` (returns the token value; reuses `mintToken`, kind `rental_claim`, targetId = rental id, `recipientEmail = rental.renterEmail`, long TTL).
- Produces `claimRentalForUser(rentalId: string, userId: string): Promise<boolean>` — sets `renterUserId = userId` WHERE id = rentalId AND `renterUserId IS NULL`; returns whether a row was updated.
- Changes the approval/confirmation email so a guest booking's `payUrl` is the claim link.

- [ ] **Step 1: `src/lib/rentals/claim.ts`:**
```ts
import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { fieldRentals, type FieldRental } from "@/lib/db/schema/field-rentals";
import { mintToken } from "@/lib/check-in/tokens-db";

const CLAIM_TTL_HOURS = 24 * 30; // must outlive the 24h pay window + reminders

export async function mintRentalClaimToken(rental: FieldRental): Promise<string> {
  const t = await mintToken({
    kind: "rental_claim",
    targetId: rental.id,
    organizationId: rental.organizationId,
    venueId: rental.venueId,
    sentVia: "email",
    recipientUserId: null,
    recipientEmail: rental.renterEmail,
    recipientPhone: rental.renterPhone,
    createdByUserId: null,
    ttlHours: CLAIM_TTL_HOURS,
  });
  return t.token;
}

/** Attach a still-unclaimed rental to a user. Returns false if already claimed. */
export async function claimRentalForUser(rentalId: string, userId: string): Promise<boolean> {
  const rows = await getDb()
    .update(fieldRentals)
    .set({ renterUserId: userId, updatedAt: new Date() })
    .where(and(eq(fieldRentals.id, rentalId), isNull(fieldRentals.renterUserId)))
    .returning({ id: fieldRentals.id });
  return rows.length > 0;
}
```
> Confirm `mintToken`'s input accepts `ttlHours` (it does — `input.ttlHours ?? DEFAULT_TTL_HOURS`).

- [ ] **Step 2: Approval email URL is claim-aware (`dispatch.ts`).**
`loadRentalForMessage` selects the rental fields for the email. Add `renterUserId: fieldRentals.renterUserId` to that select. In `dispatchRequestLifecycle` where `payUrl` is set (currently `kind === "approved" ? \`${APP_URL}/dashboard/bookings\` : null`, ~line 183), make it claim-aware for guests:
```ts
  let payUrl: string | null = null;
  if (kind === "approved") {
    if (row.renterUserId) {
      payUrl = `${APP_URL}/dashboard/bookings`;
    } else {
      const token = await mintRentalClaimToken(/* the full rental row */);
      payUrl = `${APP_URL}/rentals/claim/${token}`;
    }
  }
```
`mintRentalClaimToken` needs the full `FieldRental` (id, organizationId, venueId, renterEmail, renterPhone). Either widen `loadRentalForMessage`'s select to include those (it already has most) or re-fetch the rental row inside the guest branch. Keep it minimal — add the missing columns to the select and pass an object with them. Import `mintRentalClaimToken` from `@/lib/rentals/claim`. Do the same claim-aware URL for the `dispatchRentalConfirmation` ($0/comp) email so a $0 guest also gets a manage/claim link (no payment, but they can claim to add players).

- [ ] **Step 3: Test** `tests/api/rentals/claim-link.test.ts` (direct-DB): seed an approved guest `pending_payment` rental (renterUserId null, renterEmail set); assert `mintRentalClaimToken` returns a token that `verifyToken` resolves with kind `rental_claim` + targetId = rental id; assert `claimRentalForUser(rentalId, userId)` sets renterUserId and a second call returns false (already claimed).
```ts
// seed rental with renterUserId null; then:
const token = await mintRentalClaimToken(rental);
const v = await verifyToken(token);
expect(v.ok && v.token.kind).toBe("rental_claim");
expect(await claimRentalForUser(rental.id, SOME_USER_ID)).toBe(true);
expect(await claimRentalForUser(rental.id, SOME_USER_ID)).toBe(false);
```
Use `E2E_ORG_ID`, `E2E_RENTAL_VENUE_ID`, and the parent user id (via `/api/auth/me` like `pay.test.ts`) for `SOME_USER_ID`.

- [ ] **Step 4:** Run `... npm run test:api -- rentals/claim-link` → PASS; `tsc` 0. Commit:
```bash
git add src/lib/rentals/claim.ts src/lib/rentals/messages/dispatch.ts tests/api/rentals/claim-link.test.ts
git commit -m "feat(rentals): claim token + approval email links guests to the claim page"
```

---

## Task 4: Claim endpoint + page — create account / sign in → claim → session

**Files:** Create `src/pages/api/rentals/claim/[token].ts`; Create `src/pages/rentals/claim/[token].astro`; Test: `tests/api/rentals/claim.test.ts`.

**Interfaces:** Consumes Task 1 (kind), Task 3 (`claimRentalForUser`). Produces the guest→account→claim→session flow.

- [ ] **Step 1: The claim API** `src/pages/api/rentals/claim/[token].ts`:
```ts
/**
 * POST /api/rentals/claim/:token
 * Body: { mode: "signup" | "signin", password: string, name?: string }
 * Verifies the rental_claim token, then either creates a user (email trusted
 * from the rental — emailVerified true) or signs an existing one in, attaches
 * the pending rental (renterUserId), consumes the token, and creates a session.
 */
import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema/users";
import { fieldRentals } from "@/lib/db/schema/field-rentals";
import { verifyToken, consumeToken } from "@/lib/check-in/tokens-db";
import { hashPassword, verifyPassword } from "@/lib/auth";
import { createSession } from "@/lib/auth/session";
import { normalizeForUniqueness } from "@/lib/auth/email";           // confirm the real path signin uses
import { claimRentalForUser } from "@/lib/rentals/claim";
import { rateLimit, rateLimitedResponse } from "@/lib/auth/rate-limit";

export const prerender = false;
const json = (b: unknown, s: number) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

export const POST: APIRoute = async (ctx) => {
  const { params, request, clientAddress } = ctx;
  const ip = clientAddress || "unknown";
  const rl = rateLimit(`rental-claim:ip:${ip}`, 10, 60_000);
  if (!rl.allowed) return rateLimitedResponse(rl.retryAfter ?? 60);

  const v = await verifyToken(params.token ?? "");
  if (!v.ok) return json({ error: v.reason }, v.reason === "expired" || v.reason === "consumed" ? 410 : 404);
  const tok = v.token;
  if (tok.kind !== "rental_claim") return json({ error: "not_found" }, 404);

  const db = getDb();
  const [rental] = await db.select().from(fieldRentals).where(eq(fieldRentals.id, tok.targetId)).limit(1);
  if (!rental) return json({ error: "rental_not_found" }, 404);
  if (rental.renterUserId) return json({ error: "already_claimed" }, 409);
  if (!rental.renterEmail) return json({ error: "no_email_on_rental" }, 422);

  let body: { mode?: string; password?: string; name?: string };
  try { body = await request.json(); } catch { return json({ error: "Invalid JSON body" }, 400); }
  const password = body.password ?? "";
  if (password.length < 8) return json({ error: "Password must be at least 8 characters" }, 422);

  const emailCanonical = normalizeForUniqueness(rental.renterEmail);
  const existing = await db.query.users.findFirst({ where: eq(users.emailCanonical, emailCanonical) });

  let userId: string;
  if (body.mode === "signin") {
    if (!existing || !existing.passwordHash || !(await verifyPassword(password, existing.passwordHash))) {
      return json({ error: "Wrong email or password" }, 401);
    }
    userId = existing.id;
  } else {
    if (existing) return json({ error: "account_exists" }, 409); // tell the UI to switch to sign-in
    const [first, ...rest] = (body.name ?? rental.renterName).trim().split(/\s+/);
    const [u] = await db.insert(users).values({
      email: rental.renterEmail.toLowerCase(),
      emailCanonical,
      passwordHash: await hashPassword(password),
      firstName: first ?? rental.renterName,
      lastName: rest.join(" ") || null,
      phone: rental.renterPhone,
      emailVerified: true, // the claim token proves ownership of this email
    }).returning();
    userId = u.id;
  }

  const claimed = await claimRentalForUser(rental.id, userId);
  if (!claimed) return json({ error: "already_claimed" }, 409); // raced
  await consumeToken(tok.token, ip);
  await createSession(userId, ctx);
  return json({ ok: true, redirect: "/dashboard/bookings" }, 200);
};
```
> Confirm the real import paths: `normalizeForUniqueness` (grep how `signin.ts` imports it), `consumeToken` signature (grep `tokens-db.ts`), and `users` schema field names. Adapt to reality; the SHAPE above is the contract.

- [ ] **Step 2: The claim page** `src/pages/rentals/claim/[token].astro` (SSR, `prerender = false`):
- Verify the token server-side (reuse `verifyToken`); load the rental (venue name, when, amountDue, brand, renterEmail, renterUserId).
- If token invalid/expired/consumed → a friendly "This link has expired — call/text (614) 749-9782" page.
- If `rental.renterUserId` set → if `Astro.locals.user?.id === rental.renterUserId` redirect to `/dashboard/bookings`; else a neutral "already claimed" note.
- If `Astro.locals.user` (signed in, rental unclaimed) → claim server-side (`claimRentalForUser`) + `Astro.redirect('/dashboard/bookings')`.
- Else render a small React island (or inline form) "Create your account to pay & manage your booking": email shown read-only (`rental.renterEmail`), name prefilled (`rental.renterName`), password; primary submit POSTs `{ mode: "signup", password, name }` to `/api/rentals/claim/[token]`; on `{ ok, redirect }` → `window.location = redirect`; on `account_exists` → switch to a sign-in variant (`mode: "signin"`). Brand-aware (SoccerOne vs Aspire) via the resolved brand; keep it simple and on-brand.

- [ ] **Step 3: Test** `tests/api/rentals/claim.test.ts` (HTTP + direct-DB): seed an approved guest rental (renterUserId null, unique renterEmail); mint a claim token; then:
  - invalid token → 404; 
  - signup with a fresh email → 200 `{ ok, redirect }`, and the rental's `renterUserId` is now set + a `users` row exists with that email `emailVerified=true` + token consumed;
  - a second claim on the same (now-claimed) rental → 409;
  - signup where the email already has an account → 409 `account_exists`;
  - signin mode with correct password on an existing account → 200 + claimed.
  (Model setup on `pay.test.ts`; create the "existing account" via the seed parent user or a fresh signup.)

- [ ] **Step 4:** Run `... npm run test:api -- rentals/claim` → PASS; `tsc` 0; `./scripts/with-bws.sh npm run build` succeeds. Commit:
```bash
git add src/pages/api/rentals/claim src/pages/rentals/claim tests/api/rentals/claim.test.ts
git commit -m "feat(rentals): claim page + endpoint — guest creates account at payment, claims booking"
```

---

## Task 5: Request UI — guest fields on both brands

**Files:** Modify `src/components/soccerone/FieldCalendar.tsx`, `src/components/rentals/RentalBooking.tsx`, `src/pages/soccerone/rent.astro`, `src/pages/rentals/index.astro`; Modify `tests/e2e/field-rentals.spec.ts`.

**Interfaces:** Consumes Task 2 (endpoint accepts guest body).

- [ ] **Step 1: Pass `signedIn` from the pages.**
- `src/pages/soccerone/rent.astro`: `<FieldCalendar … signedIn={!!Astro.locals.user} />`.
- `src/pages/rentals/index.astro`: pass `signedIn={!!Astro.locals.user}` to `RentalBooking` (add the prop).

- [ ] **Step 2: `FieldCalendar.tsx` — drop the gate, add guest fields.**
- Add `signedIn?: boolean` to props (default false — safe: an un-prop'd caller just shows guest fields, and the endpoint still accepts them).
- Remove the `needsSignIn` state + the "Sign in to request" CTA branch (the `{needsSignIn ? (...sign in...) : (...)}` around line 765). Always show the request form.
- When `!signedIn`, render three inputs in the request panel above/near the waiver: **Full name** (also used as the waiver signer name — you can bind the existing `waiverName` to this), **Email** (required), **Phone** (optional). When `signedIn`, keep today's behavior (no contact fields; the account provides them).
- `handleBook`: include `renterName`, `renterEmail`, `renterPhone` in the POST body when `!signedIn`. Disable submit until name + email (+ waiver) are provided for guests. On a 401 (shouldn't happen now) drop the old `setNeedsSignIn` path.

- [ ] **Step 3: `RentalBooking.tsx` (Aspire) — same.** Add `signedIn` prop, drop any sign-in gate, add the guest name/email/phone fields when not signed in, include them in the POST. Mirror Step 2 with Aspire (stone/cream) styling.

- [ ] **Step 4: E2E** `tests/e2e/field-rentals.spec.ts`: change the flow to a **guest** request (do NOT sign in): go to `/rentals`, fill the field/date/party, fill the new guest **name + email**, accept the waiver, click "Request this slot", assert "Request submitted". Keep `waitForHydration`. (This proves the headline win — a guest can request with no account.) If a separate signed-in spec is valuable, keep one, but the primary path is guest.

- [ ] **Step 5:** `./scripts/with-bws.sh npm run build` → succeeds; `npx tsc --noEmit` → 0. (Controller runs the Aspire E2E.) Commit:
```bash
git add src/components/soccerone/FieldCalendar.tsx src/components/rentals/RentalBooking.tsx src/pages/soccerone/rent.astro src/pages/rentals/index.astro tests/e2e/field-rentals.spec.ts
git commit -m "feat(rentals): guest request fields on both brands (no sign-in to request)"
```

---

## Final verification (before PR)

- [ ] `npx tsc --noEmit` 0; `./scripts/with-bws.sh npm run build` Complete.
- [ ] `TEST_BASE_URL=http://localhost:4321 E2E_TEST_ENDPOINTS=yes ALLOW_E2E_SEED=yes ./scripts/with-bws.sh npm run test:api -- rentals` green (transient Railway blips re-run clean).
- [ ] Controller applied the Task 1 migration to staging.
- [ ] Aspire E2E: `PLAYWRIGHT_BASE_URL=http://localhost:4321 npm test -- field-rentals` green (guest request).
- [ ] Manual (Aspire): guest requests on `/rentals` with no account → "Request submitted"; approve it in admin → the approval email's link is `/rentals/claim/<token>`; open it (signed out) → create account (email locked) → lands on `/dashboard/bookings` with the rental claimed and "Pay now" available.

## Spec coverage
§1 request UI → T5; §2 endpoint guest → T2; §3 approval claim link → T3; §4 claim page/endpoint → T4; §5 downstream unchanged → (verified, no change); §6 Aspire parity → T5; schema `rental_claim` → T1; tests → each task.
