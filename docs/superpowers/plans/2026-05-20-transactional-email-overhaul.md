# Transactional Email Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix transactional email correctness, add a Stripe refund webhook as the source of truth for refunds, and redesign all 10 email templates to be read faster and convert better.

**Architecture:** Email becomes the channel of record — a new `sendTransactionalEmail` helper always sends the HTML email and logs it; SMS is a separate additive nudge for time-sensitive types only. A `charge.refunded` webhook becomes the single writer of refund state and the refund email. All templates share upgraded `email-layout.tsx` primitives (status banner, block CTA, no decorative chrome).

**Tech Stack:** Astro 5 SSR, React 19, `@react-email/components`, Resend, Drizzle ORM (PostgreSQL), Stripe webhooks, Netlify scheduled functions, Vitest.

**Spec:** `docs/superpowers/specs/2026-05-20-transactional-email-design.md`

**Worktree:** `feat/transactional-email-overhaul` (already created; deps installed).

---

## File Structure

**New files:**
- `src/lib/email/format.ts` — timezone-correct date formatting (pure, unit-tested).
- `src/lib/email/render.ts` — `renderEmail()` → `{ html, text }` (HTML + plain-text part).
- `src/lib/email/components/status-banner.tsx` — `StatusBanner` design component.
- `src/lib/email/templates/sign-in-link.tsx` — renamed from `password-reset.tsx`.
- `netlify/functions/scheduled-send-balance-reminders.ts` — daily balance-reminder scheduler.
- `src/lib/stripe/handle-charge-refunded.ts` — `charge.refunded` webhook handler.
- `tests/unit/email/format.test.ts` — unit tests for date formatting.
- `tests/unit/email/render.test.ts` — unit tests for plain-text rendering.
- `tests/api/webhooks/charge-refunded.test.ts` — integration test for the refund webhook.

**Modified files:**
- `src/lib/email/send.ts` — unified `sendTransactionalEmail`, SMS nudge, retire `sendViaGatewayOrDirect`.
- `src/lib/email/index.ts` — no change expected (verify only).
- `src/lib/email/components/email-layout.tsx` — accent stripe, remove `§` chrome, block `Button`, `DetailPanel`, apex `appUrl`, warmer footer.
- All 10 templates in `src/lib/email/templates/`.
- `src/pages/api/auth/signup.ts`, `forgot-password.ts`, `send-verification.ts` — unified send + logging.
- `src/lib/waitlist/processor.ts` — export `WAITLIST_PROMOTION_HOURS`.
- `src/lib/stripe/handle-stripe-event.ts` — dispatch `charge.refunded`.
- `src/lib/payments/admin-refund.ts` — slim down to "create Stripe refund + mark in-flight".
- `src/components/admin/refunds-management.tsx` — verify/adjust copy for the `approved` (in-flight) status.
- `package.json` — add `charge.refunded` to the `stripe:listen` events.

**Decision (resolved from spec §2.5):** No schema migration. The `refund_status` enum already contains an unused `approved` value that `src/pages/api/admin/refunds/index.ts` and `refunds-management.tsx` already filter on. The admin action sets `refundStatus: "approved"` (refund created in Stripe, awaiting confirmation); the webhook sets `refundStatus: "processed"` on confirmation.

---

## Phase A — Email infrastructure

### Task A1: Timezone-correct date formatting

**Files:**
- Create: `src/lib/email/format.ts`
- Create: `tests/unit/email/format.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/email/format.test.ts
import { describe, it, expect } from "vitest";
import { formatEmailDate, formatEmailDateTime } from "@/lib/email/format";

describe("formatEmailDate", () => {
  it("renders a date in Eastern time by default", () => {
    // 2026-06-06 (date-only) — should read June 6 in ET.
    expect(formatEmailDate("2026-06-06")).toBe("June 6, 2026");
  });
});

describe("formatEmailDateTime", () => {
  it("renders a UTC instant in Eastern time, not UTC", () => {
    // 2026-01-15T22:00:00Z === 5:00 PM EST.
    const out = formatEmailDateTime(new Date("2026-01-15T22:00:00Z"));
    expect(out).toContain("5:00");
    expect(out).toContain("PM");
    expect(out).toContain("January 15, 2026");
  });

  it("renders summer instants in EDT", () => {
    // 2026-07-15T22:00:00Z === 6:00 PM EDT.
    const out = formatEmailDateTime(new Date("2026-07-15T22:00:00Z"));
    expect(out).toContain("6:00");
    expect(out).toContain("PM");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- tests/unit/email/format.test.ts`
Expected: FAIL — `Cannot find module '@/lib/email/format'`.

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/email/format.ts
/**
 * Date formatting for transactional emails. All emails render in the
 * organization's local timezone — never the server's (Netlify runs UTC).
 * Aspire Sports operates in Columbus, Ohio, so the default is US Eastern.
 */
const DEFAULT_TIMEZONE = "America/New_York";

/** Format a date as e.g. "June 6, 2026". */
export function formatEmailDate(
  date: Date | string,
  timeZone: string = DEFAULT_TIMEZONE,
): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone,
  });
}

/** Format a date+time as e.g. "January 15, 2026, 5:00 PM EST". */
export function formatEmailDateTime(
  date: Date | string,
  timeZone: string = DEFAULT_TIMEZONE,
): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
    timeZoneName: "short",
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit -- tests/unit/email/format.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/email/format.ts tests/unit/email/format.test.ts
git commit -m "Add timezone-correct date formatting for emails"
```

### Task A2: Plain-text rendering helper

**Files:**
- Create: `src/lib/email/render.ts`
- Create: `tests/unit/email/render.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/email/render.test.ts
import { describe, it, expect } from "vitest";
import { renderEmail } from "@/lib/email/render";
import { EmailVerificationEmail } from "@/lib/email/templates/email-verification";

