/**
 * Pure mapping between `GET /api/payments/history`'s response rows and the
 * small shape `payments-summary.tsx` (the "What you're part of" card on
 * `/dashboard/family`) needs to render its "3 most recent" list. Kept as a
 * standalone, dependency-free function — per repo convention (see
 * family-classes-card.tsx's header comment on small pure helpers) — so it can
 * be unit-tested without a server or DB (task-10-brief.md's pragmatic test
 * route: minting a real payment row without Stripe locally is awkward, but
 * this mapping is deterministic).
 *
 * Field shape mirrors `payment-history.tsx`'s existing `Payment` interface
 * exactly — do not invent a new response contract on top of the one the API
 * already returns.
 */

export interface HistoryPaymentRow {
  id: string;
  amount: number;
  amountCents: number;
  paymentType: string;
  status: string;
  createdAt: string;
  stripePaymentIntentId: string | null;
  familyMember: {
    firstName: string;
    lastName: string;
  } | null;
  team: {
    name: string;
  } | null;
  /** Null for class-membership subscription charges (F1: those rows have no
   *  registration, so no season/program/sport chain — see the API's own
   *  header comment on the join). */
  season: {
    name: string;
  } | null;
  program: {
    name: string;
  } | null;
  sport: {
    name: string;
    icon: string | null;
    color: string | null;
  } | null;
  /** Present for membership-subscription rows (`paymentType === "membership"`)
   *  — the tier the charge belongs to, since there's no season name to fall
   *  back on for those. Still nullable even then (a since-deleted membership
   *  leaves a historical payment row with neither). */
  membership: {
    tierName: string;
  } | null;
}

export interface PaymentSummaryRow {
  id: string;
  /** Season name — the same "what this charge was for" label the full
   *  payment-history page shows as its row title. */
  description: string;
  /** Child's full name for a solo registration payment, the team name for a
   *  team-level payment (captain deposit / backstop balance — #525), or an
   *  em dash when a row somehow carries neither. */
  personLabel: string;
  amountCents: number;
  status: string;
  createdAt: string;
}

const MAX_SUMMARY_ROWS = 3;

function personLabel(row: HistoryPaymentRow): string {
  if (row.familyMember) return `${row.familyMember.firstName} ${row.familyMember.lastName}`;
  if (row.team) return row.team.name;
  return "—";
}

/** What this charge was for. Season name for registration/team payments;
 *  for a membership-subscription row (no season) the tier name instead, so
 *  a class-only family's "No payments yet" empty state (F1) is replaced by
 *  an honest description rather than a crash on `row.season.name`. Falls
 *  back to a generic label in the (should-be-rare) case neither is present —
 *  e.g. a since-deleted membership on a historical row. */
function description(row: HistoryPaymentRow): string {
  if (row.season) return row.season.name;
  if (row.membership) return `${row.membership.tierName} Membership`;
  return "Payment";
}

/**
 * Sorts newest-first (defensive — the API already orders by
 * `desc(payments.createdAt)`, but this function should not silently trust
 * caller ordering) and caps at the 3 most recent rows for the summary card.
 */
export function mapHistoryToSummary(rows: HistoryPaymentRow[]): PaymentSummaryRow[] {
  return [...rows]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, MAX_SUMMARY_ROWS)
    .map((row) => ({
      id: row.id,
      description: description(row),
      personLabel: personLabel(row),
      amountCents: row.amountCents,
      status: row.status,
      createdAt: row.createdAt,
    }));
}
