# Discount Campaign + Email Capture (Aesthetic Evolution Slice 7) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the home-page capture band to the $15-off incentive: signup with `source: "home-incentive"` immediately receives an email containing the shared `WELCOME15` discount code, and the band copy advertises the offer.

**Architecture:** The discount stack (schema → `/api/public/validate-discount` → checkout apply) already exists end-to-end; this slice is campaign config + one new email path. A tiny campaign-config module (`capture-incentive.ts`) is the single source of truth for code + amount, consumed by both the band copy and a new one-shot transactional email. The email is sent inline from `/api/public/newsletter` when `source === "home-incentive"`, deduped per address via `email_logs` (no migration needed — `email_logs.user_id` is nullable). The prod `discount_codes` row is created post-merge via the existing `/admin/discount-codes` UI.

**Tech Stack:** Astro API routes, Drizzle, React Email + Resend (`src/lib/email/`), Vitest (unit + API over HTTP), Playwright.

**Founder decisions (locked, do not relitigate):** $15 off · ONE shared code (`WELCOME15`) · capture band stays HOME-ONLY (no hub capture surfaces).

**Spec deviation (deliberate):** The spec said "welcome email (existing Resend welcome series) delivers the code," but the welcome series enrolls on **confirmed registration** (post-purchase) — too late for an acquisition incentive, and newsletter signups have no `user_id` for the series' unsubscribe token. So the code is delivered by a new immediate one-shot email on capture signup. It is a single requested email (visitor asked for the code), not a drip series — no `List-Unsubscribe` needed and none is technically possible without a user id.

**Branch/worktree:** Branch `feat/capture-incentive` from up-to-date `main`. Subagent-driven implementation → use a worktree (`superpowers:using-git-worktrees`). Known machine gotchas: worktree creation can SIGBUS under the sandbox (disable sandbox for that command); local builds in worktrees are unreliable (no node_modules/.env) — lean on CI plus the main checkout for verification.

---

## File map

| File | Action | Responsibility |
|---|---|---|
| `src/lib/marketing/capture-incentive.ts` | Create | Campaign config constant + amount formatter (single source of truth) |
| `tests/unit/marketing/capture-incentive.test.ts` | Create | Unit tests for config/formatter |
| `src/lib/email/templates/capture-incentive.tsx` | Create | "Here's your $15 code" email template |
| `tests/unit/email/capture-incentive.test.tsx` | Create | Render test: code + amount appear in html/text |
| `src/lib/email/send.ts` | Modify | Add `sendCaptureIncentiveEmail()` with `email_logs` dedupe |
| `src/pages/api/public/newsletter.ts` | Modify | Call send helper when `source === "home-incentive"` |
| `tests/api/public/newsletter.test.ts` | Modify | New describe block: log row created, deduped, source-gated |
| `src/components/marketing/capture-band.tsx` | Modify | Swap copy to the $15 offer, driven by the config module |
| `tests/e2e/landing-pages.spec.ts` | Modify | Update button/success-copy assertions |

No schema changes, no migrations. `email_type` is `varchar(50)` — `"capture_incentive"` (17 chars) fits.

---

### Task 1: Campaign config module

**Files:**
- Create: `src/lib/marketing/capture-incentive.ts`
- Test: `tests/unit/marketing/capture-incentive.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/marketing/capture-incentive.test.ts
import { describe, it, expect } from "vitest";
import {
  CAPTURE_INCENTIVE,
  formatIncentiveAmount,
} from "@/lib/marketing/capture-incentive";

describe("capture incentive campaign config", () => {
  it("formats whole-dollar amounts without cents", () => {
    expect(formatIncentiveAmount(1500)).toBe("$15");
  });

  it("formats fractional amounts with two decimals", () => {
    expect(formatIncentiveAmount(1250)).toBe("$12.50");
  });

  it("campaign code is uppercase and the amount is positive", () => {
    expect(CAPTURE_INCENTIVE.code).toBe(CAPTURE_INCENTIVE.code.toUpperCase());
    expect(CAPTURE_INCENTIVE.amountCents).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/marketing/capture-incentive.test.ts`