describe("renderEmail", () => {
  it("produces both an HTML and a non-empty plain-text part", async () => {
    const { html, text } = await renderEmail(
      EmailVerificationEmail({
        name: "Sarah",
        verifyUrl: "https://aspiresportsohio.com/verify-email/abc",
        expiresIn: "24 hours",
      }),
    );
    expect(html).toContain("<");
    expect(text.length).toBeGreaterThan(20);
    expect(text).not.toContain("<div");
    expect(text).toContain("Sarah");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- tests/unit/email/render.test.ts`
Expected: FAIL — `Cannot find module '@/lib/email/render'`.

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/email/render.ts
import { render } from "@react-email/components";
import type { ReactElement } from "react";

/**
 * Render an email template once into both an HTML body and a plain-text
 * alternative part. Every transactional email ships both — the plain-text
 * part materially improves deliverability and spam scoring.
 */
export async function renderEmail(
  element: ReactElement,
): Promise<{ html: string; text: string }> {
  const [html, text] = await Promise.all([
    render(element),
    render(element, { plainText: true }),
  ]);
  return { html, text };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit -- tests/unit/email/render.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add src/lib/email/render.ts tests/unit/email/render.test.ts
git commit -m "Add renderEmail helper producing HTML + plain-text parts"
```

### Task A3: Unified `sendTransactionalEmail` helper + SMS nudge

**Files:**
- Modify: `src/lib/email/send.ts`

This task adds the new send primitives. The per-function migration is Task A4.

- [ ] **Step 1: Add the SMS nudge helper**

In `src/lib/email/send.ts`, the gateway import already exists (`import { sendToParent } from "@/lib/messaging/gateway"`). Add this helper near the top of the file (after the imports):

```typescript
/**
 * Fire a short SMS nudge in ADDITION to a transactional email, for
 * time-sensitive messages only. Uses the messaging gateway forced to the
 * SMS channel — it no-ops cleanly if the parent has no verified phone.
 * Never throws into the caller; an SMS failure must not affect the email.
 */
async function sendSmsNudge(opts: {
  userId: string;
  organizationId: string;
  body: string;
}): Promise<void> {
  try {
    await sendToParent({
      parentUserId: opts.userId,
      organizationId: opts.organizationId,
      body: opts.body,
      forceChannel: "sms",
      senderType: "system",
    });
  } catch (err) {
    console.error("[email] SMS nudge failed:", err);
  }
}
```

- [ ] **Step 2: Add the `sendTransactionalEmail` helper**

Add below `sendSmsNudge`. This replaces `sendViaGatewayOrDirect` for transactional sends — email is always sent and always logged; SMS is additive.

```typescript
/**
 * Send a transactional email. Email is the channel of record: the HTML
 * email is always sent and always logged. For time-sensitive types the
 * caller passes `smsNudge`, which fires an additional short SMS — never a
 * replacement for the email.
 */
async function sendTransactionalEmail(opts: {
  userId?: string;
  registrationId?: string;
  emailType: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  smsNudge?: { organizationId?: string; body: string };
}): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const result = await sendEmail({
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
    text: opts.text,
  });

  await logEmail({
    userId: opts.userId,
    registrationId: opts.registrationId,
    emailType: opts.emailType,
    recipientEmail: opts.to,
    subject: opts.subject,
    resendMessageId: result.messageId,
    status: result.success ? "sent" : "failed",
  });

  if (opts.smsNudge?.organizationId && opts.userId) {
    // Fire-and-forget — SMS nudge never blocks or fails the email.
    void sendSmsNudge({
      userId: opts.userId,
      organizationId: opts.smsNudge.organizationId,
      body: opts.smsNudge.body,
    });
  }

  return result;
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS (no errors). `sendViaGatewayOrDirect` is now unused — that is expected; Task A4 removes it.

- [ ] **Step 4: Commit**

```bash
git add src/lib/email/send.ts
git commit -m "Add sendTransactionalEmail + SMS nudge helpers"
```

### Task A4: Migrate all send functions to the unified helper

**Files:**
- Modify: `src/lib/email/send.ts`
- Modify: `src/lib/waitlist/processor.ts`

- [ ] **Step 1: Export the waitlist claim-window constant**

In `src/lib/waitlist/processor.ts`, change line 7 from:

```typescript
const WAITLIST_PROMOTION_HOURS = 48;
```

to:

```typescript
export const WAITLIST_PROMOTION_HOURS = 48;
```

- [ ] **Step 2: Replace date helpers and imports in send.ts**

In `src/lib/email/send.ts`:
- Delete the local `formatCurrency` is kept; delete the local `formatDate` and `formatDateTime` functions.
- Add imports at the top:

```typescript
import { renderEmail } from "./render";
import { formatEmailDate, formatEmailDateTime } from "./format";
import { WAITLIST_PROMOTION_HOURS } from "@/lib/waitlist/processor";
```

- Replace every call to the old `formatDate(x)` with `formatEmailDate(x)` and `formatDateTime(x)` with `formatEmailDateTime(x)`.

- [ ] **Step 3: Migrate each send function**

For all eight functions (`sendRegistrationConfirmationEmail`, `sendPaymentReceiptEmail`, `sendWaitlistPromotionEmail`, `sendRefundNotificationEmail`, `sendMagicLinkLoginEmail`, `sendPaymentFailedEmail`, `sendAnnouncementEmail`, `sendBalanceReminderEmail`): replace the `const html = await render(...)` + `sendViaGatewayOrDirect(...)` + `logEmail(...)` block with the unified pattern. Render via `renderEmail`, then call `sendTransactionalEmail`.

Example — `sendRegistrationConfirmationEmail` body becomes:

```typescript
  const { html, text } = await renderEmail(
    RegistrationConfirmationEmail({
      parentName: params.parentName,
      childName: params.childName,
      programName: params.programName,
      seasonName: params.seasonName,
      startDate: formatEmailDate(params.startDate),
      endDate: formatEmailDate(params.endDate),
      scheduleNotes: params.scheduleNotes,
      locationName: params.locationName,
      locationAddress: params.locationAddress,
      amountDue: formatCurrency(params.amountDueCents),
      paymentStatus: params.paymentStatus,
      registrationStatus: params.registrationStatus,
      dashboardUrl: `${appUrl}/dashboard`,
      hasLinkedTelegram: params.hasLinkedTelegram ?? false,
      waitlistClaimHours: WAITLIST_PROMOTION_HOURS,
    }),
  );

  const subject =
    params.registrationStatus === "waitlisted"
      ? `Waitlist confirmation — ${params.childName} for ${params.programName}`
      : `Registration confirmed — ${params.childName} for ${params.programName}`;

  return sendTransactionalEmail({
    userId: params.userId,
    registrationId: params.registrationId,
    emailType: "registration_confirmation",
    to: params.parentEmail,
    subject,
    html,
    text,
  });
```

Apply the same shape to the other seven. **SMS nudge** is passed only for the three time-sensitive types — `sendPaymentFailedEmail`, `sendWaitlistPromotionEmail`, `sendBalanceReminderEmail` — using the existing `smsBody` strings already in each function:

```typescript
  return sendTransactionalEmail({
    userId: params.userId,
    registrationId: params.registrationId,
    emailType: "payment_failed",
    to: params.parentEmail,
    subject,
    html,
    text,
    smsNudge: { organizationId: params.organizationId, body: smsBody },
  });
```

`sendWaitlistPromotionEmail` passes `formatEmailDateTime(params.expiresAt)` for the `expiresAt` prop (fixes the UTC-deadline bug). Subject lines change to sentence case (see Phase C subject table). `sendAnnouncementEmail` and `sendMagicLinkLoginEmail` and the others get no `smsNudge`.

- [ ] **Step 4: Delete `sendViaGatewayOrDirect`**

Remove the now-unused `sendViaGatewayOrDirect` function and its `stripHtmlTags` helper from `send.ts`. Keep `logEmail`, `formatCurrency`. Keep the `sendToParent` import (used by `sendSmsNudge`).

- [ ] **Step 5: Typecheck and build**

Run: `npm run typecheck && npm run build`
Expected: PASS. Template prop mismatches surface here — they are resolved when the templates are updated in Phase C; if `waitlistClaimHours` is flagged as an unknown prop, that is expected until Task C1. To keep this task self-contained, add the `waitlistClaimHours?: number` prop to `RegistrationConfirmationEmailProps` now (the template body still uses it in Task C1).

- [ ] **Step 6: Commit**

```bash
git add src/lib/email/send.ts src/lib/waitlist/processor.ts
git commit -m "Route all transactional emails through unified email-always send path"
```

### Task A5: Route auth emails through the unified send + logging path

**Files:**
- Modify: `src/lib/email/send.ts`
- Modify: `src/pages/api/auth/signup.ts`
- Modify: `src/pages/api/auth/forgot-password.ts`
- Modify: `src/pages/api/auth/send-verification.ts`

- [ ] **Step 1: Add two exported send functions in send.ts**

Auth routes currently call `sendEmail` directly and skip `email_logs`. Add wrappers so they log:

```typescript
// Sign-in link (magic link) — used by signup and forgot-password.
export async function sendSignInLinkEmail(params: {
  userId: string;
  parentEmail: string;
  parentName: string;
  signInUrl: string;
  expiresIn?: string;
}) {
  if (!isEmailConfigured()) {
    console.warn("Email not configured, skipping sign-in link email");
    return { success: false, error: "Email not configured" };
  }
  const { html, text } = await renderEmail(
    SignInLinkEmail({
      name: params.parentName,
      signInUrl: params.signInUrl,
      expiresIn: params.expiresIn ?? "15 minutes",
    }),
  );
  return sendTransactionalEmail({
    userId: params.userId,
    emailType: "sign_in_link",
    to: params.parentEmail,
    subject: "Sign in to Aspire Sports",
    html,
    text,
  });
}

// Email verification — used by the dashboard verification banner.
export async function sendEmailVerificationEmail(params: {
  userId: string;
  recipientEmail: string;
  recipientName: string;
  verifyUrl: string;
  expiresIn?: string;
}) {
  if (!isEmailConfigured()) {
    console.warn("Email not configured, skipping verification email");
    return { success: false, error: "Email not configured" };
  }
  const { html, text } = await renderEmail(
    EmailVerificationEmail({
      name: params.recipientName,
      verifyUrl: params.verifyUrl,
      expiresIn: params.expiresIn ?? "24 hours",
    }),
  );
  return sendTransactionalEmail({
    userId: params.userId,
    emailType: "email_verification",
    to: params.recipientEmail,
    subject: "Verify your email — Aspire Sports",
    html,
    text,
  });
}
```

Add the corresponding imports at the top of `send.ts`:

```typescript
import { SignInLinkEmail } from "./templates/sign-in-link";
import { EmailVerificationEmail } from "./templates/email-verification";
```

Note: `sign-in-link.tsx` is created in Task C8. If executing in order, Task C8 runs before this is built; if not, create `sign-in-link.tsx` first. To keep ordering safe, **Phase C runs before A5's build step** — or run Task C8 immediately before this task.

- [ ] **Step 2: Update `signup.ts`**

Replace the inline `render` + `sendEmail` block (lines ~129-151) with:

```typescript
    if (isEmailConfigured()) {
      const { token } = await createMagicLink({
        userId: newUser.id,
        purpose: "password_reset_login",
        deliveredChannel: "email",
        deliveredTo: emailLower,
      });
      await sendSignInLinkEmail({
        userId: newUser.id,
        parentEmail: emailLower,
        parentName: newUser.firstName || "",
        signInUrl: buildMagicLinkUrl(token),
      });
    } else {
      console.warn("Email not configured, sign-in link not sent");
    }
```

Remove the now-unused imports `render`, `sendEmail`, `PasswordResetEmail`; add `import { sendSignInLinkEmail } from "@/lib/email/send"`. Keep `isEmailConfigured` — import it from `@/lib/email/send` (re-export it there if not already exported, or keep importing from `@/lib/email`).

- [ ] **Step 3: Update `forgot-password.ts`**

Replace the inline `render` + `sendEmail` block (lines ~115-132) with:

```typescript
    if (isEmailConfigured()) {
      await sendSignInLinkEmail({
        userId: targetUser.id,
        parentEmail: normalizedEmail,
        parentName: targetUser.firstName || "",
        signInUrl: buildMagicLinkUrl(token),
      });
    } else {
      console.warn("Email not configured, sign-in link not sent");
    }
```

Remove unused imports `render`, `sendEmail`, `PasswordResetEmail`; add `sendSignInLinkEmail`.

- [ ] **Step 4: Update `send-verification.ts`**

Replace the inline `render` + `sendEmail` block (lines ~61-77) with:

```typescript
    if (isEmailConfigured()) {
      const appUrl = import.meta.env.PUBLIC_APP_URL || "http://localhost:4321";
      await sendEmailVerificationEmail({
        userId: user.id,
        recipientEmail: userData[0].email,
        recipientName: userData[0].firstName || "",
        verifyUrl: `${appUrl}/verify-email/${token}`,
      });
    } else {
      console.warn("Email not configured, verification email not sent");
    }
```

Remove unused imports `render`, `sendEmail`, `EmailVerificationEmail`; add `sendEmailVerificationEmail`.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/email/send.ts src/pages/api/auth/
git commit -m "Route auth emails through unified send + email_logs path"
```

### Task A6: Balance-reminder scheduled function

**Files:**
- Create: `netlify/functions/scheduled-send-balance-reminders.ts`

- [ ] **Step 1: Create the scheduled function**

Mirror `netlify/functions/scheduled-expire-pending-claims.ts` exactly, changed to a daily schedule and the balance-reminders route:

```typescript
/**
 * Netlify Scheduled Function — fires the balance-reminder sweep once daily
 * by POSTing to /api/cron/send-balance-reminders.
 *
 * Mirrors scheduled-expire-pending-claims.ts: it does NOT import app lib
 * (the lib tree reads import.meta.env, undefined in the Netlify function
 * bundle). The HTTP route runs the work inside the Astro SSR runtime.
 */
import { schedule } from "@netlify/functions";

const ROUTE = "/api/cron/send-balance-reminders";

// 13:00 UTC ≈ 8-9am US Eastern — well before any season's first session.
export const handler = schedule("0 13 * * *", async () => {
  const base = (process.env.URL ?? process.env.PUBLIC_APP_URL)?.replace(
    /\/$/,
    "",
  );
  if (!base) {
    console.error(
      "[scheduled-send-balance-reminders] no site URL in env (URL / PUBLIC_APP_URL)",
    );
    return { statusCode: 500, body: "Site URL not configured" };
  }

  try {
    const res = await fetch(`${base}${ROUTE}`, {
      method: "POST",
      headers: {
        "x-cron-secret": process.env.CRON_SECRET ?? "",
        Origin: base,
      },
    });
    const body = await res.text();
    if (!res.ok) {
      console.error(
        `[scheduled-send-balance-reminders] ${ROUTE} → ${res.status}: ${body}`,
      );
      return { statusCode: 500, body };
    }
    console.info(
      `[scheduled-send-balance-reminders] ${ROUTE} → ${res.status}: ${body}`,
    );
    return { statusCode: 200, body };
  } catch (err) {
    console.error("[scheduled-send-balance-reminders]", err);
    return {
      statusCode: 500,
      body: err instanceof Error ? err.message : String(err),
    };
  }
});
```

- [ ] **Step 2: Typecheck and build**

Run: `npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add netlify/functions/scheduled-send-balance-reminders.ts
git commit -m "Add daily scheduler for the balance-reminder cron"
```

---

## Phase B — Email design system primitives

All Phase B work is in `src/lib/email/components/`. The visual direction was validated against the registration-confirmation email during brainstorming.

### Task B1: Layout shell — accent stripe, remove `§` chrome, apex URL, warmer footer

**Files:**
- Modify: `src/lib/email/components/email-layout.tsx`

- [ ] **Step 1: Change the `appUrl` default to the apex domain**

In `EmailLayout`, change the default:

```typescript
  appUrl = "https://aspiresportsohio.com",
```

(`www` 308-redirects; some email image proxies don't follow it.)

- [ ] **Step 2: Add the accent stripe and remove the meta bar**

In the `EmailLayout` return, the `<Container>` becomes:

```tsx
        <Container style={containerStyle}>
          <div style={accentStripeStyle} />

          <Section style={logoSectionStyle}>
            <Img
              src={`${appUrl}/images/logo-black.png`}
              alt="Aspire Sports"
              width="140"
              height="34"
              style={logoImgStyle}
            />
          </Section>

          {children}

          <Hr style={ruleStyle} />

          <Section style={footerSectionStyle}>
            <Text style={footerBrandStyle}>Aspire Sports Ohio</Text>
            <Text style={footerAddressStyle}>
              3989 Presidential Pkwy &nbsp;·&nbsp; Powell, OH 43065
            </Text>
            <Text style={footerContactStyle}>
              Questions? Just reply to this email — a real person reads it.
            </Text>
          </Section>
        </Container>
```

Remove the `sectionLabel` / `sectionMeta` props from `EmailLayoutProps` and the entire meta-bar `<Section>` block. The `children` are now wrapped by each template's own `<Section style={contentSectionStyle}>` — so export `contentSectionStyle` use via a new `Content` wrapper component:

```tsx
export function Content({ children }: { children: ReactNode }) {
  return <Section style={contentSectionStyle}>{children}</Section>;
}
```

Templates wrap their body in `<Content>`. Update `EmailLayoutProps` to just `{ preview: string; appUrl?: string; children: ReactNode }`.

- [ ] **Step 3: Add the accent stripe style**

```typescript
const accentStripeStyle: CSSProperties = {
  height: "4px",
  backgroundColor: tokens.primary,
  fontSize: "1px",
  lineHeight: "4px",
};
```

- [ ] **Step 4: Remove `§` prefixes**

In `SectionLabel`, change `§ {children}` to just `{children}`. In `InfoCard`, change the label render from `§ {label}` to `{label}`. (The `§` glyph is the decorative chrome being cut.)

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: errors in templates that still pass `sectionLabel`/`sectionMeta` — expected, fixed in Phase C. Confirm `email-layout.tsx` itself has no errors by checking the error list references only `templates/`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/email/components/email-layout.tsx
git commit -m "Email layout: accent stripe, remove decorative chrome, apex URL"
```

### Task B2: `StatusBanner` component

**Files:**
- Create: `src/lib/email/components/status-banner.tsx`

- [ ] **Step 1: Create the component**

```tsx
// src/lib/email/components/status-banner.tsx
import { Section, Text } from "@react-email/components";
import type { CSSProperties } from "react";
import { tokens, fonts } from "./email-layout";

type Mood = "success" | "warning" | "problem";

const PALETTE: Record<Mood, { bg: string; fg: string; glyph: string }> = {
  success: { bg: tokens.sageSoft, fg: "#436B52", glyph: "✓" },
  warning: { bg: tokens.ochreSoft, fg: "#8A6A2E", glyph: "!" },
  problem: { bg: tokens.primarySoft, fg: tokens.primary, glyph: "!" },
};

/**
 * Full-width status strip shown directly below the logo. Communicates the
 * email's outcome in half a second, before any prose.
 */
export function StatusBanner({
  mood,
  children,
}: {
  mood: Mood;
  children: string;
}) {
  const p = PALETTE[mood];
  return (
    <Section style={{ ...bannerStyle, backgroundColor: p.bg }}>
      <Text style={{ ...textStyle, color: p.fg }}>
        {p.glyph}&nbsp;&nbsp;{children}
      </Text>
    </Section>
  );
}

const bannerStyle: CSSProperties = {
  padding: "10px 40px",
  borderTop: `1px solid ${tokens.border}`,
  borderBottom: `1px solid ${tokens.border}`,
  textAlign: "center",
};

const textStyle: CSSProperties = {
  fontFamily: fonts.body,
  fontSize: "11px",
  fontWeight: 600,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  margin: 0,
};
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no new errors from `status-banner.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/email/components/status-banner.tsx
git commit -m "Add StatusBanner email component"
```

### Task B3: Block `Button` and `DetailPanel`

**Files:**
- Modify: `src/lib/email/components/email-layout.tsx`

- [ ] **Step 1: Convert `Button` to a full-width block button**

Replace `buttonPrimaryStyle` and `buttonOutlineStyle` and the `Button` component so the button is full-width, sentence case, larger:

```tsx
export function Button({
  href,
  children,
  variant = "primary",
}: {
  href: string;
  children: ReactNode;
  variant?: "primary" | "outline";
}) {
  const style = variant === "outline" ? buttonOutlineStyle : buttonPrimaryStyle;
  return (
    <Section style={{ margin: "24px 0 8px" }}>
      <Link href={href} style={style}>
        {children}
      </Link>
    </Section>
  );
}
```

```typescript
const buttonPrimaryStyle: CSSProperties = {
  backgroundColor: tokens.primary,
  borderRadius: "6px",
  color: tokens.paper,
  display: "block",
  fontFamily: fonts.body,
  fontSize: "15px",
  fontWeight: 600,
  letterSpacing: "0.01em",
  padding: "15px 24px",
  textAlign: "center",
  textDecoration: "none",
};

const buttonOutlineStyle: CSSProperties = {
  backgroundColor: "transparent",
  border: `1px solid ${tokens.ink}`,
  borderRadius: "6px",
  color: tokens.ink,
  display: "block",
  fontFamily: fonts.body,
  fontSize: "15px",
  fontWeight: 600,
  letterSpacing: "0.01em",
  padding: "14px 24px",
  textAlign: "center",
  textDecoration: "none",
};
```

Button labels are sentence case (set per template in Phase C). Note: `textTransform: "uppercase"` is removed.

- [ ] **Step 2: Add a `DetailPanel` for ruled detail rows**

The existing `Detail` component is kept (it renders one label/value row). Add a `DetailPanel` wrapper that draws hairline rules between rows so templates use a single panel instead of stacked `InfoCard`s:

```tsx
export function DetailPanel({ children }: { children: ReactNode }) {
  return <Section style={detailPanelStyle}>{children}</Section>;
}
```

```typescript
const detailPanelStyle: CSSProperties = {
  backgroundColor: tokens.cream2,
  border: `1px solid ${tokens.border}`,
  borderRadius: "6px",
  padding: "4px 20px",
  margin: "20px 0",
};
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: no new errors from `email-layout.tsx`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/email/components/email-layout.tsx
git commit -m "Email layout: full-width block button + DetailPanel"
```

---

## Phase C — Template rewrites

### Phase C conventions (the conversion recipe)

Every template in `src/lib/email/templates/` is updated to the same shape:

1. Replace `<EmailLayout preview=... sectionLabel=... sectionMeta=...>` with `<EmailLayout preview=...>`.
2. Immediately inside `EmailLayout`, render a `<StatusBanner mood=...>` (per the table below) — except templates with mood **none**, which render no banner.
3. Wrap the body content in `<Content>` (the new wrapper from Task B1).
4. The first body element is `<H1>` with the headline from the table.
5. The primary CTA uses the new block `<Button>` with a sentence-case label.
6. Replace stacked `InfoCard`s of detail rows with a single `<DetailPanel>` containing `<Detail>` rows.
7. No `§` glyphs anywhere (the components no longer add them).
8. Imports: add `StatusBanner` from `@/lib/email/components/status-banner` and `Content` from the layout as needed.

| Template | Banner mood | Headline (H1) |
|---|---|---|
| registration-confirmation (confirmed) | success | `{childName}'s in for {programName}.` |
| registration-confirmation (waitlisted) | warning | `{childName}'s on the waitlist.` |
| registration-confirmation (pending payment) | warning | `Almost there — one step left.` |
| payment-receipt | success | `Payment received` |
| payment-failed | problem | `Your payment didn't go through` |
| refund-notification (approved) | success | `Refund approved` |
| refund-notification (denied) | problem | `Refund request update` |
| waitlist-promotion | warning | `A spot opened up for {childName}.` |
| payment-balance-reminder | warning | `Balance due: {balanceAmount}` |
| magic-link-login | none | `You're registered` |
| sign-in-link | none | `Sign in to Aspire Sports` |
| email-verification | none | `Verify your email` |
| announcement | none | `{announcementTitle}` |

Subject lines (set in `send.ts`, Phase A4 / A5 — all sentence case):

| Email | Subject |
|---|---|
| Registration confirmed | `Registration confirmed — {childName} for {programName}` |
| Waitlist confirmation | `Waitlist confirmation — {childName} for {programName}` |
| Payment receipt | `Payment receipt — {childName}, {programName}` |
| Payment failed | `Payment failed — {childName}'s {programName} registration` |
| Refund approved | `Refund approved — {amount} for {childName}` |
| Refund denied | `Refund request update — {childName}` |
| Waitlist spot opened | `Action required: a spot opened for {childName}` |
| Balance reminder | `Balance due: {amount} — {programName} {seasonName}` |
| Magic-link login | `You're registered — finish setting up your account` |
| Sign-in link | `Sign in to Aspire Sports` |
| Email verification | `Verify your email — Aspire Sports` |
| Announcement | `{organizationName}: {announcementTitle}` |

### Task C1: registration-confirmation.tsx

**Files:**
- Modify: `src/lib/email/templates/registration-confirmation.tsx`

- [ ] **Step 1: Apply the conversion recipe**

- Add `waitlistClaimHours?: number` to `RegistrationConfirmationEmailProps` (already added to send.ts props in A4 — keep consistent).
- Replace the `EmailLayout` wrapper per the recipe. Banner: `isWaitlisted ? "warning"` / `isPendingPayment ? "warning"` / else `"success"`. Banner text: waitlisted → `"On the waitlist"`, pending → `"Spot held — payment required"`, confirmed → `isPendingPayment ? ... : "Spot confirmed"` (and `· Paid in full` when fully paid).
- H1 per the table (use the confirmed/waitlisted/pending variants).
- Merge the "Registration Details" and "Payment" `InfoCard`s into one `<DetailPanel>` with `<Detail>` rows: Player, Program, Season, Dates, Location, and (when not waitlisted) Amount + a `<StatusPill>` for paid/pending.
- Pending-payment CTA: `<Button href={paymentUrl}>Complete payment →</Button>`; confirmed CTA: `<Button href={dashboardUrl}>View your dashboard →</Button>`.
- **Deep link:** the pending-payment button must link to the payment page. Add a `paymentUrl` prop; `send.ts` passes `${appUrl}/dashboard/registrations/${registrationId}/pay-balance` (the same path the balance reminder uses). Add `paymentUrl: string` to props and to the `send.ts` call in Task A4.
- Replace the hardcoded "48 hours" in the waitlist "what's next" copy with `{waitlistClaimHours} hours`.

- [ ] **Step 2: Typecheck and build**

Run: `npm run typecheck && npm run build`
Expected: PASS for this file (other templates may still error until their tasks).

- [ ] **Step 3: Commit**

```bash
git add src/lib/email/templates/registration-confirmation.tsx src/lib/email/send.ts
git commit -m "Redesign registration-confirmation email"
```

### Task C2: payment-receipt.tsx

**Files:**
- Modify: `src/lib/email/templates/payment-receipt.tsx`

- [ ] **Step 1: Apply the conversion recipe**

- `<StatusBanner mood="success">Payment received</StatusBanner>`.
- H1 `Payment received`.
- One `<DetailPanel>`: Player, Program, Season, Date, Type, Amount paid (bold, sage), Remaining balance (if any), Receipt #.
- Keep the outstanding-balance `InfoCard` with `variant="warning"` when `hasBalance`.
- CTA `<Button href={dashboardUrl}>View your dashboard →</Button>`.
- Keep "Please save this email for your records."

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS for this file.

- [ ] **Step 3: Commit**

```bash
git add src/lib/email/templates/payment-receipt.tsx
git commit -m "Redesign payment-receipt email"
```

### Task C3: payment-failed.tsx

**Files:**
- Modify: `src/lib/email/templates/payment-failed.tsx`

- [ ] **Step 1: Apply the conversion recipe**

- `<StatusBanner mood="problem">Action required — payment failed</StatusBanner>`.
- H1 `Your payment didn't go through`.
- One `<DetailPanel>`: Player, Program, Season, Reason.
- CTA `<Button href={retryUrl}>Retry payment →</Button>`.
- Keep the "Common fixes" `PMuted` copy.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS for this file.

- [ ] **Step 3: Commit**

```bash
git add src/lib/email/templates/payment-failed.tsx
git commit -m "Redesign payment-failed email"
```

### Task C4: refund-notification.tsx

**Files:**
- Modify: `src/lib/email/templates/refund-notification.tsx`

- [ ] **Step 1: Apply the conversion recipe**

- Banner: approved → `<StatusBanner mood="success">Refund approved</StatusBanner>`; denied → `<StatusBanner mood="problem">Refund request update</StatusBanner>`.
- H1 per the table.
- Approved: one `<DetailPanel>` (Program, Season, Player, Amount bold) + the "5–10 business days" paragraph.
- Denied: one `<DetailPanel>` (Program, Season, Player, Reason if present) + the reply-to-email `PMuted`.
- CTA `<Button href={dashboardUrl}>View your dashboard →</Button>`.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS for this file.

- [ ] **Step 3: Commit**

```bash
git add src/lib/email/templates/refund-notification.tsx
git commit -m "Redesign refund-notification email"
```

### Task C5: waitlist-promotion.tsx

**Files:**
- Modify: `src/lib/email/templates/waitlist-promotion.tsx`

- [ ] **Step 1: Apply the conversion recipe**

- `<StatusBanner mood="warning">Action required — {hoursToComplete}-hour deadline</StatusBanner>`.
- H1 `A spot opened up for {childName}.`
- Keep the deadline `InfoCard variant="warning"` and the registration-summary detail rows (use `<DetailPanel>`).
- CTA `<Button href={registerUrl}>Complete registration now →</Button>`.
- **Deep link:** `registerUrl` must point at the registration-completion page, not bare `/dashboard`. In `send.ts` `sendWaitlistPromotionEmail`, set `registerUrl` to `${appUrl}/dashboard/registrations/${registrationId}/pay-balance` (claim + pay step); keep `dashboardUrl` for the secondary link.
- Keep the FAQ section.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS for this file.

- [ ] **Step 3: Commit**

```bash
git add src/lib/email/templates/waitlist-promotion.tsx src/lib/email/send.ts
git commit -m "Redesign waitlist-promotion email + deep-link the CTA"
```

### Task C6: payment-balance-reminder.tsx

**Files:**
- Modify: `src/lib/email/templates/payment-balance-reminder.tsx`

- [ ] **Step 1: Apply the conversion recipe + fix the sectionLabel misuse**

- Remove the dead `const subject = ...` line (line ~61) and the `sectionLabel={subject}` usage entirely.
- `<StatusBanner mood="warning">Balance due</StatusBanner>`.
- H1 `Balance due: {balanceAmount}`.
- Keep the per-`reminderType` `lede` copy and the `InfoCard variant={copy.tone}` → render as `<DetailPanel>` with the tone preserved on an outer wrapper if needed (or keep `InfoCard` here since it carries the tone).
- CTA `<Button href={payBalanceUrl}>Pay balance now →</Button>`.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS for this file.

- [ ] **Step 3: Commit**

```bash
git add src/lib/email/templates/payment-balance-reminder.tsx
git commit -m "Redesign balance-reminder email + drop sectionLabel misuse"
```

### Task C7: magic-link-login.tsx

**Files:**
- Modify: `src/lib/email/templates/magic-link-login.tsx`

- [ ] **Step 1: Apply the conversion recipe (mood: none)**

- `<EmailLayout preview=...>` with no `StatusBanner`.
- Wrap body in `<Content>`.
- H1 `You're registered`.
- CTA `<Button href={magicLinkUrl}>Sign in to your account →</Button>`.
- Keep the expiry note and the copy-paste fallback link.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS for this file.

- [ ] **Step 3: Commit**

```bash
git add src/lib/email/templates/magic-link-login.tsx
git commit -m "Redesign magic-link-login email"
```

### Task C8: Rename password-reset.tsx → sign-in-link.tsx

**Files:**
- Create: `src/lib/email/templates/sign-in-link.tsx`
- Delete: `src/lib/email/templates/password-reset.tsx`

- [ ] **Step 1: Create `sign-in-link.tsx`**

Create the file with the component renamed `SignInLinkEmail`, prop `resetUrl` renamed `signInUrl`, applying the conversion recipe (mood: none, `<Content>` wrapper, block CTA `Sign in →`). Interface:

```typescript
interface SignInLinkEmailProps {
  name: string;
  signInUrl: string;
  expiresIn: string;
}
```

Body: H1 `Sign in to Aspire Sports`, the "no password needed" copy, `<Button href={signInUrl}>Sign in →</Button>`, the expiry note, the copy-paste fallback link.

- [ ] **Step 2: Delete `password-reset.tsx`**

```bash
git rm src/lib/email/templates/password-reset.tsx
```

- [ ] **Step 3: Verify no remaining references**

Run: `grep -rn "password-reset\|PasswordResetEmail" src`
Expected: no matches (Task A5 already switched `signup.ts`/`forgot-password.ts` to `sendSignInLinkEmail`). If any remain, update them.

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/email/templates/sign-in-link.tsx
git commit -m "Rename password-reset email template to sign-in-link"
```

### Task C9: email-verification.tsx

**Files:**
- Modify: `src/lib/email/templates/email-verification.tsx`

- [ ] **Step 1: Apply the conversion recipe (mood: none)**

- `<EmailLayout preview=...>` no banner, `<Content>` wrapper.
- H1 `Verify your email`.
- CTA `<Button href={verifyUrl}>Verify email address →</Button>`.
- Keep the "didn't create an account" note and copy-paste fallback link.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS for this file.

- [ ] **Step 3: Commit**

```bash
git add src/lib/email/templates/email-verification.tsx
git commit -m "Redesign email-verification email"
```

### Task C10: announcement.tsx

**Files:**
- Modify: `src/lib/email/templates/announcement.tsx`

- [ ] **Step 1: Apply the conversion recipe (mood: none)**

- `<EmailLayout preview=...>` no banner, `<Content>` wrapper.
- H1 `{announcementTitle}`.
- Keep the "From {authorName} · {organizationName}" `PMuted`, the quote block, and the subscription-preferences footnote.
- CTA `<Button href={dashboardUrl}>View in dashboard →</Button>`.

- [ ] **Step 2: Typecheck and build**

Run: `npm run typecheck && npm run build`
Expected: PASS — all templates are now converted.

- [ ] **Step 3: Commit**

```bash
git add src/lib/email/templates/announcement.tsx
git commit -m "Redesign announcement email"
```

### Task C11: Visual check of all templates

**Files:**
- Create (temporary): `scripts/preview-emails.ts`

- [ ] **Step 1: Write a preview dump script**

```typescript
// scripts/preview-emails.ts — renders every template to dist-preview/*.html
import { render } from "@react-email/components";
import { writeFileSync, mkdirSync } from "node:fs";
import { RegistrationConfirmationEmail } from "@/lib/email/templates/registration-confirmation";
import { PaymentReceiptEmail } from "@/lib/email/templates/payment-receipt";
import { PaymentFailedEmail } from "@/lib/email/templates/payment-failed";
import { RefundNotificationEmail } from "@/lib/email/templates/refund-notification";
import { WaitlistPromotionEmail } from "@/lib/email/templates/waitlist-promotion";
import { PaymentBalanceReminderEmail } from "@/lib/email/templates/payment-balance-reminder";
import { MagicLinkLoginEmail } from "@/lib/email/templates/magic-link-login";
import { SignInLinkEmail } from "@/lib/email/templates/sign-in-link";
import { EmailVerificationEmail } from "@/lib/email/templates/email-verification";
import { AnnouncementEmail } from "@/lib/email/templates/announcement";

mkdirSync("dist-preview", { recursive: true });
const samples: Record<string, React.ReactElement> = {
  "registration-confirmation": RegistrationConfirmationEmail({
    parentName: "Sarah", childName: "Maya Chen", programName: "Co-Ed 7v7 Soccer",
    seasonName: "Summer 2026", startDate: "June 6, 2026", endDate: "August 15, 2026",
    locationName: "Downtown Facility", locationAddress: "3989 Presidential Pkwy, Columbus",
    amountDue: "$175.00", paymentStatus: "paid", registrationStatus: "confirmed",
    dashboardUrl: "https://aspiresportsohio.com/dashboard",
    paymentUrl: "https://aspiresportsohio.com/dashboard", waitlistClaimHours: 48,
  }),
  // ...one entry per template, with realistic sample props.
};
for (const [name, el] of Object.entries(samples)) {
  writeFileSync(`dist-preview/${name}.html`, await render(el));
}
console.log("Rendered", Object.keys(samples).length, "templates to dist-preview/");
```

Fill in a realistic sample for every template (10 entries; render registration-confirmation and refund-notification twice with both state variants).

- [ ] **Step 2: Run it and open the output**

Run: `npx tsx scripts/preview-emails.ts`
Open `dist-preview/*.html` in a browser. Verify: accent stripe, status banners with correct moods, block CTAs, no `§` glyphs, single detail panels, footer copy.

- [ ] **Step 3: Remove the script and commit**

The preview script is a one-off (the repo keeps no standalone scripts post-launch — see CLAUDE.md "Database write surface"). Delete it; `dist-preview/` is build output and should not be committed (confirm it is git-ignored or add it to `.gitignore`).

```bash
rm scripts/preview-emails.ts
git add -A
git commit -m "Visual-check pass on redesigned email templates"
```

(If only the `.gitignore` changed, commit that; if nothing changed, skip the commit.)

---

## Phase D — Stripe refund webhook

### Task D1: `charge.refunded` webhook handler

**Files:**
- Create: `src/lib/stripe/handle-charge-refunded.ts`
- Modify: `src/lib/stripe/handle-stripe-event.ts`
- Create: `tests/api/webhooks/charge-refunded.test.ts`

- [ ] **Step 1: Write the failing test**

Model it on `tests/api/webhooks/registration-payment.test.ts` (seed an org/user/season/program/location/familyMember/registration/payment row graph; build a fake Stripe object; call the handler; assert DB state). Mock the email module.

```typescript
// tests/api/webhooks/charge-refunded.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import type Stripe from "stripe";
import { getDb } from "@/lib/db";
import { registrations, payments } from "@/lib/db/schema";
import * as emailModule from "@/lib/email/send";
import { handleChargeRefunded } from "@/lib/stripe/handle-charge-refunded";
// Reuse a seed helper that returns { registrationId, paymentIntentId }.

function makeChargeRefunded(opts: {
  paymentIntentId: string;
  amount: number;
  amountRefunded: number;
}): Stripe.Charge {
  return {
    id: `ch_test_${Math.random().toString(36).slice(2)}`,
    object: "charge",
    payment_intent: opts.paymentIntentId,
    amount: opts.amount,
    amount_refunded: opts.amountRefunded,
    refunded: opts.amountRefunded >= opts.amount,
  } as unknown as Stripe.Charge;
}

describe("handleChargeRefunded", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("marks a registration fully refunded and emails the parent", async () => {
    const spy = vi.spyOn(emailModule, "sendRefundNotificationEmail")
      .mockResolvedValue({ success: true });
    // seed a paid registration with paymentIntentId + amountPaidCents 17500
    const { registrationId, paymentIntentId } = await seedPaidRegistration(17500);

    const result = await handleChargeRefunded(
      makeChargeRefunded({ paymentIntentId, amount: 17500, amountRefunded: 17500 }),
    );

    expect(result.status).toBe("processed");
    const [reg] = await getDb().select().from(registrations)
      .where(eq(registrations.id, registrationId));
    expect(reg.paymentStatus).toBe("refunded");
    expect(reg.status).toBe("refunded");
    expect(reg.refundStatus).toBe("processed");
    expect(reg.refundAmountCents).toBe(17500);
    expect(spy).toHaveBeenCalledOnce();
  });

  it("marks a partial refund without cancelling the registration", async () => {
    vi.spyOn(emailModule, "sendRefundNotificationEmail")
      .mockResolvedValue({ success: true });
    const { registrationId, paymentIntentId } = await seedPaidRegistration(17500);

    await handleChargeRefunded(
      makeChargeRefunded({ paymentIntentId, amount: 17500, amountRefunded: 5000 }),
    );

    const [reg] = await getDb().select().from(registrations)
      .where(eq(registrations.id, registrationId));
    expect(reg.paymentStatus).toBe("partial_refund");
    expect(reg.status).not.toBe("refunded");
    expect(reg.refundAmountCents).toBe(5000);
  });

  it("skips when no payment matches the payment intent", async () => {
    const result = await handleChargeRefunded(
      makeChargeRefunded({ paymentIntentId: "pi_nonexistent", amount: 100, amountRefunded: 100 }),
    );
    expect(result.status).toBe("skipped");
  });
});
```

Include the `seedPaidRegistration` helper in the test file (a `payment` row with `stripePaymentIntentId` set and the registration `paymentStatus: "paid"`, `amountPaidCents` set), mirroring `registration-payment.test.ts`'s seed style.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:api -- tests/api/webhooks/charge-refunded.test.ts`
Expected: FAIL — `Cannot find module '@/lib/stripe/handle-charge-refunded'`.

- [ ] **Step 3: Write the handler**

```typescript
// src/lib/stripe/handle-charge-refunded.ts
import type Stripe from "stripe";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  registrations,
  payments,
  familyMembers,
  seasons,
  programs,
  locations,
  users,
} from "@/lib/db/schema";
import { sendRefundNotificationEmail } from "@/lib/email/send";

/**
 * Handler for `charge.refunded`. The webhook is the single source of truth
 * for refund state — it runs for refunds created from the admin UI AND for
 * refunds created directly in the Stripe dashboard, so both converge here.
 *
 * The admin UI sets registrations.refundStatus = "approved" when it creates
 * the Stripe refund; this handler flips it to "processed" on confirmation.
 * Dashboard-initiated refunds arrive with refundStatus still "none".
 */
export async function handleChargeRefunded(
  charge: Stripe.Charge,
): Promise<
  | { status: "skipped"; reason: string }
  | { status: "processed"; registrationId: string; refundedCents: number }
> {
  const paymentIntentId =
    typeof charge.payment_intent === "string"
      ? charge.payment_intent
      : charge.payment_intent?.id;

  if (!paymentIntentId) {
    return { status: "skipped", reason: "charge has no payment_intent" };
  }

  const db = getDb();

  const [payment] = await db
    .select()
    .from(payments)
    .where(eq(payments.stripePaymentIntentId, paymentIntentId))
    .limit(1);

  if (!payment || !payment.registrationId) {
    // Not a registration charge (could be a drop-in/rental refund — out of
    // scope for the registration refund email).
    return { status: "skipped", reason: `no registration payment for ${paymentIntentId}` };
  }

  const [row] = await db
    .select({
      registration: registrations,
      familyMember: familyMembers,
      season: seasons,
      program: programs,
      location: locations,
      user: users,
    })
    .from(registrations)
    .innerJoin(familyMembers, eq(registrations.familyMemberId, familyMembers.id))
    .innerJoin(seasons, eq(registrations.seasonId, seasons.id))
    .innerJoin(programs, eq(seasons.programId, programs.id))
    .innerJoin(locations, eq(programs.locationId, locations.id))
    .innerJoin(users, eq(registrations.registeredByUserId, users.id))
    .where(eq(registrations.id, payment.registrationId));

  if (!row) {
    return { status: "skipped", reason: `registration ${payment.registrationId} not found` };
  }

  const refundedCents = charge.amount_refunded ?? 0;
  if (refundedCents <= 0) {
    return { status: "skipped", reason: "charge.amount_refunded is zero" };
  }

  // amount_refunded is the cumulative total refunded on the charge, so this
  // is correct even on a second partial-refund delivery.
  const originalPaid = charge.amount ?? row.registration.amountPaidCents ?? 0;
  const isFullRefund = refundedCents >= originalPaid;
  const newAmountPaid = Math.max(0, originalPaid - refundedCents);

  // Idempotency belt-and-braces: if already recorded as processed for this
  // amount, do nothing (the stripe_events ledger is the primary guard).
  if (
    row.registration.refundStatus === "processed" &&
    row.registration.refundAmountCents === refundedCents
  ) {
    return { status: "processed", registrationId: row.registration.id, refundedCents };
  }

  await db.transaction(async (tx) => {
    await tx
      .update(registrations)
      .set({
        refundStatus: "processed",
        refundAmountCents: refundedCents,
        amountPaidCents: newAmountPaid,
        paymentStatus: isFullRefund ? "refunded" : "partial_refund",
        status: isFullRefund ? "refunded" : row.registration.status,
        updatedAt: new Date(),
      })
      .where(eq(registrations.id, row.registration.id));

    await tx
      .update(payments)
      .set({ status: "refunded", updatedAt: new Date() })
      .where(eq(payments.id, payment.id));
  });

  sendRefundNotificationEmail({
    userId: row.user.id,
    organizationId: row.location.organizationId ?? undefined,
    registrationId: row.registration.id,
    parentEmail: row.user.email,
    parentName: row.user.firstName || row.user.email.split("@")[0],
    childName: `${row.familyMember.firstName} ${row.familyMember.lastName}`,
    programName: row.program.name,
    seasonName: row.season.name,
    refundAmountCents: refundedCents,
    refundStatus: "approved",
  }).catch((err) =>
    console.error("[stripe webhook] refund email send failed:", err),
  );

  return { status: "processed", registrationId: row.registration.id, refundedCents };
}
```

- [ ] **Step 4: Wire it into the dispatcher**

In `src/lib/stripe/handle-stripe-event.ts`, add the import:

```typescript
import { handleChargeRefunded } from "./handle-charge-refunded";
```

and add a case to the `dispatch` switch:

```typescript
    case "charge.refunded": {
      const charge = event.data.object as Stripe.Charge;
      const result = await handleChargeRefunded(charge);
      console.log(`[stripe webhook] charge.refunded → ${result.status}`, result);
      break;
    }
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm run test:api -- tests/api/webhooks/charge-refunded.test.ts`
Expected: PASS (3 tests). (Start the dev server first per CLAUDE.md if the `api` project requires it.)

- [ ] **Step 6: Commit**

```bash
git add src/lib/stripe/handle-charge-refunded.ts src/lib/stripe/handle-stripe-event.ts tests/api/webhooks/charge-refunded.test.ts
git commit -m "Add charge.refunded webhook handler as refund source of truth"
```

### Task D2: Slim down the admin refund action

**Files:**
- Modify: `src/lib/payments/admin-refund.ts`

- [ ] **Step 1: Stop the admin action from doing tracking updates + email**

The webhook now owns DB tracking and the email. `adminRefund` should only: validate, create the Stripe refund, and mark the registration `refundStatus: "approved"` (in-flight). Replace the post-Stripe block (the `registrations` update, the `payments` update, and the `sendRefundNotificationEmail` call — lines ~141-187) with:

```typescript
  // The charge.refunded webhook is the single writer of refund tracking and
  // the customer email. Here we only mark the refund in-flight so the admin
  // UI can show a "processing" state until Stripe confirms.
  const [updated] = await getDb()
    .update(registrations)
    .set({
      refundStatus: "approved",
      updatedAt: new Date(),
    })
    .where(eq(registrations.id, registration.id))
    .returning();

  const isPartial = refundAmountCents > 0 && refundAmountCents < previousAmountPaid;

  return {
    ok: true,
    registration: updated,
    stripeRefundId,
    isPartial,
  };
```

Remove the now-unused imports: `payments`, `users`, `sendRefundNotificationEmail`. Update the function's doc comment to state the webhook owns settlement. The `childName`/`programName`/`seasonName` fields in `AdminRefundInput` are now unused by `adminRefund` — keep the input shape for the caller but they may be dropped; simplest is to leave `AdminRefundInput` as-is to avoid touching `refunds/[id].ts` (it still passes them harmlessly).

- [ ] **Step 2: Edge case — a $0 refund or a refund with no payment intent**

If `refundAmountCents === 0` or there is no `stripePaymentIntentId`, no Stripe refund is created and therefore no `charge.refunded` webhook will fire. In that case the admin action must still finalize. Add, before the `refundStatus: "approved"` update:

```typescript
  // No Stripe refund was created (zero amount, or no payment intent on
  // record) — there will be no webhook. Finalize synchronously.
  if (!stripeRefundId) {
    const [updated] = await getDb()
      .update(registrations)
      .set({
        refundStatus: "processed",
        status: "refunded",
        paymentStatus: "refunded",
        refundAmountCents,
        updatedAt: new Date(),
      })
      .where(eq(registrations.id, registration.id))
      .returning();
    return { ok: true, registration: updated, stripeRefundId: null, isPartial: false };
  }
```

- [ ] **Step 3: Typecheck and build**

Run: `npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/payments/admin-refund.ts
git commit -m "Slim admin refund to Stripe call + in-flight marker; webhook owns settlement"
```

### Task D3: Admin refunds UI — copy for the in-flight state

**Files:**
- Modify: `src/components/admin/refunds-management.tsx`

- [ ] **Step 1: Confirm the `approved` status renders sensibly**

`refunds-management.tsx` already filters on `refundStatus === "approved"`. Read the component and ensure the label shown for an `approved` refund reads as in-flight, e.g. "Approved — processing", and that a `processed` refund reads as "Refunded". If the component has a status-label map, update the `approved` entry; if it shows a raw value, add a small label map. Keep the change minimal — copy only.

- [ ] **Step 2: Typecheck and build**

Run: `npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/refunds-management.tsx
git commit -m "Admin refunds: label the in-flight (approved) refund state"
```

### Task D4: Add `charge.refunded` to the local Stripe listener

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Update the `stripe:listen` script**

Append `,charge.refunded` to the `--events` list:

```json
"stripe:listen": "stripe listen --forward-to localhost:4321/api/webhooks/stripe --events checkout.session.completed,payment_intent.succeeded,payment_intent.payment_failed,charge.refunded",
```

- [ ] **Step 2: Commit**

```bash
git add package.json
git commit -m "Add charge.refunded to the local Stripe listener events"
```

---

## Phase E — Verification

### Task E1: Full pre-push verification

- [ ] **Step 1: Typecheck**

Run: `npm run typecheck`
Expected: zero errors.

- [ ] **Step 2: Unit tests**

Run: `npm run test:unit`
Expected: all pass, including the new `tests/unit/email/` tests.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: success. (Pre-existing `Astro.request.headers` prerender warnings are noise per CLAUDE.md.)

- [ ] **Step 4: API tests (dev server up)**

Start the dev server (`R2_MOCK=1 CRON_SECRET=devsecret npm run dev`), then in another shell:

Run: `CRON_SECRET=devsecret TEST_BASE_URL=http://localhost:4321 npm run test:api -- tests/api/webhooks/`
Expected: webhook tests pass, including `charge-refunded.test.ts`.

- [ ] **Step 5: Confirm no schema drift**

Run: `npm run db:generate`
Expected: "No schema changes" — this overhaul intentionally adds no migration. If a migration file is produced, something touched the schema unexpectedly; investigate before committing.

- [ ] **Step 6: Final commit if anything changed**

```bash
git status
# commit only if step 5 or earlier left intended changes
```

---

## Rollout notes (not code — for the human merging this)

- **Stripe Dashboard:** add `charge.refunded` to the production webhook endpoint's enabled events. Without this the handler never fires in prod.
- **Connect refunds:** refunds on connected accounts deliver `charge.refunded` to the separate `stripe-connect.ts` webhook. Org Connect onboarding is not live, so this is out of scope; if Connect goes live, wire `handleChargeRefunded` into the Connect webhook too.
- **Resend:** confirm `aspiresportsohio.com` domain authentication (SPF/DKIM/DMARC) is verified in Resend — unrelated to this code but gates deliverability.
- **Netlify:** the new scheduled function needs `CRON_SECRET` in the site env (already set).

## Self-review

- **Spec coverage:** §1.1 channel model → A3/A4; §1.2 timezone → A1; §1.3 plain-text → A2; §1.4 auth logging → A5; §1.5 scheduler → A6; §1.6 template fixes → C1/C5/C6/C8 + subject table; §1.7 email-verification retained → C9; §2.1 webhook → D1; §2.2 admin slim-down → D2; §2.3 denials synchronous → unchanged (Task D2 leaves the deny path in `refunds/[id].ts` alone); §2.4 dashboard-initiated → D1 (same handler); §2.5 schema → resolved, no migration; §3.1 primitives → B1/B2/B3; §3.2 banner moods → Phase C table; §3.3 headlines → Phase C table; §3.4 subjects → Phase C subject table; §3.5 mobile → C11 visual check.
- **Placeholder scan:** no "TBD"/"TODO"; per-template tasks reference the concrete recipe + tables.
- **Type consistency:** `sendTransactionalEmail`, `renderEmail`, `formatEmailDate`/`formatEmailDateTime`, `StatusBanner`, `Content`, `DetailPanel`, `SignInLinkEmail`/`signInUrl`, `handleChargeRefunded` are used consistently across tasks.
