# Stripe Dispute Flow (Minimal Scope) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When Stripe notifies us of a dispute (chargeback) on a registration charge, record the dispute state on the payment row and email the founder so they can respond in the Stripe dashboard before the evidence deadline.

**Architecture:** New handler `handleChargeDispute` that processes `charge.dispute.created`, `charge.dispute.funds_withdrawn`, and `charge.dispute.closed` — wired into the existing `handleStripeEvent` dispatcher. Three additive columns on `payments` (no new table; minimal scope explicitly avoids an admin UI because Stripe's evidence-upload UI is what the founder uses to actually respond). One alert-email template + sender.

**Tech Stack:** Drizzle migration, existing Stripe webhook plumbing, existing email send infrastructure (React Email + Resend), Vitest.

**Out of scope (deferred to follow-up plan if/when we see real dispute volume):**
- Admin UI list of disputes (Stripe dashboard already shows this)
- Evidence-upload UI (Stripe's UI is meaningfully better than anything we'd build)
- SMS alerts (email is enough for the founder-only minimum)
- Dispute analytics / win-rate dashboards

**Scope check:** Single subsystem (Stripe webhook → DB write → email). One plan.

---

## File Structure

| Action | Path | Responsibility |
|---|---|---|
| Create | `src/lib/db/migrations/NNNN_dispute_columns.sql` | Additive columns + enum on `payments` |
| Modify | `src/lib/db/schema/payments.ts` | Add dispute columns + enum to the schema definition |
| Create | `src/lib/stripe/handle-charge-dispute.ts` | Handler for the three dispute event types |
| Modify | `src/lib/stripe/handle-stripe-event.ts` | Add the three dispute cases to the dispatcher switch |
| Create | `src/lib/email/templates/dispute-alert.tsx` | Founder-only alert email body |
| Modify | `src/lib/email/send.ts` | Add `sendDisputeAlertEmail` helper |
| Create | `tests/api/webhooks/charge-dispute.test.ts` | Unit tests for the handler (created/funds_withdrawn/closed) |
| Modify | `docs/launch-readiness-2026-summer.md` | Flip #2 status to `▣` (in progress) → `✓` on merge |

---

## Task 1: Schema — add dispute columns to `payments`

**Files:**
- Modify: `src/lib/db/schema/payments.ts`
- Create: `src/lib/db/migrations/NNNN_dispute_columns.sql`

- [ ] **Step 1: Edit the schema**

In `src/lib/db/schema/payments.ts`, after the existing `scheduledPaymentStatusEnum` declaration, add:

```ts
export const disputeStatusEnum = pgEnum("dispute_status", [
  "warning_needs_response",
  "warning_under_review",
  "warning_closed",
  "needs_response",
  "under_review",
  "won",
  "lost",
]);
```

In the `payments` pgTable definition, add three columns alongside `stripeChargeId`:

```ts
    stripeDisputeId: varchar("stripe_dispute_id", { length: 255 }),
    disputeStatus: disputeStatusEnum("dispute_status"),
    disputeReasonCode: varchar("dispute_reason_code", { length: 64 }),
```

(Reason code values come from Stripe verbatim: `"duplicate"`, `"fraudulent"`, `"subscription_canceled"`, etc. We store the string rather than enum it because Stripe adds new codes over time.)

And add a partial unique index in the table options array:

```ts
    uniqueIndex("payments_stripe_dispute_uniq")
      .on(table.stripeDisputeId)
      .where(sql`stripe_dispute_id IS NOT NULL`),
```

- [ ] **Step 2: Generate the migration**

```bash
npm run db:generate
```

Inspect the generated `src/lib/db/migrations/NNNN_*.sql` file. It should:
1. `CREATE TYPE dispute_status AS ENUM (...)` — wrap in `DO $$ BEGIN ... EXCEPTION WHEN duplicate_object THEN null; END $$;` per the repo convention for drift-tolerant migrations.
2. `ALTER TABLE payments ADD COLUMN stripe_dispute_id ... IF NOT EXISTS`, same for the other two.
3. `CREATE UNIQUE INDEX ... ON payments (stripe_dispute_id) WHERE stripe_dispute_id IS NOT NULL`.

If the generated file isn't idempotent, hand-edit it to be (the prod DB has had drift before; idempotent migrations protect against it).

- [ ] **Step 3: Apply locally + verify**

```bash
npm run db:push   # local DB only
npm run db:studio # confirm payments.stripe_dispute_id, .dispute_status, .dispute_reason_code exist
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/db/schema/payments.ts src/lib/db/migrations/NNNN_dispute_columns.sql
git commit -m "feat(schema): dispute columns on payments

Adds stripe_dispute_id (varchar 255, unique partial), dispute_status
(new enum), and dispute_reason_code (varchar 64) to the payments
table. Backing storage for the charge.dispute.* webhook handlers.

Additive, idempotent. No data backfill — pre-existing rows have NULL
dispute fields which is the correct initial state.
"
```

---

## Task 2: Handler — `handleChargeDispute`

**Files:**
- Create: `src/lib/stripe/handle-charge-dispute.ts`

- [ ] **Step 1: Skim the existing reference handler**

Read `src/lib/stripe/handle-charge-refunded.ts`. The dispute handler follows the same shape:
1. Resolve the dispute's `charge` to a `payment` row via `stripeChargeId` (NOT `stripePaymentIntentId` — disputes are charge-scoped).
2. Skip if no matching payment.
3. Update the dispute fields on the payment row.
4. Fire the founder alert email (fail-soft).

- [ ] **Step 2: Write the failing tests first**

```ts
// tests/api/webhooks/charge-dispute.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import type Stripe from "stripe";
import { getDb } from "@/lib/db";
import { payments, registrations } from "@/lib/db/schema";
import * as emailModule from "@/lib/email/send";
import { handleChargeDispute } from "@/lib/stripe/handle-charge-dispute";

function makeDispute(opts: {
  chargeId: string;
  disputeId: string;
  status: Stripe.Dispute.Status;
  reason: string;
  amount: number;
}): Stripe.Dispute {
  return {
    id: opts.disputeId,
    object: "dispute",
    charge: opts.chargeId,
    status: opts.status,
    reason: opts.reason,
    amount: opts.amount,
    currency: "usd",
  } as unknown as Stripe.Dispute;
}

// Reuse the seedPaidRegistration helper pattern from charge-refunded.test.ts.
// (Copy the function inline here; the test files are independent.)
async function seedPaidRegistrationWithCharge(amountCents: number) {
  // ... same seed shape as charge-refunded.test.ts but ALSO set
  // payments.stripeChargeId on the payment row.
}

describe("handleChargeDispute", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("records dispute.created and sends a founder alert email", async () => {
    const spy = vi
      .spyOn(emailModule, "sendDisputeAlertEmail")
      .mockResolvedValue({ success: true });
    const { paymentId, chargeId } = await seedPaidRegistrationWithCharge(17500);
    const dispute = makeDispute({
      chargeId,
      disputeId: "dp_test_1",
      status: "needs_response",
      reason: "fraudulent",
      amount: 17500,
    });

    const result = await handleChargeDispute(dispute, "charge.dispute.created");

    expect(result.status).toBe("processed");
    const [p] = await getDb().select().from(payments).where(eq(payments.id, paymentId));
    expect(p.stripeDisputeId).toBe("dp_test_1");
    expect(p.disputeStatus).toBe("needs_response");
    expect(p.disputeReasonCode).toBe("fraudulent");
    expect(spy).toHaveBeenCalledOnce();
  });

  it("updates state on funds_withdrawn without sending a second email", async () => {
    const spy = vi
      .spyOn(emailModule, "sendDisputeAlertEmail")
      .mockResolvedValue({ success: true });
    const { paymentId, chargeId } = await seedPaidRegistrationWithCharge(17500);
    // Seed an existing dispute row first (simulating dispute.created already processed).
    await getDb()
      .update(payments)
      .set({
        stripeDisputeId: "dp_test_2",
        disputeStatus: "needs_response",
        disputeReasonCode: "fraudulent",
      })
      .where(eq(payments.id, paymentId));

    const dispute = makeDispute({
      chargeId,
      disputeId: "dp_test_2",
      status: "under_review",
      reason: "fraudulent",
      amount: 17500,
    });
    const result = await handleChargeDispute(dispute, "charge.dispute.funds_withdrawn");

    expect(result.status).toBe("processed");
    const [p] = await getDb().select().from(payments).where(eq(payments.id, paymentId));
    expect(p.disputeStatus).toBe("under_review");
    // funds_withdrawn is informational — email only on .created.
    expect(spy).not.toHaveBeenCalled();
  });

  it("updates state on dispute.closed without a second alert email", async () => {
    const spy = vi
      .spyOn(emailModule, "sendDisputeAlertEmail")
      .mockResolvedValue({ success: true });
    const { paymentId, chargeId } = await seedPaidRegistrationWithCharge(17500);
    await getDb()
      .update(payments)
      .set({
        stripeDisputeId: "dp_test_3",
        disputeStatus: "under_review",
        disputeReasonCode: "fraudulent",
      })
      .where(eq(payments.id, paymentId));

    const dispute = makeDispute({
      chargeId,
      disputeId: "dp_test_3",
      status: "won",
      reason: "fraudulent",
      amount: 17500,
    });
    await handleChargeDispute(dispute, "charge.dispute.closed");

    const [p] = await getDb().select().from(payments).where(eq(payments.id, paymentId));
    expect(p.disputeStatus).toBe("won");
    expect(spy).not.toHaveBeenCalled();
  });

  it("skips when no payment matches the charge id", async () => {
    const dispute = makeDispute({
      chargeId: "ch_nonexistent",
      disputeId: "dp_test_4",
      status: "needs_response",
      reason: "duplicate",
      amount: 100,
    });
    const result = await handleChargeDispute(dispute, "charge.dispute.created");
    expect(result.status).toBe("skipped");
  });
});
```

- [ ] **Step 3: Verify tests fail**

Run: `npm run test:api -- tests/api/webhooks/charge-dispute.test.ts`
Expected: FAIL with "Cannot find module '@/lib/stripe/handle-charge-dispute'".

- [ ] **Step 4: Implement the handler**

```ts
// src/lib/stripe/handle-charge-dispute.ts
import type Stripe from "stripe";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { payments, registrations, familyMembers, seasons, programs, users } from "@/lib/db/schema";
import { sendDisputeAlertEmail } from "@/lib/email/send";

export type ChargeDisputeEventType =
  | "charge.dispute.created"
  | "charge.dispute.funds_withdrawn"
  | "charge.dispute.closed";

/**
 * Handler for charge.dispute.* events. Records dispute state on the
 * payment row and, on the initial `created` event only, emails the
 * founder so they can respond in the Stripe dashboard before the
 * evidence deadline.
 *
 * The customer-facing platform deliberately does NOT include a dispute-
 * response UI — Stripe's evidence-upload flow is better than anything
 * we'd build, and dispute volume at the launch cohort is low enough
 * that we don't need workflow automation around it.
 */
export async function handleChargeDispute(
  dispute: Stripe.Dispute,
  eventType: ChargeDisputeEventType,
): Promise<
  | { status: "skipped"; reason: string }
  | { status: "processed"; paymentId: string; disputeId: string }
> {
  const chargeId =
    typeof dispute.charge === "string" ? dispute.charge : dispute.charge?.id;
  if (!chargeId) {
    return { status: "skipped", reason: "dispute has no charge id" };
  }

  const db = getDb();
  const [payment] = await db
    .select()
    .from(payments)
    .where(eq(payments.stripeChargeId, chargeId))
    .limit(1);

  if (!payment) {
    return { status: "skipped", reason: `no payment for charge ${chargeId}` };
  }

  await db
    .update(payments)
    .set({
      stripeDisputeId: dispute.id,
      disputeStatus: dispute.status as any,
      disputeReasonCode: dispute.reason ?? null,
      updatedAt: new Date(),
    })
    .where(eq(payments.id, payment.id));

  // Email on `created` only — funds_withdrawn and closed are
  // state transitions the founder can read from the Stripe dashboard.
  if (eventType === "charge.dispute.created" && payment.registrationId) {
    const [row] = await db
      .select({
        registrationId: registrations.id,
        playerFirst: familyMembers.firstName,
        playerLast: familyMembers.lastName,
        seasonName: seasons.name,
        programName: programs.name,
        parentEmail: users.email,
      })
      .from(registrations)
      .innerJoin(familyMembers, eq(registrations.familyMemberId, familyMembers.id))
      .innerJoin(seasons, eq(registrations.seasonId, seasons.id))
      .innerJoin(programs, eq(seasons.programId, programs.id))
      .innerJoin(users, eq(registrations.registeredByUserId, users.id))
      .where(eq(registrations.id, payment.registrationId));

    if (row) {
      sendDisputeAlertEmail({
        stripeDisputeId: dispute.id,
        registrationId: row.registrationId,
        playerName: `${row.playerFirst} ${row.playerLast}`,
        programName: row.programName,
        seasonName: row.seasonName,
        parentEmail: row.parentEmail,
        amountCents: dispute.amount,
        reasonCode: dispute.reason ?? "unknown",
        // Stripe always sets evidence_details on a new dispute.
        evidenceDueBy: (dispute as any).evidence_details?.due_by
          ? new Date((dispute as any).evidence_details.due_by * 1000)
          : null,
      }).catch((err) =>
        console.error("[stripe webhook] dispute alert email send failed:", err),
      );
    }
  }

  return { status: "processed", paymentId: payment.id, disputeId: dispute.id };
}
```

- [ ] **Step 5: Verify tests pass**

Run: `npm run test:api -- tests/api/webhooks/charge-dispute.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 6: Commit**

```bash
git add src/lib/stripe/handle-charge-dispute.ts tests/api/webhooks/charge-dispute.test.ts
git commit -m "feat(stripe): charge.dispute handler with founder alert

Resolves the dispute's charge to a payment row, records dispute state
(id/status/reason), and emails the founder on the initial 'created'
event. funds_withdrawn / closed only update state.

No customer-facing UI — Stripe dashboard is the founder's response
surface, deliberately not rebuilt here.
"
```

---

## Task 3: Alert email template + sender

**Files:**
- Create: `src/lib/email/templates/dispute-alert.tsx`
- Modify: `src/lib/email/send.ts`

- [ ] **Step 1: Inspect existing templates for the design system**

Read `src/lib/email/templates/refund-notification.tsx` (most similar shape — money-related, transactional). Match the layout primitives (`StatusBanner`, `DetailPanel`, `Heading`, etc.).

- [ ] **Step 2: Write the template**

```tsx
// src/lib/email/templates/dispute-alert.tsx
import { EmailLayout } from "../components/email-layout";
import { StatusBanner } from "../components/status-banner";
import { Heading, Section, Text } from "@react-email/components";

interface Props {
  stripeDisputeId: string;
  playerName: string;
  programName: string;
  seasonName: string;
  parentEmail: string;
  amount: string;          // formatted, e.g. "$175.00"
  reasonCode: string;
  evidenceDueBy: string | null; // formatted localized
  stripeUrl: string;       // pre-built deep link to dispute in Stripe dashboard
}

export function DisputeAlertEmail(props: Props) {
  return (
    <EmailLayout previewText={`Action needed: dispute on ${props.playerName}'s registration`}>
      <StatusBanner tone="alert">
        Stripe dispute filed — response needed
      </StatusBanner>

      <Heading>Dispute on a registration charge</Heading>

      <Text>
        Stripe just notified us that the cardholder is disputing a charge.
        The funds may have already been withdrawn. You need to log into the
        Stripe dashboard and respond before the evidence deadline.
      </Text>

      <Section>
        <Text><strong>Player:</strong> {props.playerName}</Text>
        <Text><strong>Program:</strong> {props.programName} — {props.seasonName}</Text>
        <Text><strong>Parent email:</strong> {props.parentEmail}</Text>
        <Text><strong>Amount disputed:</strong> {props.amount}</Text>
        <Text><strong>Reason code:</strong> {props.reasonCode}</Text>
        {props.evidenceDueBy && (
          <Text><strong>Evidence due by:</strong> {props.evidenceDueBy}</Text>
        )}
        <Text><strong>Stripe dispute ID:</strong> {props.stripeDisputeId}</Text>
      </Section>

      <Section>
        <Text>
          <a href={props.stripeUrl}>Open this dispute in Stripe →</a>
        </Text>
      </Section>
    </EmailLayout>
  );
}
```

- [ ] **Step 3: Add the send helper**

In `src/lib/email/send.ts`, after `sendRefundNotificationEmail`, add:

```ts
// Dispute alert email — founder-only.
export interface SendDisputeAlertParams {
  stripeDisputeId: string;
  registrationId: string;
  playerName: string;
  programName: string;
  seasonName: string;
  parentEmail: string;
  amountCents: number;
  reasonCode: string;
  evidenceDueBy: Date | null;
}

export async function sendDisputeAlertEmail(params: SendDisputeAlertParams) {
  if (!isEmailConfigured()) {
    console.warn("Email not configured, skipping dispute alert email");
    return { success: false, error: "Email not configured" };
  }

  const founderEmail = import.meta.env.FOUNDER_ALERT_EMAIL;
  if (!founderEmail) {
    console.error("FOUNDER_ALERT_EMAIL not set — dispute alert dropped");
    return { success: false, error: "FOUNDER_ALERT_EMAIL not set" };
  }

  const stripeUrl = `https://dashboard.stripe.com/disputes/${params.stripeDisputeId}`;

  const html = await render(
    DisputeAlertEmail({
      stripeDisputeId: params.stripeDisputeId,
      playerName: params.playerName,
      programName: params.programName,
      seasonName: params.seasonName,
      parentEmail: params.parentEmail,
      amount: formatCurrency(params.amountCents),
      reasonCode: params.reasonCode,
      evidenceDueBy: params.evidenceDueBy
        ? formatDateTime(params.evidenceDueBy)
        : null,
      stripeUrl,
    }),
  );

  const subject = `[ACTION REQUIRED] Stripe dispute on ${params.playerName} — respond before deadline`;

  const result = await sendDirectEmail({
    to: founderEmail,
    subject,
    html,
  });

  await logEmail({
    registrationId: params.registrationId,
    emailType: "dispute_alert",
    recipientEmail: founderEmail,
    subject,
    resendMessageId: result.messageId,
    status: result.success ? "sent" : "failed",
  });

  return result;
}
```

Also add `dispute_alert` to the `emailType` enum if it's defined separately.

- [ ] **Step 4: Add `FOUNDER_ALERT_EMAIL` to `.env.example`**

```
# Founder's email for operational alerts (dispute filed, payment failure
# burst, etc). Routed through Resend, NOT a marketing channel.
FOUNDER_ALERT_EMAIL=
```

And update `src/lib/env.ts` to declare it (`z.string().email().optional()`).

- [ ] **Step 5: Render the email locally**

```bash
npm run email:preview   # if a preview script exists; otherwise import + render in a one-off script
```

Eyeball the layout. Tweak.

- [ ] **Step 6: Commit**

```bash
git add src/lib/email/templates/dispute-alert.tsx src/lib/email/send.ts .env.example src/lib/env.ts
git commit -m "feat(email): dispute-alert founder email + sender

Founder-only operational alert when a Stripe dispute fires. Deep-links
straight to the dispute in the Stripe dashboard so the founder can
respond inside the evidence window.

New env var FOUNDER_ALERT_EMAIL (must be set in prod before the
dispute handler can deliver — per-event try/catch logs and continues
if it's missing).
"
```

---

## Task 4: Wire the three event cases into the dispatcher

**Files:**
- Modify: `src/lib/stripe/handle-stripe-event.ts`

- [ ] **Step 1: Add the handler import**

At the top of `src/lib/stripe/handle-stripe-event.ts`, alongside the other handler imports:

```ts
import { handleChargeDispute } from "./handle-charge-dispute";
```

- [ ] **Step 2: Add the three switch cases**

In the `dispatch` function's switch on `event.type`, after the `charge.refunded` case, add:

```ts
    case "charge.dispute.created":
    case "charge.dispute.funds_withdrawn":
    case "charge.dispute.closed": {
      const dispute = event.data.object as Stripe.Dispute;
      const result = await handleChargeDispute(dispute, event.type);
      console.log(`[stripe webhook] ${event.type} → ${result.status}`, result);
      break;
    }
```

Also update the JSDoc above `dispatch` (lines ~60-79) to add the three new event types to the list under "this dispatcher handles…".

- [ ] **Step 3: Run all webhook tests**

```bash
npm run test:api -- tests/api/webhooks/
```

Expected: all existing tests pass, the 4 new dispute tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/lib/stripe/handle-stripe-event.ts
git commit -m "feat(stripe): dispatch charge.dispute.* to handler

Routes the three dispute event types through the existing handler.
The dispatch comment updated so the 'subscription list' for the prod
Stripe webhook is unambiguous.
"
```

---

## Task 5: Tracker + checklist updates

**Files:**
- Modify: `docs/launch-readiness-2026-summer.md`
- Modify: `docs/ops/soccerone-launch-checklist.md` (if it carries a Stripe-event subscription list)

- [ ] **Step 1: Flip #2 status to `▣` while the PR is open, `✓` on merge**

- [ ] **Step 2: Add the new event subscriptions to the founder-action list**

In the tracker (and any ops checklist that enumerates the prod webhook subscription), add:

> Stripe dashboard webhook subscription must now include: `charge.dispute.created`, `charge.dispute.funds_withdrawn`, `charge.dispute.closed`. Founder adds these in Stripe dashboard before the handler can fire.

- [ ] **Step 3: Set `FOUNDER_ALERT_EMAIL` in Netlify prod env (founder action, not code).**

Note this in the tracker as a separate `□` item under #2's notes.

- [ ] **Step 4: Commit**

```bash
git add docs/launch-readiness-2026-summer.md docs/ops/soccerone-launch-checklist.md
git commit -m "docs: tracker + checklist updates for dispute flow"
```

---

## Self-Review

- **Spec coverage:** All three event types handled. Founder is notified on the actionable event (`created`) only — `funds_withdrawn` and `closed` are state transitions, not new asks. Schema is minimal and additive. Tests cover the four important branches (created+email, funds_withdrawn no-email, closed no-email, skip-no-match).
- **Placeholders:** Two `// ... same seed shape` references in Task 2's test — these point at the existing `seedPaidRegistration` helper in `charge-refunded.test.ts`, with one addition (set `stripeChargeId` on the payment). Acceptable for a plan; the executor copies + adapts.
- **Type consistency:** `disputeStatusEnum` values match Stripe's actual dispute statuses (`warning_*`, `needs_response`, `under_review`, `won`, `lost`). `disputeReasonCode` is `varchar(64)` because Stripe adds reason codes over time — don't enum it.
- **Out-of-scope items deliberately listed at the top** so the reviewer can confirm the boundary before implementation.
- **One known gap:** the `seedPaidRegistrationWithCharge` helper duplicates `seedPaidRegistration` from `charge-refunded.test.ts`. If we add a third Stripe-event test file, factor the helper into `tests/api/webhooks/_seed.ts`. Don't do it now — premature.
