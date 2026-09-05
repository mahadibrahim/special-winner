# Guest Trial Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a signed-out parent book a free youth class trial inline in the `/youth/classes` modal (email + kid + waiver), instead of hard-bouncing to magic-link sign-in.

**Architecture:** A new public `POST /api/classes/guest-trial` endpoint composes existing primitives — `upsertGuestUser` → `resolvePerson` (dependent) → `createChildClassBooking` — with COPPA consent stamping, Turnstile, and rate limits. The modal (`trial-booking.tsx`) gains guest phases in place of the sign-in redirect. An org-wide kid name+DOB trial-dedupe guard lands in `book-child.ts` so both guest and signed-in paths share it.

**Tech Stack:** Astro API routes, Drizzle, Lucia, Zod, Cloudflare Turnstile, PostHog (client `track()`), Vitest API tests, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-05-guest-trial-flow.md` (all owner decisions resolved 2026-09-05: go; existing emails get a sign-in link, never a booking; guards = kid name+DOB dedupe + daily IP cap + Turnstile).

## Global Constraints

- Work on a fresh branch `feat/youth-guest-trial` in its own worktree (superpowers:using-git-worktrees). Small CI-gated PR; the owner merges.
- Analytics: intent-named events only, snake_case props, ids/enums only — **no PII in event props** (no emails, no names, no DOBs).
- Waiver copy: reuse `DROPIN_WAIVER_TEXT` + `waiverAssentSentence("guardian", …)` — never new legal copy.
- Signing/consent audit `ipAddress`/`userAgent` come from request context (`clientAddress`, `user-agent` header) — never the body.
- Existing signed-in modal behavior must not change (all current phases and the `#624` event emissions stay as-is).
- `tests/api/` tests hit the running dev server (`npm run dev` with `E2E_TEST_ENDPOINTS=yes`); Playwright specs need `waitForHydration(page)` before interactions.
- No schema changes → no migration (the COPPA columns already exist on `family_members`).

## File Structure

- `src/lib/classes/book-child.ts` — modify: org-wide name+DOB trial dedupe in the trial branch.
- `src/lib/analytics/events.ts` — modify: 3 new YOUTH_EVENTS + 2 new blocked reasons.
- `src/pages/api/classes/guest-trial.ts` — create: the guest endpoint.
- `src/components/youth/trial-booking.tsx` — modify: guest phases; drop the unauthed redirect.
- `tests/unit/analytics-events.test.ts` — modify: cover new events.
- `tests/api/classes/guest-trial.test.ts` — create.
- `tests/e2e/youth-classes-signup.spec.ts` — modify: guest-path spec.

---

### Task 1: Org-wide kid name+DOB trial dedupe (both paths)

**Files:**
- Modify: `src/lib/classes/book-child.ts` (trial branch, after the existing `priorTrial` check ~L400-415)
- Test: `tests/api/classes/book.test.ts` (extend)

**Interfaces:**
- Consumes: `child` row already selected earlier in `createChildClassBooking` (`firstName`, `lastName`, `birthDate`).
- Produces: no new exports; the existing `trial_already_used` error code now also fires for a same-name+DOB kid under a different account. Task 3's endpoint gets this for free by calling `createChildClassBooking`.

- [ ] **Step 1: Write the failing API test** — in `tests/api/classes/book.test.ts`, add a test that (a) signs in as the seeded parent, creates kid "Dedupe Trialkid" DOB `2018-04-01` via `POST /api/family-members`, books a trial; (b) signs in as a *second* seeded parent account, creates a kid with the same name+DOB, attempts a trial on the same template's session, and expects `409 { error: "trial_already_used" }`. Follow the file's existing sign-in/fixture helpers verbatim.

- [ ] **Step 2: Run it to verify it fails** — `CRON_SECRET=<dev> TEST_BASE_URL=http://localhost:4321 npm run test:api -- book` → the second booking currently succeeds (guard missing).

- [ ] **Step 3: Implement the guard** — in the trial branch of `book-child.ts`, directly after the existing `priorTrial` check:

```ts
      // Repeat-trial guard across ACCOUNTS (owner decision 2026-09-05): the
      // per-familyMemberId check above misses a parent re-minting the same
      // kid under a fresh guest email. Match on the kid's identity — case-
      // insensitive name + exact DOB — against any non-cancelled trial
      // booking in this org. A false positive (two real kids sharing full
      // name AND birthday) is possible but rare; support can comp a class.
      const [priorTrialSameKid] = await tx
        .select({ id: dropInBookings.id })
        .from(dropInBookings)
        .innerJoin(dropInSessions, eq(dropInSessions.id, dropInBookings.sessionId))
        .innerJoin(familyMembers, eq(familyMembers.id, dropInBookings.familyMemberId))
        .where(
          and(
            eq(dropInSessions.organizationId, session.organizationId),
            eq(dropInBookings.paymentMethod, "trial"),
            ne(dropInBookings.status, "cancelled"),
            sql`lower(${familyMembers.firstName}) = lower(${child.firstName})`,
            sql`lower(${familyMembers.lastName}) = lower(${child.lastName})`,
            child.birthDate !== null
              ? eq(familyMembers.birthDate, child.birthDate)
              : sql`false`,
          ),
        )
        .limit(1);
      if (priorTrialSameKid) {
        return err("trial_already_used", "Child has already used their trial class");
      }
```

  Add `familyMembers` and `sql` to the file's imports if not present (`familyMembers` from `@/lib/db/schema/registrations`, `sql` from `drizzle-orm`). Note `child.birthDate` is non-null for dependents in practice; the `sql\`false\`` arm keeps a null-DOB row from matching everything.

- [ ] **Step 4: Run the test again** — expect PASS. Also re-run the whole `book.test.ts` file to confirm no regression (the first booking by the same kid must still return `trial_already_used` via the original check).

- [ ] **Step 5: Commit** — `git add src/lib/classes/book-child.ts tests/api/classes/book.test.ts && git commit -m "feat(classes): trial dedupe by kid identity across accounts"`

---

### Task 2: Analytics events

**Files:**
- Modify: `src/lib/analytics/events.ts`
- Test: `tests/unit/analytics-events.test.ts` (extend, mirroring the existing YOUTH_EVENTS cases at ~L199-228)

**Interfaces:**
- Produces (Task 4 consumes): `trackTrialGuestFormShown({ templateId })`, `trackTrialGuestSubmitted({ templateId })`, `trackTrialGuestExistingAccount({ templateId })`; `TrialBlockedReason` gains `"rate_limited"` and `"turnstile_failed"`.

- [ ] **Step 1: Write failing unit tests** for the three new wrappers asserting event name + `{ template_id }` prop shape, copying the existing pattern in the file.

- [ ] **Step 2: Run** — `npx vitest run tests/unit/analytics-events.test.ts` → FAIL (exports missing).

- [ ] **Step 3: Implement** — extend `YOUTH_EVENTS`:

```ts
  trialGuestFormShown: "trial_guest_form_shown", // signed-out open -> inline guest form rendered
  trialGuestSubmitted: "trial_guest_submitted", // guest form POST fired (client, pre-response)
  trialGuestExistingAccount: "trial_guest_existing_account", // email already had an account -> sign-in link sent
```

  extend `TrialBlockedReason` with `| "rate_limited" | "turnstile_failed"`, and add:

```ts
export const trackTrialGuestFormShown = (p: { templateId: string }) =>
  track(YOUTH_EVENTS.trialGuestFormShown, { template_id: p.templateId });
export const trackTrialGuestSubmitted = (p: { templateId: string }) =>
  track(YOUTH_EVENTS.trialGuestSubmitted, { template_id: p.templateId });
export const trackTrialGuestExistingAccount = (p: { templateId: string }) =>
  track(YOUTH_EVENTS.trialGuestExistingAccount, { template_id: p.templateId });
```

- [ ] **Step 4: Run** — expect PASS.

- [ ] **Step 5: Commit** — `git commit -m "feat(analytics): guest-trial events on the youth spine"`

---

### Task 3: `POST /api/classes/guest-trial`

**Files:**
- Create: `src/pages/api/classes/guest-trial.ts`
- Test: `tests/api/classes/guest-trial.test.ts` (written in Task 5; this task ships the endpoint with a smoke assertion)

