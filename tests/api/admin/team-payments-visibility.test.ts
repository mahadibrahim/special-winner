/**
 * Issue #525 — team-level payments must be visible on every admin money
 * surface. A $200 team deposit (payments row with registration_id NULL and
 * team_registration_id set) was invisible on /admin/payments (list, tiles,
 * CSV) and rendered as $0.00/$0.00 on /admin/registrations.
 *
 * Baselines are captured BEFORE seeding and all totals are asserted as
 * deltas, so the shared test DB's ambient rows don't matter.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { getAdminCookie, getAuthCookie, apiFetch } from "../setup/test-helpers";
import {
  seedTeamPaymentContext,
  type TeamPaymentContext,
  TEAM_FEE_CENTS,
  DEPOSIT_CENTS,
  BALANCE_CENTS,
  REFUND_CENTS,
  COLLECTED_CENTS,
  CAPTAIN_PASSWORD,
} from "../../utils/team-payment-context";

let adminCookie: string;
let ctx: TeamPaymentContext;

interface PaymentsSummary {
  totalPayments: number;
  totalRevenue: number;
  totalRefunds: number;
  succeededPayments: number;
}

let paymentsBaseline: PaymentsSummary;
let revenueBaseline: {
  summary: { totalRevenue: number; transactionCount: number; refunds: { total: number; count: number } };
  revenueByType: { paymentType: string; revenue: number; count: number }[];
};

async function fetchPaymentsSummary(): Promise<PaymentsSummary> {
  const res = await apiFetch("/api/admin/payments", { cookie: adminCookie });
  expect(res.status).toBe(200);
  return (await res.json()).summary;
}

async function fetchRevenueReport() {
  const res = await apiFetch("/api/admin/reports/revenue", { cookie: adminCookie });
  expect(res.status).toBe(200);
  return res.json();
}

function typeRevenue(
  byType: { paymentType: string; revenue: number }[] | undefined,
  type: string,
): number {
  return Number(byType?.find((t) => t.paymentType === type)?.revenue ?? 0);
}

beforeAll(async () => {
  adminCookie = await getAdminCookie();
  paymentsBaseline = await fetchPaymentsSummary();
  revenueBaseline = await fetchRevenueReport();
  ctx = await seedTeamPaymentContext();
});

describe("GET /api/admin/payments — team-level transactions", () => {
  it("lists the team deposit with team, season, program, and payer", async () => {
    const res = await apiFetch("/api/admin/payments?paymentType=deposit&limit=50", {
      cookie: adminCookie,
    });
    expect(res.status).toBe(200);
    const { payments } = await res.json();
    const deposit = payments.find((p: any) => p.id === ctx.depositPaymentId);
    expect(deposit, "team deposit row missing from payments list").toBeTruthy();
    expect(deposit.amountCents).toBe(DEPOSIT_CENTS);
    expect(deposit.team?.name).toBe(ctx.teamName);
    expect(deposit.season?.name).toBe(ctx.seasonName);
    expect(deposit.program?.name).toBe(ctx.programName);
    expect(deposit.user?.email).toBe(ctx.captainEmail);
    expect(deposit.familyMember).toBeNull();
  });

  it("lists the post-close backstop balance charge with team context", async () => {
    const res = await apiFetch("/api/admin/payments?paymentType=balance&limit=50", {
      cookie: adminCookie,
    });
    expect(res.status).toBe(200);
    const { payments } = await res.json();
    const balance = payments.find((p: any) => p.id === ctx.balancePaymentId);
    expect(balance, "team backstop balance row missing").toBeTruthy();
    expect(balance.amountCents).toBe(BALANCE_CENTS);
    expect(balance.team?.name).toBe(ctx.teamName);
  });

  it("lists team-scoped refunds", async () => {
    const res = await apiFetch("/api/admin/payments?paymentType=refund&limit=50", {
      cookie: adminCookie,
    });
    expect(res.status).toBe(200);
    const { payments } = await res.json();
    const refund = payments.find((p: any) => p.id === ctx.refundPaymentId);
    expect(refund, "team refund row missing").toBeTruthy();
    expect(refund.team?.name).toBe(ctx.teamName);
  });

  it("still returns solo payments with familyMember and no team", async () => {
    const res = await apiFetch("/api/admin/payments?paymentType=full&limit=50", {
      cookie: adminCookie,
    });
    expect(res.status).toBe(200);
    const { payments } = await res.json();
    const solo = payments.find((p: any) => p.id === ctx.soloPaymentId);
    expect(solo).toBeTruthy();
    expect(solo.familyMember?.lastName).toBe(ctx.captainLastName);
    expect(solo.team ?? null).toBeNull();
  });

  it("counts team transactions in the summary tiles", async () => {
    const summary = await fetchPaymentsSummary();
    // Solo payment (+12000) also seeded; team rows: deposit + balance
    // (revenue), refund (refunds bucket). All three team rows + solo are
    // status=succeeded.
    expect(summary.totalRevenue - paymentsBaseline.totalRevenue).toBe(
      DEPOSIT_CENTS + BALANCE_CENTS + 12000,
    );
    expect(summary.totalRefunds - paymentsBaseline.totalRefunds).toBe(REFUND_CENTS);
    expect(summary.succeededPayments - paymentsBaseline.succeededPayments).toBe(4);
    expect(summary.totalPayments - paymentsBaseline.totalPayments).toBe(4);
  });
});

describe("GET /api/admin/payments — tenant isolation for team rows", () => {
  it("does not leak another org's team payments into this org's list", async () => {
    // Seed a team payment graph under a different org, then assert the
    // org-A-scoped admin list never shows it.
    const { getDb } = await import("@/lib/db");
    const { and, eq, ne } = await import("drizzle-orm");
    const schema = await import("@/lib/db/schema");
    const db = getDb();
    const suffix = Math.random().toString(36).slice(2, 10);

    const [otherOrg] = await db
      .select()
      .from(schema.organizations)
      .where(
        and(
          eq(schema.organizations.status, "active"),
          ne(schema.organizations.id, ctx.organizationId),
        ),
      )
      .limit(1);
    expect(otherOrg, "need a second org in the test DB").toBeTruthy();

    const [sport] = await db
      .insert(schema.sports)
      .values({ name: `S ${suffix}`, slug: `s-${suffix}`, organizationId: otherOrg.id })
      .returning();
    const [location] = await db
      .insert(schema.locations)
      .values({ name: `L ${suffix}`, slug: `l-${suffix}`, organizationId: otherOrg.id })
      .returning();
    const [program] = await db
      .insert(schema.programs)
      .values({
        name: `P ${suffix}`,
        slug: `p-${suffix}`,
        sportId: sport.id,
        locationId: location.id,
        programType: "league",
      })
      .returning();
    const [season] = await db
      .insert(schema.seasons)
      .values({
        name: `Se ${suffix}`,
        slug: `se-${suffix}`,
        programId: program.id,
        startDate: "2026-09-01",
        endDate: "2026-12-01",
        priceCents: 10000,
        status: "open",
      })
      .returning();
    const [captain] = await db
      .insert(schema.users)
      .values({ email: `b-cap-${suffix}@test.example`, passwordHash: "x" })
      .returning();
    const [team] = await db
      .insert(schema.teamRegistrations)
      .values({
        organizationId: otherOrg.id,
        seasonId: season.id,
        captainUserId: captain.id,
        captainEmail: captain.email,
        captainName: "B Captain",
        teamName: `OrgB FC ${suffix}`,
        inviteToken: `tok-b-${suffix}`,
        teamFeeCents: 100000,
        depositCents: 20000,
      })
      .returning();
    const [orgBPayment] = await db
      .insert(schema.payments)
      .values({
        registrationId: null,
        teamRegistrationId: team.id,
        userId: captain.id,
        amountCents: 20000,
        paymentType: "deposit",
        status: "succeeded",
        stripePaymentIntentId: `pi_b_${suffix}`,
      })
      .returning();

    const res = await apiFetch("/api/admin/payments?paymentType=deposit&limit=50", {
      cookie: adminCookie,
    });
    expect(res.status).toBe(200);
    const { payments } = await res.json();
    expect(payments.find((p: any) => p.id === orgBPayment.id)).toBeUndefined();
  });
});

describe("GET /api/admin/payments/export.csv — team-level transactions", () => {
  it("includes team rows with team_registration_id and team_name columns", async () => {
    const res = await apiFetch("/api/admin/payments/export.csv?paymentType=deposit", {
      cookie: adminCookie,
    });
    expect(res.status).toBe(200);
    const text = await res.text();
    const [header] = text.split("\n");
    expect(header).toContain("team_registration_id");
    expect(header).toContain("team_name");
    const row = text
      .split("\n")
      .find((line) => line.includes(ctx.depositPaymentIntentId));
    expect(row, "deposit row missing from CSV export").toBeTruthy();
    expect(row).toContain(ctx.teamName);
    expect(row).toContain(String(DEPOSIT_CENTS));
  });
});

describe("GET /api/admin/registrations — team financial state", () => {
  it("returns the team's financials on a team-member registration row", async () => {
    const res = await apiFetch(
      `/api/admin/registrations?search=${encodeURIComponent(ctx.captainLastName)}`,
      { cookie: adminCookie },
    );
    expect(res.status).toBe(200);
    const { registrations } = await res.json();
    const captainRow = registrations.find((r: any) => r.id === ctx.captainRegistrationId);
    expect(captainRow, "captain registration missing from list").toBeTruthy();
    expect(captainRow.team, "team block missing on team-member row").toBeTruthy();
    expect(captainRow.team.teamName).toBe(ctx.teamName);
    expect(captainRow.team.teamFeeCents).toBe(TEAM_FEE_CENTS);
    expect(captainRow.team.collectedCents).toBe(COLLECTED_CENTS);
    // Status chips must be untouched.
    expect(captainRow.paymentStatus).toBe("paid");
  });

  it("leaves solo registrations without a team block", async () => {
    const res = await apiFetch(
      `/api/admin/registrations?search=${encodeURIComponent(ctx.captainLastName)}`,
      { cookie: adminCookie },
    );
    const { registrations } = await res.json();
    const soloRow = registrations.find((r: any) => r.id === ctx.soloRegistrationId);
    expect(soloRow).toBeTruthy();
    expect(soloRow.team ?? null).toBeNull();
    expect(soloRow.amountPaidCents).toBe(12000);
  });
});

describe("GET /api/admin/registrations/export.csv — team context", () => {
  it("labels team-member rows with team name and fee", async () => {
    const res = await apiFetch("/api/admin/registrations/export.csv", {
      cookie: adminCookie,
    });
    expect(res.status).toBe(200);
    const text = await res.text();
    const [header] = text.split("\n");
    expect(header).toContain("team_name");
    expect(header).toContain("team_fee_cents");
    const row = text
      .split("\n")
      .find((line) => line.includes(ctx.captainRegistrationId));
    expect(row, "captain registration missing from CSV").toBeTruthy();
    expect(row).toContain(ctx.teamName);
    expect(row).toContain(String(TEAM_FEE_CENTS));
  });
});

describe("GET /api/admin/reports/revenue — team-level transactions", () => {
  it("counts team deposits and balances in totals and by-type buckets", async () => {
    const report = await fetchRevenueReport();
    // Only 3 of the 4 succeeded rows (deposit, balance, solo) land in the
    // report's totalRevenue/transactionCount — the refund-typed row is
    // deliberately excluded there (revenue.ts's `notARefund` guard, added by
    // winter-team-fixes task 2 to stop a deposit-refund row from double-
    // counting as both "revenue" and, via the dedicated refunds summary
    // below, a refund) and surfaces separately instead.
    expect(report.summary.totalRevenue - revenueBaseline.summary.totalRevenue).toBe(
      DEPOSIT_CENTS + BALANCE_CENTS + 12000,
    );
    expect(
      report.summary.transactionCount - revenueBaseline.summary.transactionCount,
    ).toBe(3);
    expect(report.summary.refunds.total - revenueBaseline.summary.refunds.total).toBe(
      REFUND_CENTS,
    );
    expect(
      typeRevenue(report.revenueByType, "deposit") -
        typeRevenue(revenueBaseline.revenueByType, "deposit"),
    ).toBe(DEPOSIT_CENTS);
    expect(
      typeRevenue(report.revenueByType, "balance") -
        typeRevenue(revenueBaseline.revenueByType, "balance"),
    ).toBe(BALANCE_CENTS);
  });
});

describe("GET /api/payments/history — captain's own receipts", () => {
  it("shows the captain their team deposit", async () => {
    const captainCookie = await getAuthCookie(ctx.captainEmail, CAPTAIN_PASSWORD);
    const res = await apiFetch("/api/payments/history", { cookie: captainCookie });
    expect(res.status).toBe(200);
    const { payments } = await res.json();
    const deposit = payments.find((p: any) => p.id === ctx.depositPaymentId);
    expect(deposit, "team deposit missing from captain's payment history").toBeTruthy();
    expect(deposit.amountCents).toBe(DEPOSIT_CENTS);
    expect(deposit.team?.name).toBe(ctx.teamName);
    // Solo receipt still present and labeled by player.
    const solo = payments.find((p: any) => p.id === ctx.soloPaymentId);
    expect(solo).toBeTruthy();
    expect(solo.familyMember?.lastName).toBe(ctx.captainLastName);
  });
});

describe("GET /api/admin/person/[id]?as=user — captain profile totals", () => {
  it("includes team payments in totalPaidCents", async () => {
    const res = await apiFetch(`/api/admin/person/${ctx.captainUserId}?as=user`, {
      cookie: adminCookie,
    });
    expect(res.status).toBe(200);
    const profile = await res.json();
    // deposit + balance + solo (refund-typed row has status "succeeded" and
    // summarizePayments counts by status — pre-existing semantics).
    expect(profile.payments.totalPaidCents).toBe(
      DEPOSIT_CENTS + BALANCE_CENTS + REFUND_CENTS + 12000,
    );
  });
});
