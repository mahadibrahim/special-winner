/**
 * Issue #525 — the season hub "Revenue" KPI (admin/seasons/[id].astro) must
 * count team-level payments (deposit + backstop balance) for the season, not
 * just per-registration payments. The query is extracted to
 * src/lib/admin/season-revenue.ts so it can be exercised directly.
 */
import { describe, it, expect } from "vitest";
import { getDb } from "@/lib/db";
import { seasonRevenueCents } from "@/lib/admin/season-revenue";
import {
  seedTeamPaymentContext,
  DEPOSIT_CENTS,
  BALANCE_CENTS,
  REFUND_CENTS,
} from "../../utils/team-payment-context";

describe("seasonRevenueCents", () => {
  it("sums solo and team-level succeeded payments for the season", async () => {
    const ctx = await seedTeamPaymentContext();
    const revenue = await seasonRevenueCents(getDb(), ctx.seasonId);
    // Fresh season: solo $120 + deposit $200 + balance $637.50 + the
    // refund-typed succeeded row $50 (KPI filters on status only —
    // pre-existing semantics, unchanged).
    expect(revenue).toBe(12000 + DEPOSIT_CENTS + BALANCE_CENTS + REFUND_CENTS);
  });
});