**Interfaces:**
- Consumes: `upsertGuestUser(db, { email, firstName, lastName })`; `resolvePerson(db, { kind: "dependent", parentUserId, firstName, lastName, birthDate })` → `FamilyMember`; `createChildClassBooking({ sessionId, parentUserId, familyMemberId, kind: "trial", waiver, brand })`; `verifyTurnstile(token, { secret, isProd })`; `rateLimit` / `rateLimitedResponse`; `createSession(userId, context)` from `@/lib/auth`; `createMagicLink` / `buildMagicLinkUrl` from `@/lib/auth/magic-link`; `sendMagicLinkLoginEmail` (variant `"existing"` / `"welcome"`); `recordConsent` + `hasActiveConsent` from `@/lib/consents/record`; `awaitEmailSend` from `@/lib/email/await-dispatch`; `brandFromHost`.
- Produces (Task 4 consumes): request body `{ sessionId, turnstileToken, parent: { firstName, lastName, email }, child: { firstName, lastName, birthDate }, parentalConsent: true, waiver: { signedBy, consentText } }`; responses `200 { status: "booked", bookingId }`, `200 { status: "existing_account" }`, `429 { error: "rate_limited", retryAfter }`, `403 { error: "turnstile_failed" }`, `422` zod details, plus the same error codes/statuses as `/api/classes/book` (`session_full` 409, `trial_already_used` 409, `age_ineligible` 422, `session_not_found` 404…).

- [ ] **Step 1: Create the endpoint.** Full implementation:

```ts
/**
 * POST /api/classes/guest-trial
 *
 * Signed-OUT front door for the youth free-trial modal (owner decision
 * 2026-09-05, spec: docs/superpowers/specs/2026-09-05-guest-trial-flow.md).
 * Composes the existing guest primitives; all booking gates (age, capacity,
 * one-trial-ever incl. the cross-account kid dedupe) live in
 * createChildClassBooking and are NOT duplicated here.
 *
 * Existing-email rule: an email that already has an account gets a sign-in
 * link EMAILED and NO booking — child PII is never written to an account
 * the requester hasn't proven they control. The 200 { existing_account }
 * response is an accepted, rate-limit-bounded account-existence oracle
 * (same trade the registrations guest checkout makes).
 *
 * Waiver is REQUIRED in the body: a guest by definition has no waiver on
 * file, so the attempt→422→sign round trip would be pure latency.
 */
import type { APIRoute } from "astro";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { familyMembers } from "@/lib/db/schema/registrations";
import { dropInSessions } from "@/lib/db/schema/drop-in";
import { createChildClassBooking, type ChildBookingError } from "@/lib/classes/book-child";
import { upsertGuestUser } from "@/lib/registrations/upsert-guest-user";
import { resolvePerson } from "@/lib/registrations/resolve-person";
import { verifyTurnstile } from "@/lib/auth/turnstile";
import { rateLimit, rateLimitedResponse } from "@/lib/auth/rate-limit";
import { createSession } from "@/lib/auth";
import { createMagicLink, buildMagicLinkUrl } from "@/lib/auth/magic-link";
import { sendMagicLinkLoginEmail } from "@/lib/email/send";
import { awaitEmailSend } from "@/lib/email/await-dispatch";
import { recordConsent, hasActiveConsent } from "@/lib/consents/record";
import { brandFromHost } from "@/lib/organization/soccerone-routing";

export const prerender = false;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const ERROR_STATUS: Partial<Record<ChildBookingError["code"], number>> = {
  session_not_found: 404,
  session_not_class: 400,
  session_not_scheduled: 400,
  session_started: 400,
  session_full: 409,
  already_booked: 409,
  trial_already_used: 409,
  member_child_no_trial: 409,
  age_ineligible: 422,
};

const bodySchema = z.object({
  sessionId: z.string().uuid(),
  turnstileToken: z.string().max(4096).optional().default(""),
  parent: z.object({
    firstName: z.string().trim().min(1).max(100),
    lastName: z.string().trim().min(1).max(100),
    email: z.string().trim().email().max(255),
  }),
  child: z.object({
    firstName: z.string().trim().min(1).max(100),
    lastName: z.string().trim().min(1).max(100),
    birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }),
  // COPPA: the separate affirmative parental consent for collecting this
  // child's PII. literal(true) — absence or false is a 422, same contract
  // as POST /api/family-members.
  parentalConsent: z.literal(true),
  waiver: z.object({
    signedBy: z.string().trim().min(1).max(200),
    consentText: z.string().trim().min(1),
  }),
});

export const POST: APIRoute = async (context) => {
  const { request, locals, clientAddress, url } = context;
  if (!locals.organization) return json({ error: "No organization context" }, 400);

  const ip = clientAddress ?? "unknown";
  const burst = rateLimit(`guest-trial:${ip}`, 5, 60_000);
  if (!burst.allowed) return rateLimitedResponse(burst.retryAfter ?? 60);
  // Daily cap (owner decision): bounds repeat-trial farming from one
  // connection without ever bothering a normal family.
  const daily = rateLimit(`guest-trial-day:${ip}`, 3, 24 * 3_600_000);
  if (!daily.allowed) return rateLimitedResponse(daily.retryAfter ?? 3600);

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return json({ error: "invalid_body", details: parsed.error.flatten() }, 422);
  }
  const body = parsed.data;

  const turnstileOk = await verifyTurnstile(body.turnstileToken, {
    secret: process.env.TURNSTILE_SECRET_KEY,
    isProd: process.env.NODE_ENV === "production",
  });
  if (!turnstileOk) return json({ error: "turnstile_failed" }, 403);

  const db = getDb();

  // Tenant guard, mirroring /api/classes/book: never leak cross-tenant ids.
  // classSlotTemplateId feeds the existing-account magic link's redirect so
  // the parent lands back on the exact class they tried to book.
  const [session] = await db
    .select({
      organizationId: dropInSessions.organizationId,
      classSlotTemplateId: dropInSessions.classSlotTemplateId,
    })
    .from(dropInSessions)
    .where(eq(dropInSessions.id, body.sessionId))
    .limit(1);
  if (!session || session.organizationId !== locals.organization.id) {
    return json({ error: "session_not_found", message: "Session not found" }, 404);
  }

  const brand = brandFromHost(request.headers.get("host") ?? "");
  const { userRow, wasNewUser } = await upsertGuestUser(db, {
    email: body.parent.email,
    firstName: body.parent.firstName,
    lastName: body.parent.lastName,
  });

  if (!wasNewUser) {
    // Owner decision: existing account => email a sign-in link, never book.
    // Best-effort + per-user rate-limited, the already-registered nudge
    // pattern from registrations/guest-checkout.ts.
    const gate = rateLimit(`guest-trial-existing:${userRow.id}`, 1, 10 * 60_000);
    if (gate.allowed) {
      try {
        const redirectTo = session.classSlotTemplateId
          ? `/youth/classes?trial=${session.classSlotTemplateId}#schedule`
          : "/youth/classes#schedule";
        const link = await createMagicLink({
          userId: userRow.id,
          purpose: "login",
          purposeContext: { redirectTo },
          deliveredChannel: "email",
          deliveredTo: userRow.email,
        });
        await awaitEmailSend("guest-trial existing-account link", () =>
          sendMagicLinkLoginEmail({
            userId: userRow.id,
            parentEmail: userRow.email,
            parentName: userRow.firstName || userRow.email.split("@")[0],
            magicLinkUrl: buildMagicLinkUrl(link.token, { origin: url.origin }),
            expiresIn: "15 minutes",
            brand,
            variant: "existing",
          }),
        );
      } catch (err) {
        console.error("[guest-trial] existing-account link failed:", err);
      }
    }
    return json({ status: "existing_account" }, 200);
  }

  // New account: create the kid, stamp COPPA consent, book.
  const child = await resolvePerson(db, {
    kind: "dependent",
    parentUserId: userRow.id,
    firstName: body.child.firstName,
    lastName: body.child.lastName,
    birthDate: body.child.birthDate,
  });

  // COPPA audit trail: the checkbox was the affirmative act; stamp who/
  // when/where. First flow to write these columns — deliberate (spec).
  await db
    .update(familyMembers)
    .set({
      parentalConsentGivenAt: new Date(),
      parentalConsentGivenBy: userRow.id,
      parentalConsentIp: clientAddress ?? null,
    })
    .where(eq(familyMembers.id, child.id));
  if (!(await hasActiveConsent(db, child.id, "parental"))) {
    await recordConsent({
      db,
      familyMemberId: child.id,
      organizationId: locals.organization.id,
      type: "parental",
      signedByUserId: userRow.id,
      signedByName: body.waiver.signedBy,
      ipAddress: clientAddress ?? null,
      userAgent: request.headers.get("user-agent"),
    });
  }

  const result = await createChildClassBooking({
    sessionId: body.sessionId,
    parentUserId: userRow.id,
    familyMemberId: child.id,
    kind: "trial",
    waiver: {
      signedBy: body.waiver.signedBy,
      consentText: body.waiver.consentText,
      ipAddress: clientAddress ?? null,
      userAgent: request.headers.get("user-agent"),
    },
    brand,
  });

  if (!result.ok) {
    // The user + kid rows stay (kiosk walk-in tolerance): dedupe absorbs a
    // retry, and the sweeper skips users with family_members/user_roles.
    const { code, message } = result.error;
    return json({ error: code, message }, ERROR_STATUS[code] ?? 400);
  }

  // New guest becomes a signed-in (1h until email-verified) parent — the
  // uniform wasNewUser-only session rule from the paid guest checkouts.
  await createSession(userRow.id, context);

  try {
    const link = await createMagicLink({
      userId: userRow.id,
      purpose: "login",
      purposeContext: { redirectTo: "/dashboard" },
      deliveredChannel: "email",
      deliveredTo: userRow.email,
    });
    await awaitEmailSend("guest-trial welcome link", () =>
      sendMagicLinkLoginEmail({
        userId: userRow.id,
        parentEmail: userRow.email,
        parentName: userRow.firstName,
        magicLinkUrl: buildMagicLinkUrl(link.token, { origin: url.origin }),
        childName: `${child.firstName}`,
        brand,
        variant: "welcome",
      }),
    );
  } catch (err) {
    console.error("[guest-trial] welcome link failed:", err);
  }

  return json({ status: "booked", bookingId: result.bookingId }, 200);
};
```

  Before committing, verify each import's exact export name/signature against the source files (`recordConsent`/`hasActiveConsent` live in `src/lib/consents/record.ts` — check the parameter object it expects and adapt; `createSession`'s second parameter is the APIContext, as used in `dropin/guest-checkout.ts` L242). If `TURNSTILE_SECRET_KEY` is named differently in `forgot-password.ts`/`signup.ts`, use the established env var name.

- [ ] **Step 2: Smoke-check by hand** against the dev server: `curl -s -X POST http://localhost:4321/api/classes/guest-trial -H 'Content-Type: application/json' -d '{}'` → expect 422 `invalid_body`.

