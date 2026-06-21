import type { PersonPaymentsSummary } from "./person-types";

const PAID = new Set(["paid", "succeeded"]);
const OWED = new Set(["due", "failed"]);

export function summarizePayments(
  rows: { amountCents: number; status: string; createdAtIso: string; method: string }[],
): PersonPaymentsSummary {
  let totalPaidCents = 0;
  let outstandingCents = 0;
  let last: { dateIso: string; amountCents: number; method: string } | null = null;
  for (const r of rows) {
    if (PAID.has(r.status)) totalPaidCents += r.amountCents;
    if (OWED.has(r.status)) outstandingCents += r.amountCents;
    if (!last || r.createdAtIso > last.dateIso) {
      last = { dateIso: r.createdAtIso, amountCents: r.amountCents, method: r.method };
    }
  }
  return { totalPaidCents, outstandingCents, lastPayment: last };
}
