# Marketing Welcome Series Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A 3-email welcome → story → activation drip for first-time registrants, driven by a self-contained daily cron, with an opt-out + one-click unsubscribe mechanism.

**Architecture:** A daily cron (`/api/cron/send-welcome-series`) does two passes each run — enroll any user with a confirmed registration, then send any drip step now due. Progress is tracked in `email_logs`; enrollment and opt-out are two new nullable `users` columns. Emails are React Email templates rendered in-repo and sent via Resend's normal send API with a `List-Unsubscribe` header — no Resend Broadcasts.

**Tech Stack:** Astro 5 SSR, React 19, `@react-email/components`, Resend, Drizzle ORM (PostgreSQL), Netlify scheduled functions, Node `crypto` (HMAC), Vitest.

**Spec:** `docs/superpowers/specs/2026-05-20-marketing-welcome-series-design.md`

**Worktree:** `feat/marketing-welcome-series` (already created; deps installed).

---

## File Structure

**New files:**
- `src/lib/marketing/welcome-series.ts` — sequence config + the pure `dueWelcomeSeriesSteps` step-selection function.
- `src/lib/marketing/unsubscribe-token.ts` — HMAC sign/verify for unsubscribe tokens (pure; secret passed in).
- `src/lib/email/templates/welcome-1-welcome.tsx` — email 1.
- `src/lib/email/templates/welcome-2-story.tsx` — email 2.
- `src/lib/email/templates/welcome-3-activation.tsx` — email 3.
- `src/pages/api/marketing/unsubscribe.ts` — the unsubscribe endpoint (GET link + POST one-click).
- `src/pages/api/cron/send-welcome-series.ts` — the daily enroll + drip cron.
- `netlify/functions/scheduled-send-welcome-series.ts` — the daily scheduler.
- `tests/unit/marketing/welcome-series.test.ts` — unit tests for step selection.
- `tests/unit/marketing/unsubscribe-token.test.ts` — unit tests for the token.
- `tests/api/cron/send-welcome-series.test.ts` — integration test for the cron.

**Modified files:**
- `src/lib/db/schema/users.ts` — two new nullable columns.
- `src/lib/env.ts` — add `MARKETING_UNSUBSCRIBE_SECRET`.
- `.env.example` — document `MARKETING_UNSUBSCRIBE_SECRET`.
- `src/lib/email/index.ts` — `EmailOptions` + `sendEmail` gain optional `headers`.
- `src/lib/email/send.ts` — add the exported `sendWelcomeSeriesEmail` helper.

---

## Task 1: Schema — enrollment + opt-out columns

**Files:**
- Modify: `src/lib/db/schema/users.ts`
- Create: a generated migration under `src/lib/db/migrations/`

- [ ] **Step 1: Add the two columns**

In `src/lib/db/schema/users.ts`, inside the `users` `pgTable` column object, immediately after the `alsoEmailCopy` line and before `createdAt`, add:

```typescript
  welcomeSeriesEnrolledAt: timestamp("welcome_series_enrolled_at"),
  marketingOptedOutAt: timestamp("marketing_opted_out_at"),
```

(`timestamp` is already imported in this file.)

- [ ] **Step 2: Generate the migration**

Run: `npm run db:generate`
Expected: a new `src/lib/db/migrations/NNNN_*.sql` adding two nullable columns. Open it and confirm it is only `ALTER TABLE "users" ADD COLUMN ...` for the two columns — nothing else.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/db/schema/users.ts src/lib/db/migrations/
git commit -m "Add welcome-series enrollment + marketing opt-out columns"
```

## Task 2: Unsubscribe token (HMAC)

**Files:**
- Modify: `src/lib/env.ts`
- Modify: `.env.example`
- Create: `src/lib/marketing/unsubscribe-token.ts`
- Create: `tests/unit/marketing/unsubscribe-token.test.ts`

- [ ] **Step 1: Add the env var**

In `src/lib/env.ts`, in the zod schema object (alongside `CRON_SECRET`), add:

```typescript
  MARKETING_UNSUBSCRIBE_SECRET: z.string().min(1).optional(),
```

In `.env.example`, near the `CRON_SECRET=` line, add:

```
# HMAC secret for signing marketing-email unsubscribe links. Must be stable
# (rotating it invalidates every existing unsubscribe link). Any long random string.
MARKETING_UNSUBSCRIBE_SECRET=
```

- [ ] **Step 2: Write the failing test**

```typescript
// tests/unit/marketing/unsubscribe-token.test.ts
import { describe, it, expect } from "vitest";
import {
  signUnsubscribeToken,
  verifyUnsubscribeToken,
} from "@/lib/marketing/unsubscribe-token";