- [ ] **Step 3: Typecheck** — `npx tsc --noEmit` → zero errors.

- [ ] **Step 4: Commit** — `git commit -m "feat(classes): guest trial endpoint — email + kid + waiver, no sign-in"`

---

### Task 4: Modal guest phases (`trial-booking.tsx`)

**Files:**
- Modify: `src/components/youth/trial-booking.tsx`

**Interfaces:**
- Consumes: Task 3's request/response contract; Task 2's track wrappers; `TurnstileWidget` + `TurnstileWidgetHandle` from `@/components/auth/turnstile-widget`.
- Produces: none (leaf component). The signed-in flow is untouched.

Behavior changes only on the unauthed branch of `openForTemplate`:

- [ ] **Step 1: State + open-flow.** Add `const [guestMode, setGuestMode] = useState(false)` plus guest form state (`guestParentFirst/Last`, `guestEmail`, `guestChildFirst/Last`, `guestChildDob`, `guestCoppaConsent`, `guestTurnstileToken`) and phases `"guest_form" | "guest_waiver" | "guest_existing"` in the `Phase` union. In `openForTemplate`, replace the redirect block:

```ts
    if (!authed) {
      // Guest mode (spec 2026-09-05): no more hard bounce. Load the same
      // schedule payload and collect email + kid + waiver inline. The
      // resume guard is kept for the "Sign in instead" escape hatch.
      setGuestMode(true)
    } else {
      setGuestMode(false)
    }
```

  …then let the existing schedule fetch run for both. After the fetch resolves, route: `setPhase(sessionsForTemplate.length === 0 ? "no_sessions" : authedFlag ? "picking" : "guest_form")`, and fire `trackTrialGuestFormShown({ templateId: id })` when entering `guest_form`. Reset all guest state in the same block that resets waiver state today.

