/**
 * Issues #528 / #529 — money and delete guards for TEAM-FUNDED registrations
 * (spot paid by the captain's team deposit / backstop, so the registration
 * has no per-player Stripe charge).
 *
 * #528: adminRefund's Stripe-refund path must hard-fail with a clear
 * team-funded error instead of either the confusing "exceeds paid 0¢" (the
 * $0/$0 captain) or the fake-success synchronous path (amountPaid > 0 with
 * no payments row, e.g. after a payment detach).
 *
 * #529: the admin registration DELETE and the self-serve family-member
 * DELETE must treat team funding as money-on-file (409), same as a directly
 * paid registration.
 */
import { describe, it, expect, beforeAll, vi } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  registrations,
  familyMembers,
  teamRegistrationMembers,
  type Registration,
} from "@/lib/db/schema";
import * as emailModule from "@/lib/email/send";
import { adminRefund } from "@/lib/payments/admin-refund";
import {
  getAdminCookie,
  getAuthCookie,
  apiFetch,
} from "../setup/test-helpers";
import {
  seedTeamPaymentContext,
  CAPTAIN_PASSWORD,
} from "../../utils/team-payment-context";

let adminCookie: string;

beforeAll(async () => {
  adminCookie = await getAdminCookie();
});

async function fetchRegistration(id: string): Promise<Registration> {
  const [row] = await getDb()
    .select()
    .from(registrations)
    .where(eq(registrations.id, id));
  return row;
}

describe("#528 adminRefund on team-funded registrations", () => {
  it("hard-fails the $0/$0 deposit-covered member with a team-funded error", async () => {
    const ctx = await seedTeamPaymentContext();
    const registration = await fetchRegistration(ctx.captainRegistrationId);

    const result = await adminRefund({
      registration,
      refundAmountCents: 5000,
      adminUserId: ctx.captainUserId,
      organizationId: ctx.organizationId,
      childName: "Team Captain",
      programName: ctx.programName,
      seasonName: ctx.seasonName,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(409);
    expect(result.error).toMatch(/team/i);
  });

  it("hard-fails instead of fake-succeeding when amountPaid > 0 with no payment row", async () => {
    // The audit's worst case: a team-linked registration showing paid money
    // but with no per-player payments row (payment-detach shape). Today this
    // takes the synchronous path and reports a refund with no money moved.
    const ctx = await seedTeamPaymentContext();
    await getDb()
      .update(registrations)
      .set({ amountPaidCents: 12000, amountDueCents: 12000 })
      .where(eq(registrations.id, ctx.captainRegistrationId));
    const registration = await fetchRegistration(ctx.captainRegistrationId);

    const result = await adminRefund({
      registration,
      refundAmountCents: 5000,
      adminUserId: ctx.captainUserId,
      organizationId: ctx.organizationId,
      childName: "Team Captain",
      programName: ctx.programName,
      seasonName: ctx.seasonName,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(409);
    expect(result.error).toMatch(/team/i);

    // And nothing was mutated.
    const after = await fetchRegistration(ctx.captainRegistrationId);
    expect(after.amountPaidCents).toBe(12000);
    expect(after.status).not.toBe("refunded");
  });

  it("still finalizes a zero-amount cancel synchronously for non-team registrations", async () => {
    vi.spyOn(emailModule, "sendRefundNotificationEmail").mockResolvedValue({
      success: true,
    } as any);
    // Solo comped shape: no payments row, nothing paid, not team-linked.
    const ctx = await seedTeamPaymentContext();
    const [compedMember] = await getDb()
      .insert(familyMembers)
      .values({
        parentUserId: ctx.captainUserId,
        firstName: "Comped",
        lastName: `Solo${ctx.suffix}`,
        birthDate: "1997-01-01",
      })
      .returning();
    const [soloComped] = await getDb()
      .insert(registrations)
      .values({
        seasonId: ctx.seasonId,
        familyMemberId: compedMember.id,
        registeredByUserId: ctx.captainUserId,
        status: "confirmed",
        paymentStatus: "paid",
        amountPaidCents: 0,
        amountDueCents: 0,
        registrationType: "full",
        waiverSigned: true,
      })
      .returning();

    const result = await adminRefund({
      registration: soloComped,
      refundAmountCents: 0,
      adminUserId: ctx.captainUserId,
      organizationId: ctx.organizationId,
      childName: "Comped Solo",
      programName: ctx.programName,
      seasonName: ctx.seasonName,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.registration.status).toBe("refunded");
    vi.restoreAllMocks();
  });
});

describe("#529 delete guards on team-funded registrations", () => {
  it("admin DELETE /api/admin/registrations/[id] 409s for a team-funded registration", async () => {
    const ctx = await seedTeamPaymentContext();
    const res = await apiFetch(
      `/api/admin/registrations/${ctx.captainRegistrationId}`,
      { method: "DELETE", cookie: adminCookie },
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/team/i);
    // Registration must still exist.
    expect(await fetchRegistration(ctx.captainRegistrationId)).toBeTruthy();
  });

  it("self-serve DELETE /api/family-members/[id] 409s for a team-funded player", async () => {
    const ctx = await seedTeamPaymentContext();
    const captainCookie = await getAuthCookie(ctx.captainEmail, CAPTAIN_PASSWORD);
    const [membership] = await getDb()
      .select({ registrationId: teamRegistrationMembers.registrationId })
      .from(teamRegistrationMembers)
      .where(
        eq(teamRegistrationMembers.registrationId, ctx.captainRegistrationId),
      );
    expect(membership).toBeTruthy();
    const [reg] = await getDb()
      .select({ familyMemberId: registrations.familyMemberId })
      .from(registrations)
      .where(eq(registrations.id, ctx.captainRegistrationId));

    const res = await apiFetch(`/api/family-members/${reg.familyMemberId}`, {
      method: "DELETE",
      cookie: captainCookie,
    });
    expect(res.status).toBe(409);
    // Registration and family member must still exist.
    expect(await fetchRegistration(ctx.captainRegistrationId)).toBeTruthy();
  });
});