const SECRET = "test-unsubscribe-secret";
const USER_ID = "11111111-1111-1111-1111-111111111111";

describe("unsubscribe token", () => {
  it("round-trips a user id", () => {
    const token = signUnsubscribeToken(USER_ID, SECRET);
    expect(verifyUnsubscribeToken(token, SECRET)).toBe(USER_ID);
  });

  it("rejects a tampered token", () => {
    const token = signUnsubscribeToken(USER_ID, SECRET);
    const tampered = token.slice(0, -2) + (token.slice(-2) === "aa" ? "bb" : "aa");
    expect(verifyUnsubscribeToken(tampered, SECRET)).toBeNull();
  });

  it("rejects a token signed with a different secret", () => {
    const token = signUnsubscribeToken(USER_ID, SECRET);
    expect(verifyUnsubscribeToken(token, "other-secret")).toBeNull();
  });

  it("rejects a malformed token", () => {
    expect(verifyUnsubscribeToken("garbage", SECRET)).toBeNull();
    expect(verifyUnsubscribeToken("", SECRET)).toBeNull();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm run test:unit -- tests/unit/marketing/unsubscribe-token.test.ts`
Expected: FAIL — `Cannot find module '@/lib/marketing/unsubscribe-token'`.

- [ ] **Step 4: Write the implementation**

```typescript
// src/lib/marketing/unsubscribe-token.ts
import crypto from "node:crypto";

/**
 * Stateless unsubscribe tokens: an HMAC-SHA256 of the user id. No DB token
 * table — the link stays valid indefinitely, which is what an unsubscribe
 * link must do. The signing secret must be stable across deploys.
 */
function sign(userId: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(userId).digest("base64url");
}

/** Build `<userId>.<hmac>`. */
export function signUnsubscribeToken(userId: string, secret: string): string {
  return `${userId}.${sign(userId, secret)}`;
}

/** Return the user id if the token is authentic, else null. */
export function verifyUnsubscribeToken(
  token: string,
  secret: string,
): string | null {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const userId = token.slice(0, dot);
  const provided = token.slice(dot + 1);
  const expected = sign(userId, secret);
  if (provided.length !== expected.length) return null;
  if (
    !crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected))
  ) {
    return null;
  }
  return userId;
}

/** Read the signing secret from env; throws in prod if unset. */
export function getUnsubscribeSecret(): string {
  const s =
    import.meta.env.MARKETING_UNSUBSCRIBE_SECRET ??
    process.env.MARKETING_UNSUBSCRIBE_SECRET;
  if (!s) {
    if (import.meta.env.PROD) {
      throw new Error("MARKETING_UNSUBSCRIBE_SECRET is not configured");
    }
    return "dev-insecure-unsubscribe-secret";
  }
  return s;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test:unit -- tests/unit/marketing/unsubscribe-token.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/env.ts .env.example src/lib/marketing/unsubscribe-token.ts tests/unit/marketing/unsubscribe-token.test.ts
git commit -m "Add HMAC unsubscribe-token module"
```

## Task 3: Welcome-series config + step-selection logic

**Files:**
- Create: `src/lib/marketing/welcome-series.ts`
- Create: `tests/unit/marketing/welcome-series.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/marketing/welcome-series.test.ts
import { describe, it, expect } from "vitest";
import {
  WELCOME_SERIES_STEPS,
  dueWelcomeSeriesSteps,
} from "@/lib/marketing/welcome-series";

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);

describe("dueWelcomeSeriesSteps", () => {
  it("returns no steps before the first offset", () => {
    expect(
      dueWelcomeSeriesSteps({
        enrolledAt: daysAgo(1),
        optedOutAt: null,
        sentEmailTypes: new Set(),
        now: new Date(),
      }),
    ).toEqual([]);
  });

  it("returns step 1 once its offset has elapsed", () => {
    const due = dueWelcomeSeriesSteps({
      enrolledAt: daysAgo(2),
      optedOutAt: null,
      sentEmailTypes: new Set(),
      now: new Date(),
    });
    expect(due.map((s) => s.step)).toEqual([1]);
  });

  it("does not re-return a step already sent", () => {
    const due = dueWelcomeSeriesSteps({
      enrolledAt: daysAgo(6),
      optedOutAt: null,
      sentEmailTypes: new Set(["welcome_series_1"]),
      now: new Date(),
    });
    expect(due.map((s) => s.step)).toEqual([2]);
  });

  it("returns nothing when opted out", () => {
    expect(
      dueWelcomeSeriesSteps({
        enrolledAt: daysAgo(30),
        optedOutAt: daysAgo(1),
        sentEmailTypes: new Set(),
        now: new Date(),
      }),
    ).toEqual([]);
  });

  it("returns all remaining due steps when the cron missed days", () => {
    const due = dueWelcomeSeriesSteps({
      enrolledAt: daysAgo(20),
      optedOutAt: null,
      sentEmailTypes: new Set(),
      now: new Date(),
    });
    expect(due.map((s) => s.step)).toEqual([1, 2, 3]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- tests/unit/marketing/welcome-series.test.ts`
Expected: FAIL — `Cannot find module '@/lib/marketing/welcome-series'`.

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/marketing/welcome-series.ts
/**
 * The marketing welcome series: a 3-email welcome → story → activation drip
 * for first-time registrants. Day offsets are measured from the user's
 * `welcome_series_enrolled_at`. Tune the cadence by editing this array.
 */
export interface WelcomeSeriesStep {
  step: 1 | 2 | 3;
  dayOffset: number;
  emailType: string;
}

export const WELCOME_SERIES_STEPS: readonly WelcomeSeriesStep[] = [
  { step: 1, dayOffset: 2, emailType: "welcome_series_1" },
  { step: 2, dayOffset: 5, emailType: "welcome_series_2" },
  { step: 3, dayOffset: 10, emailType: "welcome_series_3" },
] as const;

/** The window (days) a user stays a drip candidate after enrollment. */
export const WELCOME_SERIES_WINDOW_DAYS =
  WELCOME_SERIES_STEPS[WELCOME_SERIES_STEPS.length - 1].dayOffset + 1;

/**
 * Pure: given a user's enrollment date, opt-out date, the set of
 * welcome-series emailTypes already sent, and "now", return the steps that
 * are due to send. Returns nothing if the user has opted out.
 */
export function dueWelcomeSeriesSteps(input: {
  enrolledAt: Date;
  optedOutAt: Date | null;
  sentEmailTypes: Set<string>;
  now: Date;
}): WelcomeSeriesStep[] {
  if (input.optedOutAt) return [];
  const daysSince = Math.floor(
    (input.now.getTime() - input.enrolledAt.getTime()) / 86_400_000,
  );
  return WELCOME_SERIES_STEPS.filter(
    (s) => daysSince >= s.dayOffset && !input.sentEmailTypes.has(s.emailType),
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit -- tests/unit/marketing/welcome-series.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/marketing/welcome-series.ts tests/unit/marketing/welcome-series.test.ts
git commit -m "Add welcome-series config + step-selection logic"
```

## Task 4: `sendEmail` custom headers support

**Files:**
- Modify: `src/lib/email/index.ts`

- [ ] **Step 1: Add `headers` to `EmailOptions` and the send call**

In `src/lib/email/index.ts`, change the `EmailOptions` interface to add a `headers` field:

```typescript
export interface EmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  headers?: Record<string, string>;
}
```

In `sendEmail`, add `headers` to the `resend.emails.send` call:

```typescript
    const { data, error } = await resend.emails.send({
      from: EMAIL_FROM,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
      replyTo: options.replyTo,
      headers: options.headers,
    });
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/email/index.ts
git commit -m "Support custom headers on sendEmail"
```

## Task 5: Welcome-series email templates + send helper

**Files:**
- Create: `src/lib/email/templates/welcome-1-welcome.tsx`
- Create: `src/lib/email/templates/welcome-2-story.tsx`
- Create: `src/lib/email/templates/welcome-3-activation.tsx`
- Modify: `src/lib/email/send.ts`

Each template reuses the `email-layout` primitives. The exports from
`src/lib/email/components/email-layout.tsx` available include: `EmailLayout`
(props `{ preview, appUrl?, children }`), `Content`, `H1`, `P`, `PMuted`,
`Button`, `tokens`, `fonts`. Templates take a `recipientName` and an
`unsubscribeUrl`; the body ends with a `PMuted` unsubscribe line. The copy
below is **draft copy for founder review** — implement it verbatim; the founder
revises wording later.

- [ ] **Step 1: Create `welcome-1-welcome.tsx`**

```tsx
// src/lib/email/templates/welcome-1-welcome.tsx
import { Link } from "@react-email/components";
import {
  Button,
  Content,
  EmailLayout,
  H1,
  P,
  PMuted,
  tokens,
} from "@/lib/email/components/email-layout";

interface WelcomeEmail1Props {
  recipientName: string;
  dashboardUrl: string;
  unsubscribeUrl: string;
}

export function WelcomeEmail1({
  recipientName,
  dashboardUrl,
  unsubscribeUrl,
}: WelcomeEmail1Props) {
  return (
    <EmailLayout preview="Welcome to Aspire Sports — here's what happens next">
      <Content>
        <H1>You're in. Welcome to Aspire.</H1>
        <P>Hi {recipientName || "there"},</P>
        <P>
          Thanks for registering — we're glad you're here. Aspire Sports runs
          neighborhood leagues built around the people, not just the games:
          you play close to home, with a real scene around the matches.
        </P>
        <P>
          You don't need to do anything right now. We'll be in touch with team
          and schedule details as your season takes shape — and your dashboard
          always has the latest.
        </P>
        <Button href={dashboardUrl}>Visit your dashboard →</Button>
        <PMuted>
          You're getting this because you registered with Aspire Sports.{" "}
          <Link href={unsubscribeUrl} style={{ color: tokens.inkMuted }}>
            Unsubscribe from these emails
          </Link>
          .
        </PMuted>
      </Content>
    </EmailLayout>
  );
}

export default WelcomeEmail1;
```

- [ ] **Step 2: Create `welcome-2-story.tsx`**

```tsx
// src/lib/email/templates/welcome-2-story.tsx
import { Link } from "@react-email/components";
import {
  Button,
  Content,
  EmailLayout,
  H1,
  P,
  PMuted,
  tokens,
} from "@/lib/email/components/email-layout";

interface WelcomeEmail2Props {
  recipientName: string;
  dashboardUrl: string;
  unsubscribeUrl: string;
}

export function WelcomeEmail2({
  recipientName,
  dashboardUrl,
  unsubscribeUrl,
}: WelcomeEmail2Props) {
  return (
    <EmailLayout preview="What makes an Aspire league different">
      <Content>
        <H1>Built around your night, not just the game.</H1>
        <P>Hi {recipientName || "there"},</P>
        <P>
          Most leagues drop you on a field with strangers and send you home.
          We built Aspire the other way around — neighborhood-anchored, so you
          play near where you live, and captain-first, so every team has
          someone who actually knows the people on it.
        </P>
        <P>
          The league itself is run tight: fair refs, reliable communication,
          and a real post-game scene. The founding cohort sets the tone — and
          right now, that's you.
        </P>
        <Button href={dashboardUrl}>See what's coming →</Button>
        <PMuted>
          You're getting this because you registered with Aspire Sports.{" "}
          <Link href={unsubscribeUrl} style={{ color: tokens.inkMuted }}>
            Unsubscribe from these emails
          </Link>
          .
        </PMuted>
      </Content>
    </EmailLayout>
  );
}

export default WelcomeEmail2;
```

- [ ] **Step 3: Create `welcome-3-activation.tsx`**

```tsx
// src/lib/email/templates/welcome-3-activation.tsx
import { Link } from "@react-email/components";
import {
  Button,
  Content,
  EmailLayout,
  H1,
  P,
  PMuted,
  tokens,
} from "@/lib/email/components/email-layout";

interface WelcomeEmail3Props {
  recipientName: string;
  dashboardUrl: string;
  unsubscribeUrl: string;
}

export function WelcomeEmail3({
  recipientName,
  dashboardUrl,
  unsubscribeUrl,
}: WelcomeEmail3Props) {
  return (
    <EmailLayout preview="The best leagues are the ones you bring friends to">
      <Content>
        <H1>Bring your people.</H1>
        <P>Hi {recipientName || "there"},</P>
        <P>
          A league night is better with your crew. The people who have the
          best season are the ones who show up with friends — so this is your
          nudge to pull a few in.
        </P>
        <P>
          Know someone who'd be in? Send them our way. The more of your circle
          that plays, the better every match night gets.
        </P>
        <Button href={dashboardUrl}>Visit your dashboard →</Button>
        <PMuted>
          You're getting this because you registered with Aspire Sports.{" "}
          <Link href={unsubscribeUrl} style={{ color: tokens.inkMuted }}>
            Unsubscribe from these emails
          </Link>
          .
        </PMuted>
      </Content>
    </EmailLayout>
  );
}

export default WelcomeEmail3;
```

- [ ] **Step 4: Add `sendWelcomeSeriesEmail` to `send.ts`**

In `src/lib/email/send.ts`, add these imports at the top (next to the other template imports):

```typescript
import { WelcomeEmail1 } from "./templates/welcome-1-welcome";
import { WelcomeEmail2 } from "./templates/welcome-2-story";
import { WelcomeEmail3 } from "./templates/welcome-3-activation";
import {
  signUnsubscribeToken,
  getUnsubscribeSecret,
} from "@/lib/marketing/unsubscribe-token";
```

Add this exported function at the end of `send.ts` (it uses the module-private `logEmail`, and `renderEmail`/`sendEmail`/`isEmailConfigured` already imported):

```typescript
// Welcome-series marketing email. Unlike sendTransactionalEmail this is
// opt-out marketing: it carries a List-Unsubscribe header and a body
// unsubscribe link. The caller (the cron) has already checked opt-out state.
const WELCOME_STEP_META: Record<
  1 | 2 | 3,
  { subject: string; emailType: string; Component: typeof WelcomeEmail1 }
> = {
  1: {
    subject: "Welcome to Aspire Sports",
    emailType: "welcome_series_1",
    Component: WelcomeEmail1,
  },
  2: {
    subject: "What makes an Aspire league different",
    emailType: "welcome_series_2",
    Component: WelcomeEmail2,
  },
  3: {
    subject: "Bring your people",
    emailType: "welcome_series_3",
    Component: WelcomeEmail3,
  },
};

export async function sendWelcomeSeriesEmail(params: {
  userId: string;
  step: 1 | 2 | 3;
  recipientEmail: string;
  recipientName: string;
}) {
  if (!isEmailConfigured()) {
    console.warn("Email not configured, skipping welcome-series email");
    return { success: false, error: "Email not configured" };
  }

  const appUrl = env.PUBLIC_APP_URL;
  const meta = WELCOME_STEP_META[params.step];
  const token = signUnsubscribeToken(params.userId, getUnsubscribeSecret());
  const unsubscribeUrl = `${appUrl}/api/marketing/unsubscribe?token=${encodeURIComponent(token)}`;

  const { html, text } = await renderEmail(
    meta.Component({
      recipientName: params.recipientName,
      dashboardUrl: `${appUrl}/dashboard`,
      unsubscribeUrl,
    }),
  );

  const result = await sendEmail({
    to: params.recipientEmail,
    subject: meta.subject,
    html,
    text,
    headers: {
      "List-Unsubscribe": `<${unsubscribeUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  });

  await logEmail({
    userId: params.userId,
    emailType: meta.emailType,
    recipientEmail: params.recipientEmail,
    subject: meta.subject,
    resendMessageId: result.messageId,
    status: result.success ? "sent" : "failed",
  });

  return result;
}
```

- [ ] **Step 5: Typecheck and build**

Run: `npm run typecheck && npm run build`
Expected: 0 type errors; build completes.

- [ ] **Step 6: Commit**

```bash
git add src/lib/email/templates/welcome-1-welcome.tsx src/lib/email/templates/welcome-2-story.tsx src/lib/email/templates/welcome-3-activation.tsx src/lib/email/send.ts
git commit -m "Add welcome-series email templates + send helper"
```

## Task 6: Unsubscribe endpoint

**Files:**
- Create: `src/pages/api/marketing/unsubscribe.ts`

- [ ] **Step 1: Write the endpoint**

```typescript
// src/pages/api/marketing/unsubscribe.ts
import type { APIRoute } from "astro";
import { eq, isNull, and } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import {
  verifyUnsubscribeToken,
  getUnsubscribeSecret,
} from "@/lib/marketing/unsubscribe-token";

export const prerender = false;

/** Minimal branded HTML confirmation/error page. */
function page(title: string, message: string, status: number): Response {
  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title} — Aspire Sports</title></head>
<body style="margin:0;background:#F5EFE3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<div style="max-width:480px;margin:64px auto;padding:32px;background:#FAF7ED;border:1px solid #DBD5C5;border-radius:6px;text-align:center;">
<h1 style="font-size:22px;color:#1B1D27;margin:0 0 12px;">${title}</h1>
<p style="font-size:15px;line-height:1.6;color:#4F5158;margin:0;">${message}</p>
</div></body></html>`;
  return new Response(html, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

/** Opt the user out; idempotent. Returns true if the token was valid. */
async function applyUnsubscribe(token: string | null): Promise<boolean> {
  if (!token) return false;
  const userId = verifyUnsubscribeToken(token, getUnsubscribeSecret());
  if (!userId) return false;
  await getDb()
    .update(users)
    .set({ marketingOptedOutAt: new Date(), updatedAt: new Date() })
    .where(and(eq(users.id, userId), isNull(users.marketingOptedOutAt)));
  return true;
}

// GET — the unsubscribe link clicked from an email.
export const GET: APIRoute = async ({ url }) => {
  const ok = await applyUnsubscribe(url.searchParams.get("token"));
  return ok
    ? page(
        "You're unsubscribed",
        "You won't receive any more marketing emails from Aspire Sports. You'll still get essential emails about your registrations.",
        200,
      )
    : page(
        "Link not valid",
        "This unsubscribe link is invalid or expired. Please use the link from a recent Aspire Sports email.",
        400,
      );
};

// POST — Gmail/Apple one-click (List-Unsubscribe-Post). Body-less; token in query.
export const POST: APIRoute = async ({ url }) => {
  const ok = await applyUnsubscribe(url.searchParams.get("token"));
  return new Response(null, { status: ok ? 200 : 400 });
};
```

- [ ] **Step 2: Typecheck and build**

Run: `npm run typecheck && npm run build`
Expected: 0 type errors; build completes.

- [ ] **Step 3: Commit**

```bash
git add src/pages/api/marketing/unsubscribe.ts
git commit -m "Add marketing unsubscribe endpoint"
```

## Task 7: The welcome-series cron

**Files:**
- Create: `src/pages/api/cron/send-welcome-series.ts`
- Create: `tests/api/cron/send-welcome-series.test.ts`

- [ ] **Step 1: Write the failing test**

Model the seed helpers on `tests/api/cron/send-balance-reminders.test.ts` and `tests/api/webhooks/registration-payment.test.ts` (seed an org/location/sport/program/season/user/familyMember/registration graph). The test drives the handler over HTTP at `TEST_BASE_URL` with the `x-cron-secret` header, like the other cron tests.

```typescript
// tests/api/cron/send-welcome-series.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { eq, and } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users, emailLogs, registrations } from "@/lib/db/schema";
// Reuse a seed helper that creates a user with one CONFIRMED registration and
// returns { userId }. Implement it in this file mirroring the balance-reminder
// test's seed graph, with registrations.status = "confirmed".

const ENDPOINT = "/api/cron/send-welcome-series";
const BASE = process.env.TEST_BASE_URL ?? "http://localhost:4321";
const CRON_SECRET = process.env.CRON_SECRET ?? "devsecret";

function runCron() {
  return fetch(`${BASE}${ENDPOINT}`, {
    method: "POST",
    headers: { "x-cron-secret": CRON_SECRET },
  });
}

describe("send-welcome-series cron", () => {
  it("rejects an unauthenticated request", async () => {
    const res = await fetch(`${BASE}${ENDPOINT}`, { method: "POST" });
    expect(res.status).toBe(401);
  });

  it("enrolls a user who has a confirmed registration", async () => {
    const { userId } = await seedConfirmedRegistrationUser();
    await runCron();
    const [u] = await getDb().select().from(users).where(eq(users.id, userId));
    expect(u.welcomeSeriesEnrolledAt).not.toBeNull();
  });

  it("sends step 1 once enrollment is >= 2 days old, and is idempotent", async () => {
    const { userId } = await seedConfirmedRegistrationUser();
    // Backdate enrollment to 3 days ago.
    await getDb()
      .update(users)
      .set({ welcomeSeriesEnrolledAt: new Date(Date.now() - 3 * 86_400_000) })
      .where(eq(users.id, userId));

    await runCron();
    const logs1 = await getDb()
      .select()
      .from(emailLogs)
      .where(and(eq(emailLogs.userId, userId), eq(emailLogs.emailType, "welcome_series_1")));
    expect(logs1.length).toBe(1);

    await runCron(); // second run must not double-send
    const logs2 = await getDb()
      .select()
      .from(emailLogs)
      .where(and(eq(emailLogs.userId, userId), eq(emailLogs.emailType, "welcome_series_1")));
    expect(logs2.length).toBe(1);
  });

  it("skips an opted-out user", async () => {
    const { userId } = await seedConfirmedRegistrationUser();
    await getDb()
      .update(users)
      .set({
        welcomeSeriesEnrolledAt: new Date(Date.now() - 3 * 86_400_000),
        marketingOptedOutAt: new Date(),
      })
      .where(eq(users.id, userId));

    await runCron();
    const logs = await getDb()
      .select()
      .from(emailLogs)
      .where(and(eq(emailLogs.userId, userId), eq(emailLogs.emailType, "welcome_series_1")));
    expect(logs.length).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:api -- tests/api/cron/send-welcome-series.test.ts`
Expected: FAIL — the endpoint 404s (route does not exist yet).

- [ ] **Step 3: Write the cron endpoint**

```typescript
// src/pages/api/cron/send-welcome-series.ts
import type { APIRoute } from "astro";
import { and, eq, isNull, isNotNull, gte, exists, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users, registrations, emailLogs } from "@/lib/db/schema";
import { sendWelcomeSeriesEmail } from "@/lib/email/send";
import {
  WELCOME_SERIES_STEPS,
  WELCOME_SERIES_WINDOW_DAYS,
  dueWelcomeSeriesSteps,
} from "@/lib/marketing/welcome-series";

/**
 * POST /api/cron/send-welcome-series
 *
 * Daily. Two passes: (1) enroll any user who has a confirmed registration and
 * no welcome_series_enrolled_at; (2) for each enrolled, non-opted-out user
 * still inside the drip window, send any step now due. Idempotent — steps are
 * gated on email_logs. Auth: x-cron-secret header matching CRON_SECRET.
 */
export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const secret = import.meta.env.CRON_SECRET;
  const provided = request.headers.get("x-cron-secret");
  if (secret) {
    if (provided !== secret) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
  } else if (import.meta.env.PROD) {
    console.error("[cron] CRON_SECRET not configured in production. Refusing.");
    return new Response(JSON.stringify({ error: "Server misconfigured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const startedAt = Date.now();
  const db = getDb();
  const now = new Date();

  // Pass 1 — enroll. Stamp users with a confirmed registration and no
  // enrollment yet.
  const enrolledRows = await db
    .update(users)
    .set({ welcomeSeriesEnrolledAt: now, updatedAt: now })
    .where(
      and(
        isNull(users.welcomeSeriesEnrolledAt),
        exists(
          db
            .select({ one: sql`1` })
            .from(registrations)
            .where(
              and(
                eq(registrations.registeredByUserId, users.id),
                eq(registrations.status, "confirmed"),
              ),
            ),
        ),
      ),
    )
    .returning({ id: users.id });
  const enrolled = enrolledRows.length;

  // Pass 2 — drip. Candidates: enrolled, not opted out, within the window.
  const windowStart = new Date(
    now.getTime() - WELCOME_SERIES_WINDOW_DAYS * 86_400_000,
  );
  const candidates = await db
    .select({
      id: users.id,
      email: users.email,
      firstName: users.firstName,
      enrolledAt: users.welcomeSeriesEnrolledAt,
      optedOutAt: users.marketingOptedOutAt,
    })
    .from(users)
    .where(
      and(
        isNotNull(users.welcomeSeriesEnrolledAt),
        isNull(users.marketingOptedOutAt),
        gte(users.welcomeSeriesEnrolledAt, windowStart),
      ),
    );

  let sent = 0;
  let errored = 0;

  for (const u of candidates) {
    try {
      const logs = await db
        .select({ emailType: emailLogs.emailType })
        .from(emailLogs)
        .where(eq(emailLogs.userId, u.id));
      const sentTypes = new Set(logs.map((l) => l.emailType));

      const due = dueWelcomeSeriesSteps({
        enrolledAt: u.enrolledAt!,
        optedOutAt: u.optedOutAt,
        sentEmailTypes: sentTypes,
        now,
      });

      for (const step of due) {
        const result = await sendWelcomeSeriesEmail({
          userId: u.id,
          step: step.step,
          recipientEmail: u.email,
          recipientName: u.firstName || u.email.split("@")[0],
        });
        if (result.success) sent += 1;
        else errored += 1;
      }
    } catch (err) {
      console.error(`[cron] welcome-series failed for user ${u.id}:`, err);
      errored += 1;
    }
  }

  const elapsedMs = Date.now() - startedAt;
  console.info(
    `[cron] Welcome series: ${enrolled} enrolled, ${sent} sent, ${errored} errored in ${elapsedMs}ms`,
  );

  return new Response(
    JSON.stringify({ success: true, enrolled, sent, errored, elapsedMs }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
};

// GET — human-debug status page; sends nothing.
export const GET: APIRoute = async () =>
  new Response(
    JSON.stringify({
      description: "Welcome-series cron endpoint",
      steps: WELCOME_SERIES_STEPS,
      usage: "POST with header x-cron-secret to enroll + drip. Scheduled callers only.",
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
```

- [ ] **Step 4: Run the test to verify it passes**

Start the dev server first (`R2_MOCK=1 CRON_SECRET=devsecret npm run dev`), then:

Run: `CRON_SECRET=devsecret TEST_BASE_URL=http://localhost:4321 npm run test:api -- tests/api/cron/send-welcome-series.test.ts`
Expected: PASS (4 tests). If the dev server bound to a different port, set `TEST_BASE_URL` accordingly.

- [ ] **Step 5: Commit**

```bash
git add src/pages/api/cron/send-welcome-series.ts tests/api/cron/send-welcome-series.test.ts
git commit -m "Add welcome-series enroll + drip cron"
```

## Task 8: Netlify scheduled function

**Files:**
- Create: `netlify/functions/scheduled-send-welcome-series.ts`

- [ ] **Step 1: Create the scheduled function**

Mirror `netlify/functions/scheduled-send-balance-reminders.ts`, changed to the welcome-series route and a daily schedule (14:00 UTC — offset from the balance-reminder job at 13:00 so they don't contend):

```typescript
/**
 * Netlify Scheduled Function — fires the welcome-series enroll + drip once
 * daily by POSTing to /api/cron/send-welcome-series.
 *
 * Mirrors scheduled-send-balance-reminders.ts: no app-lib imports (the lib
 * tree reads import.meta.env, undefined in the Netlify function bundle).
 */
import { schedule } from "@netlify/functions";

const ROUTE = "/api/cron/send-welcome-series";

export const handler = schedule("0 14 * * *", async () => {
  const base = (process.env.URL ?? process.env.PUBLIC_APP_URL)?.replace(
    /\/$/,
    "",
  );
  if (!base) {
    console.error(
      "[scheduled-send-welcome-series] no site URL in env (URL / PUBLIC_APP_URL)",
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
        `[scheduled-send-welcome-series] ${ROUTE} → ${res.status}: ${body}`,
      );
      return { statusCode: 500, body };
    }
    console.info(
      `[scheduled-send-welcome-series] ${ROUTE} → ${res.status}: ${body}`,
    );
    return { statusCode: 200, body };
  } catch (err) {
    console.error("[scheduled-send-welcome-series]", err);
    return {
      statusCode: 500,
      body: err instanceof Error ? err.message : String(err),
    };
  }
});
```

- [ ] **Step 2: Typecheck and build**

Run: `npm run typecheck && npm run build`
Expected: 0 type errors; build completes.

- [ ] **Step 3: Commit**

```bash
git add netlify/functions/scheduled-send-welcome-series.ts
git commit -m "Add daily scheduler for the welcome-series cron"
```

## Task 9: Full verification

- [ ] **Step 1: Typecheck** — Run: `npm run typecheck` — Expected: 0 errors.
- [ ] **Step 2: Unit tests** — Run: `npm run test:unit` — Expected: all pass, including the new `tests/unit/marketing/` tests.
- [ ] **Step 3: Build** — Run: `npm run build` — Expected: success (pre-existing `Astro.request.headers` prerender warnings are noise per CLAUDE.md).
- [ ] **Step 4: API tests** — with the dev server up: Run: `CRON_SECRET=devsecret TEST_BASE_URL=http://localhost:4321 npm run test:api -- tests/api/cron/send-welcome-series.test.ts` — Expected: pass.
- [ ] **Step 5: Confirm exactly one migration** — Run: `npm run db:generate` — Expected: "No schema changes" (the Task 1 migration is already committed; nothing new).
- [ ] **Step 6:** Commit anything outstanding only if a prior step required a fix.

---

## Rollout notes (not code — for the human merging this)

- **Netlify env:** set `MARKETING_UNSUBSCRIBE_SECRET` to a long random string in the production (and staging) site env before the first send. It must stay stable — rotating it breaks every existing unsubscribe link.
- **Migration:** the additive `users` migration runs via `migrate-prod.yml` on merge.
- **Content:** the three templates ship with draft copy — the founder reviews and finalizes the marketing wording before the series is relied on.
- The scheduled function uses the existing `CRON_SECRET` (already set).

## Self-review

- **Spec coverage:** sequence (3 emails / offsets) → Task 3 + Task 5; cron enroll+drip → Task 7; scheduled function → Task 8; schema (2 columns, no table) → Task 1; opt-out + unsubscribe (link + `List-Unsubscribe` header, HMAC token, marketing-only scope) → Tasks 2, 4, 5, 6; `sendEmail` headers → Task 4; templates reuse `email-layout`, no `StatusBanner` → Task 5; testing (unit step-selection + token, API cron) → Tasks 3, 2, 7; draft copy + founder approval → Task 5 + rollout notes.
- **Placeholder scan:** no "TBD"/"TODO"; the seed helper in Task 7 is described concretely with named reference files.
- **Type consistency:** `WELCOME_SERIES_STEPS` / `dueWelcomeSeriesSteps` / `WelcomeSeriesStep` / `WELCOME_SERIES_WINDOW_DAYS`, `signUnsubscribeToken`/`verifyUnsubscribeToken`/`getUnsubscribeSecret`, `sendWelcomeSeriesEmail`, the `welcome_series_1/2/3` emailType strings, and the `welcomeSeriesEnrolledAt`/`marketingOptedOutAt` columns are used consistently across tasks.