- [ ] **Step 2: Cross-device resume.** In the mount effect, after the `PENDING_KEY` branch, read `new URLSearchParams(window.location.search).get("trial")` and, if a template id is present, `void openForTemplate(param, { resume: true })` — this is the landing point of the existing-account magic link (`/youth/classes?trial=<id>#schedule`). The `resume` flag now only suppresses duplicate-open loops (the redirect is gone).

- [ ] **Step 3: `guest_form` panel.** Render when `phase === "guest_form" && slot`: DialogTitle `Book a free trial — {slot.name}`, the day/time description (same as picking), then inputs — parent first/last name (`autoComplete="given-name"/"family-name"`), email (`type="email"`), child first/last name, child DOB (`<Input type="date" id="guest-child-dob" max={today}>`), the COPPA checkbox:

```tsx
<div className="flex items-start gap-3">
  <Checkbox id="guest-coppa" checked={guestCoppaConsent}
    onCheckedChange={(c) => setGuestCoppaConsent(c === true)} />
  <Label htmlFor="guest-coppa" className="text-sm leading-snug cursor-pointer">
    I am this child's parent or legal guardian and I consent to Aspire
    collecting their information for this class. Required by federal law
    (COPPA) for participants under 13.
  </Label>
</div>
<TurnstileWidget ref={turnstileRef} onToken={setGuestTurnstileToken} />
```

  plus a quiet escape hatch under the submit button:

```tsx
<button type="button" className="text-sm text-ink-muted underline"
  onClick={() => {
    try { sessionStorage.setItem(PENDING_KEY, templateId ?? "") } catch {}
    window.location.href = SIGNIN_REDIRECT
  }}>
  Already have an account? Sign in instead
</button>
```

  Client-side age pre-check before advancing: compute age from `guestChildDob` against `slot.minAge/maxAge` (reuse the same year-math as the server's `ageOnDate`; a local copy in the component is fine) and show the flowError inline instead of advancing. "Continue" (disabled until every field + checkbox is set) → `setWaiverSignerName(\`${guestParentFirst} ${guestParentLast}\`.trim())`, `trackTrialWaiverShown({ templateId })`, `setPhase("guest_waiver")`.

- [ ] **Step 4: `guest_waiver` + submit.** Render the same waiver panel markup as the existing `waiver` phase (checkbox + `waiverAssentSentence("guardian", \`${guestChildFirst} ${guestChildLast}\`)` + signer input prefilled). Its submit calls:

```ts
async function submitGuestBooking(session: ScheduleSession, myGeneration: number) {
  setPhase("booking")
  trackTrialGuestSubmitted({ templateId: templateId ?? "" })
  trackTrialBookingAttempted({ templateId: templateId ?? "" })
  let res: Response
  try {
    res = await fetch("/api/classes/guest-trial", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: session.id,
        turnstileToken: guestTurnstileToken,
        parent: { firstName: guestParentFirst.trim(), lastName: guestParentLast.trim(), email: guestEmail.trim() },
        child: { firstName: guestChildFirst.trim(), lastName: guestChildLast.trim(), birthDate: guestChildDob },
        parentalConsent: true,
        waiver: { signedBy: waiverSignerName.trim(), consentText: DROPIN_WAIVER_TEXT },
      }),
    })
  } catch {
    if (myGeneration !== generationRef.current) return
    blocked("network")
    setFlowError({ code: "generic", message: "Network error — please try again." })
    setPhase("guest_waiver")
    return
  }
  if (myGeneration !== generationRef.current) return
  const body = await parseJson(res)
  if (myGeneration !== generationRef.current) return
  if (res.ok && body.status === "booked") {
    trackTrialBooked({ templateId: templateId ?? "", alreadyBooked: false })
    setBookedSession(session)
    setPhase("success")
    return
  }
  if (res.ok && body.status === "existing_account") {
    trackTrialGuestExistingAccount({ templateId: templateId ?? "" })
    setPhase("guest_existing")
    return
  }
  const code = typeof body.error === "string" ? body.error : undefined
  if (code === "rate_limited") { blocked("rate_limited"); setFlowError({ code: "generic", message: "Too many attempts — please try again in a few minutes." }); setPhase("guest_waiver"); return }
  if (code === "turnstile_failed") {
    blocked("turnstile_failed")
    turnstileRef.current?.reset() // tokens are single-use; mint a fresh one for the retry
    setFlowError({ code: "generic", message: "We couldn't verify you're human — please retry." })
    setPhase("guest_waiver")
    return
  }
  if (code === "session_full") {
    const idx = templateSessions.findIndex((s) => s.id === session.id)
    const next = idx >= 0 ? templateSessions[idx + 1] : undefined
    if (next) {
      trackTrialFullOfferShown({ templateId: templateId ?? "" })
      setOfferedSession(next)
      setPhase("session_full_offer")
      return
    }
    blocked("session_full_no_alternative")
    setFlowError({ code: "generic", message: "This class is full this week." })
    setPhase("guest_form")
    return
  }
  if (code === "trial_already_used") {
    blocked("trial_already_used")
    setFlowError({ code: "trial_already_used", message: "Looks like this player has already had their free trial — sign in to the account you used before." })
    setPhase("guest_form")
    return
  }
  if (code === "age_ineligible") {
    blocked("age_ineligible")
    setFlowError({ code: "generic", message: `${guestChildFirst.trim()} is outside this class's age range.` })
    setPhase("guest_form")
    return
  }
  blocked("generic")
  setFlowError({ code: "generic", message: typeof body.message === "string" ? body.message : "Could not book this class — please try again." })
  setPhase("guest_form")
}
```

  Guest submits always target `templateSessions[0]` except after a `session_full` offer: make `confirmOfferedSession` branch on `guestMode` and call `submitGuestBooking(offeredSession, generationRef.current)` (Turnstile tokens are single-use — call `turnstileRef.current?.reset()` before the resubmit and gate the confirm button on a fresh `guestTurnstileToken`). `declineOfferedSession` in guest mode returns to `guest_form`.

- [ ] **Step 5: `guest_existing` panel.**

```tsx
{phase === "guest_existing" && slot && (
  <>
    <DialogTitle className="text-ink">You already have an account</DialogTitle>
    <DialogDescription className="text-ink-muted">
      We just emailed you a sign-in link. Open it and we&#39;ll bring you
      straight back to book {slot.name} — your pick is saved.
    </DialogDescription>
    <Button type="button" variant="outline" onClick={closeModal}>Close</Button>
  </>
)}
```

  Also render the guest success variant: the existing `success` phase guards on `selectedChild` for the name — extend that line to fall back to `guestChildFirst` when `guestMode` (`{guestMode ? \`${guestChildFirst.trim()}'s\` : selectedChild ? … }`) and hide "Add another player" in guest mode (their session is live but the picker path assumes an authed fetch — keep guest success to Close only).

- [ ] **Step 6: Verify in the browser** — `npm run dev:bws`, signed-out `/youth/classes`, click "Book a free trial": guest form renders, sign-in link stashes + bounces, full happy path books (staging DB), modal handles `existing_account` with a seeded email. Check `npx tsc --noEmit`.

- [ ] **Step 7: Commit** — `git commit -m "feat(youth): inline guest trial flow in the booking modal"`

---

### Task 5: API tests for the endpoint

**Files:**
- Create: `tests/api/classes/guest-trial.test.ts`

**Interfaces:** consumes Task 3's contract. Dev server runs Turnstile fail-open (no secret) so an empty `turnstileToken` passes locally and in CI.