Expected: FAIL — cannot resolve `@/lib/marketing/capture-incentive`

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/marketing/capture-incentive.ts
/**
 * Email-capture incentive campaign (aesthetic-evolution slice 7).
 * Founder decisions 2026-06-12: $15 off, ONE shared code, capture band
 * stays home-only.
 *
 * This module is the single source of truth for the campaign — the capture
 * band copy and the incentive email both read from it. Rotating the campaign
 * means: update this constant AND create the matching discount_codes row via
 * /admin/discount-codes (fixed amount, per-user limit 1). The code printed in
 * the email is only valid at checkout if that row exists and is active.
 */
export const CAPTURE_INCENTIVE = {
  code: "WELCOME15",
  amountCents: 1500,
} as const;

/** "$15" for whole dollars, "$12.50" otherwise. */
export function formatIncentiveAmount(cents: number): string {
  return cents % 100 === 0
    ? `$${cents / 100}`
    : `$${(cents / 100).toFixed(2)}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/marketing/capture-incentive.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/marketing/capture-incentive.ts tests/unit/marketing/capture-incentive.test.ts
git commit -m "feat(capture): incentive campaign config — \$15 shared WELCOME15 code"
```

---

### Task 2: Incentive email template

**Files:**
- Create: `src/lib/email/templates/capture-incentive.tsx`
- Test: `tests/unit/email/capture-incentive.test.tsx`

- [ ] **Step 1: Write the failing render test**

Follow the pattern in `tests/unit/email/lifecycle-brand.test.tsx` (JSX + `renderEmail`).

```tsx
// tests/unit/email/capture-incentive.test.tsx
import React from "react";
import { describe, it, expect } from "vitest";
import { renderEmail } from "@/lib/email/render";
import { CaptureIncentiveEmail } from "@/lib/email/templates/capture-incentive";

describe("CaptureIncentiveEmail", () => {
  it("renders the code, amount, and programs link in html and text", async () => {
    const { html, text } = await renderEmail(
      <CaptureIncentiveEmail
        amount="$15"
        code="WELCOME15"
        programsUrl="https://www.aspiresportsohio.com/programs"
      />,
    );
    expect(html).toContain("WELCOME15");
    expect(html).toContain("$15");
    expect(html).toContain("https://www.aspiresportsohio.com/programs");
    expect(text).toContain("WELCOME15");
    expect(text).toContain("$15");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/email/capture-incentive.test.tsx`
Expected: FAIL — cannot resolve `@/lib/email/templates/capture-incentive`

- [ ] **Step 3: Write the template**

Benefit-led voice per the aesthetic-evolution spec; no operational tablestakes. One-shot requested email → footer states why they got it; no unsubscribe link (see Spec deviation note in the header).

```tsx
// src/lib/email/templates/capture-incentive.tsx
import {
  Button,
  Content,
  EmailLayout,
  H1,
  P,
  PMuted,
} from "@/lib/email/components/email-layout";

interface CaptureIncentiveEmailProps {
  /** Human-formatted amount, e.g. "$15". */
  amount: string;
  /** The shared discount code, e.g. "WELCOME15". */
  code: string;
  programsUrl: string;
}

export function CaptureIncentiveEmail({
  amount,
  code,
  programsUrl,
}: CaptureIncentiveEmailProps) {
  return (
    <EmailLayout preview={`Your ${amount} code is inside`}>
      <Content>
        <H1>Here's your {amount} — see you out there.</H1>
        <P>
          Use this code at checkout and we'll take {amount} off your first
          league, camp, or pickup block:
        </P>
        <P>
          <strong style={{ fontSize: "20px", letterSpacing: "0.08em" }}>
            {code}
          </strong>
        </P>
        <Button href={programsUrl}>Browse programs →</Button>
        <PMuted>
          You're getting this one-time email because you asked for a code on
          our site. The code is good for {amount} off one registration per
          person.
        </PMuted>
      </Content>
    </EmailLayout>
  );
}

export default CaptureIncentiveEmail;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/email/capture-incentive.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/email/templates/capture-incentive.tsx tests/unit/email/capture-incentive.test.tsx
git commit -m "feat(capture): incentive code-delivery email template"
```

---

### Task 3: `sendCaptureIncentiveEmail()` with email_logs dedupe

**Files:**
- Modify: `src/lib/email/send.ts` (add a function after `sendWelcomeSeriesEmail`, which ends near line ~755; add imports at top)

No new test in this task — the behavior (log row, dedupe, source gating) is exercised end-to-end by the API tests in Task 4. Mirror `sendWelcomeSeriesEmail`'s "log a `skipped` row when email is unconfigured" behavior so the dedupe and the API tests work in environments without `RESEND_API_KEY`.

- [ ] **Step 1: Add imports**

In `src/lib/email/send.ts`, extend the existing drizzle import (or add one if absent — check the top of the file; `emailLogs` is already imported from `@/lib/db/schema` at line ~26):

```ts
import { and, eq } from "drizzle-orm";
import { CaptureIncentiveEmail } from "@/lib/email/templates/capture-incentive";
import {
  CAPTURE_INCENTIVE,
  formatIncentiveAmount,
} from "@/lib/marketing/capture-incentive";
```

If `send.ts` already imports from `drizzle-orm`, merge `and, eq` into that import instead of duplicating it.

- [ ] **Step 2: Add the send function**

Place it directly after `sendWelcomeSeriesEmail` (before the dispute-alert section):

```ts
// One-shot incentive-code delivery for capture-band signups. The visitor
// explicitly requested the code, so this is a transactional one-off, not a
// drip series — no List-Unsubscribe (and none is possible: newsletter
// signups have no user id to sign an unsubscribe token with).
// Deduped per address via email_logs so re-submitting the band can't resend.
export async function sendCaptureIncentiveEmail(params: {
  recipientEmail: string;
}) {
  const emailType = "capture_incentive";
  const amount = formatIncentiveAmount(CAPTURE_INCENTIVE.amountCents);
  const subject = `Your ${amount} code for Aspire Sports`;

  // Existence check — any matching row means we already handled this address
  // (sent, failed, or skipped), so no orderBy is needed on the limit(1).
  const [already] = await getDb()
    .select({ id: emailLogs.id })
    .from(emailLogs)
    .where(
      and(
        eq(emailLogs.emailType, emailType),
        eq(emailLogs.recipientEmail, params.recipientEmail),
      ),
    )
    .limit(1);
  if (already) {
    return { success: true, deduped: true };
  }

  if (!isEmailConfigured()) {
    console.warn("Email not configured, skipping capture-incentive email");
    // Record the attempt anyway so the dedupe gate holds (same pattern as
    // the welcome series).
    await logEmail({
      emailType,
      recipientEmail: params.recipientEmail,
      subject,
      status: "skipped",
    });
    return { success: false, error: "Email not configured" };
  }

  const { html, text } = await renderEmail(
    CaptureIncentiveEmail({
      amount,
      code: CAPTURE_INCENTIVE.code,
      programsUrl: `${env.PUBLIC_APP_URL}/programs`,
    }),
  );

  const result = await sendEmail({
    to: params.recipientEmail,
    subject,
    html,
    text,
  });

  await logEmail({
    emailType,
    recipientEmail: params.recipientEmail,
    subject,
    resendMessageId: result.messageId,
    status: result.success ? "sent" : "failed",
  });

  return result;
}
```

Note: the capture band only renders on the Aspire home page, so the default (Aspire) sender is correct — no `from`/brand override.

- [ ] **Step 3: Type check**

Run: `npx tsc --noEmit`
Expected: zero errors

- [ ] **Step 4: Commit**

```bash
git add src/lib/email/send.ts
git commit -m "feat(capture): sendCaptureIncentiveEmail with email_logs dedupe"
```

---

### Task 4: Newsletter endpoint hook + API tests

**Files:**
- Modify: `src/pages/api/public/newsletter.ts`
- Test: `tests/api/public/newsletter.test.ts` (append a describe block + extend imports)

**Prereq:** dev server running (`npm run dev`). API tests hit it over HTTP.

**Rate-limit budget:** the endpoint allows 5 POSTs per IP per 60s. The existing test makes 1 POST; the new tests add 3. Total 4 — under the cap, but do NOT add further POSTs to this file without staggering.

- [ ] **Step 1: Write the failing tests**

Update the import block at the top of `tests/api/public/newsletter.test.ts`:

```ts
import { describe, it, expect, beforeAll } from "vitest";
import { apiFetch } from "../setup/test-helpers";
import { getDb } from "@/lib/db";
import { newsletterSignups, organizations, emailLogs } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
```

Append at the end of the file:

```ts
describe("POST /api/public/newsletter — capture incentive email", () => {
  const incentiveLogs = (email: string) =>
    getDb()
      .select()
      .from(emailLogs)
      .where(
        and(
          eq(emailLogs.emailType, "capture_incentive"),
          eq(emailLogs.recipientEmail, email),
        ),
      );

  it("logs exactly one capture_incentive email for home-incentive signups, deduped on resubmit", async () => {
    const email = `nl-incentive-${Date.now()}@example.com`;
    const submit = () =>
      apiFetch("/api/public/newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, source: "home-incentive" }),
      });

    const res1 = await submit();
    expect(res1.status).toBe(200);

    const afterFirst = await incentiveLogs(email);
    expect(afterFirst).toHaveLength(1);
    // "sent" when RESEND_API_KEY is configured, "skipped" otherwise — both
    // mean the endpoint took the incentive path and the dedupe gate is set.
    expect(["sent", "skipped"]).toContain(afterFirst[0].status);

    const res2 = await submit();
    expect(res2.status).toBe(200);

    const afterSecond = await incentiveLogs(email);
    expect(afterSecond).toHaveLength(1);
  });

  it("does not send the incentive for non-incentive sources", async () => {
    const email = `nl-footer-${Date.now()}@example.com`;
    const res = await apiFetch("/api/public/newsletter", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, source: "footer" }),
    });
    expect(res.status).toBe(200);

    expect(await incentiveLogs(email)).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npx vitest run tests/api/public/newsletter.test.ts`
Expected: existing tenant-attribution test PASSES; both new tests FAIL (`afterFirst` has length 0 — no email path exists yet)

- [ ] **Step 3: Wire the endpoint**

In `src/pages/api/public/newsletter.ts`, add the import:

```ts
import { sendCaptureIncentiveEmail } from "@/lib/email/send";
```

Then inside the `try` block, after the upsert resolves and **before** the `return new Response(JSON.stringify({ ok: true }), …)`:

```ts
    if (source === "home-incentive") {
      // Deliver the discount code (deduped per address inside the helper).
      // Awaited — fire-and-forget promises can be killed when the serverless
      // function returns. Failures are swallowed: the signup is already
      // stored and must not 500 because Resend hiccuped.
      try {
        await sendCaptureIncentiveEmail({ recipientEmail: email });
      } catch (err) {
        console.error("[newsletter] incentive email failed", err);
      }
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/api/public/newsletter.test.ts`
Expected: PASS (3 tests). If you see 429s, you blew the rate-limit budget — wait 60s and re-run.

- [ ] **Step 5: Commit**

```bash
git add src/pages/api/public/newsletter.ts tests/api/public/newsletter.test.ts
git commit -m "feat(capture): deliver incentive code email on home-incentive signup"
```

---

### Task 5: Capture-band copy swap + e2e assertion update

**Files:**
- Modify: `src/components/marketing/capture-band.tsx`
- Modify: `tests/e2e/landing-pages.spec.ts:119-120` (button name + success-copy assertions)

- [ ] **Step 1: Swap the band copy**

Replace the header comment (lines 5–10) and the copy strings. The component imports the campaign config so band copy, email, and admin row can't drift on amount:

```tsx
"use client"

import { useState } from "react"
import {
  CAPTURE_INCENTIVE,
  formatIncentiveAmount,
} from "@/lib/marketing/capture-incentive"

/**
 * Inline email-capture band (home). Deliberately NOT a popup — see the
 * aesthetic-evolution spec. Posts to the org-scoped newsletter endpoint;
 * source "home-incentive" triggers the discount-code delivery email.
 * Code/amount come from the capture-incentive campaign config.
 */
export default function CaptureBand() {
  const amount = formatIncentiveAmount(CAPTURE_INCENTIVE.amountCents)
  const [email, setEmail] = useState("")
  const [status, setStatus] = useState<"idle" | "submitting" | "ok" | "error">("idle")
```

(`submit` handler is unchanged.) Then the copy, replacing lines 36–44 of the current file:

```tsx
        <div className="flex-1">
          <h2 className="font-display italic text-2xl lg:text-3xl">
            Take {amount} off your first season.
          </h2>
          <p className="text-cream/70 mt-2 text-sm">
            Drop your email and we'll send you a code for {amount} off any
            league, camp, or pickup block.
          </p>
        </div>
        {status === "ok" ? (
          <p className="flex-1 text-sm font-medium text-cream/90" role="status">
            Check your inbox — your {amount} code is on the way.
          </p>
        ) : (
```

And the button label (line 65 of the current file):

```tsx
              {status === "submitting" ? "Sending…" : "Send my code"}
```

- [ ] **Step 2: Update the e2e assertions**

In `tests/e2e/landing-pages.spec.ts`, replace the two lines after the email fill (currently lines 119–120):

```ts
    await page.getByRole("button", { name: /send my code/i }).click();
    await expect(page.getByText(/check your inbox/i)).toBeVisible();
```

(Keep the hydration wait + `:not([ssr])` selector above them exactly as is — the `client:visible` island gotcha is real.)

- [ ] **Step 3: Run the homepage e2e spec**

Prereq: dev server running and e2e data seeded (`npm run db:seed:e2e`).

Run: `PLAYWRIGHT_BASE_URL=http://localhost:4321 npx playwright test tests/e2e/landing-pages.spec.ts`
Expected: PASS. (The e2e submission reuses `home-incentive-e2e@test.aspiresports.com`; the dedupe row persisting across runs is fine — the e2e only asserts UI state.)

- [ ] **Step 4: Check for other copy assertions**

Run: `grep -rn "first dibs\|Count me in\|you're on the list" src/ tests/ --include="*.ts" --include="*.tsx" --include="*.astro" | grep -v " 2"`
Expected: no hits (all old copy gone; ignore any Finder-duplicate `* 2.*` files)

- [ ] **Step 5: Commit**

```bash
git add src/components/marketing/capture-band.tsx tests/e2e/landing-pages.spec.ts
git commit -m "feat(capture): swap band copy to the \$15 incentive offer"
```

---

### Task 6: Full verification + ship

- [ ] **Step 1: Type check** — `npx tsc --noEmit` → zero errors
- [ ] **Step 2: Unit tests** — `npx vitest run tests/unit/` → all pass
- [ ] **Step 3: Build** — `npm run build` → succeeds (the `Astro.request.headers` prerender warnings are known noise)
- [ ] **Step 4: Ship** — invoke the `/ship` skill to run the repo's pre-push checks, push `feat/capture-incentive`, and open the PR. PR body MUST include the post-merge checklist below. A push isn't done until CI is green on origin.

**PR body — post-merge checklist (founder / admin session):**

```
Post-merge, before the offer is honest:
- [ ] Create the campaign discount code on prod via /admin/discount-codes:
      code WELCOME15 · type fixed amount · value $15 · per-user limit 1 ·
      no total-use cap · no expiry · no season restriction · active.
      Until this row exists, the emailed code is rejected at checkout.
- [ ] Send a test signup through the live capture band and confirm the
      Resend delivery + that WELCOME15 validates in a registration checkout.

Known v1 limits (accepted; per-signup unique codes are the later hardening):
- Shared code is forwardable; per-user limit rides on user accounts, so a
  guest checkout weakens the one-per-person cap.
- The code applies to registration checkouts only (discount input lives in
  the registration payment step) — drop-ins/rentals use Stripe Checkout
  without a code field, despite the band copy mentioning pickup blocks.
```

> Note on that last bullet: the band/email copy says "league, camp, or pickup block" but the code is only redeemable on registrations today. If the founder objects, the copy fix is one string in `capture-incentive.ts` consumers — flag it in the PR description rather than silently narrowing the copy.

---

## Self-review (done at planning time)

- **Spec coverage:** spec slice 7 = "Discount campaign config + welcome-email update (founder sets amount)." Amount set ($15). Campaign config → Task 1 + post-merge admin row. Email delivery → Tasks 2–4 (with the documented deviation from "welcome series" to immediate one-shot — the series fires post-registration, which cannot deliver an acquisition incentive). Capture-band incentive copy → Task 5. Hub capture surfaces → founder decided home-only; no task, correct.
- **Placeholder scan:** none — all steps carry real code/commands.
- **Type consistency:** `CAPTURE_INCENTIVE`/`formatIncentiveAmount` names match across Tasks 1, 3, 5; `CaptureIncentiveEmail` props (`amount`, `code`, `programsUrl`) match between Tasks 2 and 3; `emailType: "capture_incentive"` matches between Tasks 3 and 4.
