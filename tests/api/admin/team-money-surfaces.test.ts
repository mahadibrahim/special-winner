/**
 * Issues #530 / #531 / #532 — remaining admin surfaces for team money.
 *
 * #530: GET /api/admin/registrations/[id] carries the team financial block
 *       and the team-level payment rows for team-member registrations.
 * #531: the registration-trends payment-status breakdown puts team-funded
 *       registrations in their own "team_funded" bucket instead of
 *       "paid with $0 collected".
 * #532: new GET /api/admin/team-registrations/[id] — the drill-down payload
 *       (team, money, payments, invitees, members), tenant-scoped.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { getAdminCookie, apiFetch } from "../setup/test-helpers";
import {
  seedTeamPaymentContext,
  type TeamPaymentContext,
  TEAM_FEE_CENTS,
  DEPOSIT_CENTS,
  BALANCE_CENTS,
  COLLECTED_CENTS,
  PAID_SHARE_CENTS,
} from "../../utils/team-payment-context";

let adminCookie: string;
let ctx: TeamPaymentContext;
let trendsBaseline: {
  paymentStatusBreakdown: { paymentStatus: string; count: number }[];
};

function bucketCount(
  breakdown: { paymentStatus: string; count: number }[] | undefined,
  bucket: string,
): number {
  return Number(
    breakdown?.find((b) => b.paymentStatus === bucket)?.count ?? 0,
  );
}

beforeAll(async () => {
  adminCookie = await getAdminCookie();
  const res = await apiFetch("/api/admin/reports/registrations", {
    cookie: adminCookie,
  });
  expect(res.status).toBe(200);
  trendsBaseline = await res.json();
  ctx = await seedTeamPaymentContext();
});

describe("#530 GET /api/admin/registrations/[id] — team financial block", () => {
  it("returns team money and team-level payments for a team-member registration", async () => {
    const res = await apiFetch(
      `/api/admin/registrations/${ctx.captainRegistrationId}`,
      { cookie: adminCookie },
    );
    expect(res.status).toBe(200);
    const detail = await res.json();
    expect(detail.team, "team block missing on detail").toBeTruthy();
    expect(detail.team.teamName).toBe(ctx.teamName);
    expect(detail.team.teamFeeCents).toBe(TEAM_FEE_CENTS);
    expect(detail.team.depositCents).toBe(DEPOSIT_CENTS);
    expect(detail.team.collectedCents).toBe(COLLECTED_CENTS);
    expect(detail.team.role).toBe("captain");
    const teamPaymentIds = (detail.team.payments ?? []).map((p: any) => p.id);
    expect(teamPaymentIds).toContain(ctx.depositPaymentId);
    expect(teamPaymentIds).toContain(ctx.balancePaymentId);
  });

  it("keeps team null for solo registrations", async () => {
    const res = await apiFetch(
      `/api/admin/registrations/${ctx.soloRegistrationId}`,
      { cookie: adminCookie },
    );
    expect(res.status).toBe(200);
    const detail = await res.json();
    expect(detail.team ?? null).toBeNull();
  });
});

describe("#531 registration trends — team_funded bucket", () => {
  it("moves team-funded registrations out of the paid-$0 bucket", async () => {
    const res = await apiFetch("/api/admin/reports/registrations", {
      cookie: adminCookie,
    });
    expect(res.status).toBe(200);
    const report = await res.json();
    // The captain's registration (paid, $0) lands in team_funded; the solo
    // registration stays in paid.
    expect(
      bucketCount(report.paymentStatusBreakdown, "team_funded") -
        bucketCount(trendsBaseline.paymentStatusBreakdown, "team_funded"),
    ).toBe(1);
    expect(
      bucketCount(report.paymentStatusBreakdown, "paid") -
        bucketCount(trendsBaseline.paymentStatusBreakdown, "paid"),
    ).toBe(1);
  });
});

describe("#532 GET /api/admin/team-registrations/[id] — drill-down payload", () => {
  it("returns team, money, payments, invitees, and members", async () => {
    const res = await apiFetch(
      `/api/admin/team-registrations/${ctx.teamRegistrationId}`,
      { cookie: adminCookie },
    );
    expect(res.status).toBe(200);
    const detail = await res.json();

    expect(detail.team.teamName).toBe(ctx.teamName);
    expect(detail.team.captainEmail).toBe(ctx.captainEmail);
    expect(detail.season.name).toBe(ctx.seasonName);
    expect(detail.program.name).toBe(ctx.programName);

    expect(detail.money.teamFeeCents).toBe(TEAM_FEE_CENTS);
    expect(detail.money.depositCents).toBe(DEPOSIT_CENTS);
    expect(detail.money.collectedCents).toBe(COLLECTED_CENTS);

    const paymentIds = detail.payments.map((p: any) => p.id);
    expect(paymentIds).toContain(ctx.depositPaymentId);
    expect(paymentIds).toContain(ctx.balancePaymentId);
    expect(paymentIds).toContain(ctx.refundPaymentId);
    const deposit = detail.payments.find((p: any) => p.id === ctx.depositPaymentId);
    expect(deposit.amountCents).toBe(DEPOSIT_CENTS);
    expect(deposit.payer?.email).toBe(ctx.captainEmail);
    const balance = detail.payments.find((p: any) => p.id === ctx.balancePaymentId);
    expect(balance.amountCents).toBe(BALANCE_CENTS);

    expect(detail.invitees).toHaveLength(1);
    expect(detail.invitees[0].assignedShareCents).toBe(PAID_SHARE_CENTS);
    expect(detail.invitees[0].status).toBe("paid");

    expect(detail.members).toHaveLength(1);
    expect(detail.members[0].registrationId).toBe(ctx.captainRegistrationId);
    expect(detail.members[0].role).toBe("captain");
    expect(detail.members[0].lastName).toBe(ctx.captainLastName);
  });

  it("404s for an unknown id and for another org's team", async () => {
    const unknown = await apiFetch(
      "/api/admin/team-registrations/00000000-0000-0000-0000-000000000000",
      { cookie: adminCookie },
    );
    expect(unknown.status).toBe(404);

    // Another org's team must be invisible (tenant scoping).
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
    const [orgBTeam] = await db
      .insert(schema.teamRegistrations)
      .values({
        organizationId: otherOrg.id,
        seasonId: season.id,
        captainEmail: `b-${suffix}@test.example`,
        captainName: "B Captain",
        teamName: `OrgB FC ${suffix}`,
        inviteToken: `tok-b2-${suffix}`,
        teamFeeCents: 100000,
        depositCents: 20000,
      })
      .returning();

    const crossOrg = await apiFetch(
      `/api/admin/team-registrations/${orgBTeam.id}`,
      { cookie: adminCookie },
    );
    expect(crossOrg.status).toBe(404);
  });
});