- [ ] **Step 1: Write the suite.** Unique emails per run (`guest-trial-${Date.now()}@test.aspiresports.com` — canonical dedupe makes reuse a false 'existing_account'). Cases:
  1. **Happy path:** valid body against a seeded scheduled class session → `200 { status: "booked", bookingId }`; response sets a session cookie (assert `set-cookie` present); a follow-up `GET /api/auth/me` with that cookie returns the new user.
  2. **Existing email:** POST again with the same email (fresh kid name) → `200 { status: "existing_account" }` and no new booking (re-POST with original kid → still `existing_account`, never `already_booked`).
  3. **Missing parentalConsent** (`false` or absent) → 422.
  4. **Missing waiver** → 422.
  5. **Kid dedupe:** new unique email, same kid name+DOB as case 1 → `409 { error: "trial_already_used" }` (Task 1's guard through the guest path).
  6. **Bad sessionId** (random uuid) → 404 `session_not_found`.
  7. **Age gate:** DOB outside the template's range → 422 `age_ineligible`.
  Reuse the session-fixture helper pattern from `tests/api/classes/book.test.ts` for minting/finding a scheduled session; if that file gates on Stripe, note this endpoint needs none.

- [ ] **Step 2: Run** — `CRON_SECRET=<dev> TEST_BASE_URL=http://localhost:4321 npm run test:api -- guest-trial` → all pass against the Task 3 endpoint. Fix the endpoint, not the tests, on mismatch.

- [ ] **Step 3: Commit** — `git commit -m "test(api): guest-trial endpoint coverage"`

---

### Task 6: E2E guest spec + full local gate

**Files:**
- Modify: `tests/e2e/youth-classes-signup.spec.ts`

- [ ] **Step 1: Add the guest spec.** Signed-out context (no `signIn` helper): goto `/youth/classes`, `await waitForHydration(page)`, click the first "Book a free trial" CTA, fill the guest form (unique email, kid name `E2E Guesttrial` + in-range DOB, check the COPPA box; Turnstile renders the always-pass sandbox widget locally — wait for the token via the submit button becoming enabled), continue → waiver (check + signature prefilled) → submit → expect the success panel ("free trial is booked"). Use element clicks, never `page.keyboard.press`. Seeded schedule data comes from `npm run db:seed:e2e` (the existing trial spec's fixture — pin by the same slug/template the file already uses).

- [ ] **Step 2: Run the touched specs locally** — `PLAYWRIGHT_BASE_URL=http://localhost:4321 npm test -- youth-classes-signup` (this file also runs post-merge in `test-full`; it must pass here because PR CI skips it).

- [ ] **Step 3: Full pre-push gate** — `npm run db:seed:e2e`; API tests (`CRON_SECRET=… TEST_BASE_URL=… npm run test:api`); `npm run build`; `npx tsc --noEmit`.

- [ ] **Step 4: Commit** — `git commit -m "test(e2e): guest trial happy path"`

---

### Task 7: Spec doc + PR

- [ ] **Step 1:** Update `docs/superpowers/specs/2026-09-05-guest-trial-flow.md` status line to `APPROVED 2026-09-05, implemented on feat/youth-guest-trial` (decision points → resolved answers).
- [ ] **Step 2:** Push branch, open the PR (small, CI-gated; owner merges). Body: spec link, the three owner decisions, screenshots of the guest form/waiver/success, note that `trial_guest_*` events need two tiles added to PostHog dashboard 2067579 post-deploy (funnel step between `trial_modal_opened` and `trial_booked`; `trial_guest_existing_account` as a counter).
- [ ] **Step 3:** Watch CI to green with a background monitor; report, don't merge.

## Self-Review notes

- Spec coverage: inline guest form (T4), new endpoint (T3), COPPA stamps + parental consent row (T3), existing-email link-not-book (T3), kid dedupe (T1), IP caps + Turnstile (T3/T4), analytics (T2/T4), cross-device resume via `?trial=` (T4), escape-hatch sign-in (T4). "N spots left" mismatch stays out of scope per spec.
- Types: `TrialBlockedReason` additions (T2) are consumed by T4's `blocked()` calls; T3's response contract matches T4's parser; `ScheduleSession`/`templateSessions[0]` semantics unchanged.
- Verify-before-claiming: every task ends in a run step; the branch isn't done until PR CI is green.
