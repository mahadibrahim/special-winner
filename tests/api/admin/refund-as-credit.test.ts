import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getDb } from "@/lib/db";
import { registrations, familyMembers, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getAdminCookie, apiFetch, expectJson, resetCookies } from "../setup/test-helpers";
import { createAdminOrgGameContext } from "../../utils/admin-org-game-context";
import { getAccountCreditBalanceCents } from "@/lib/payments/account-credit";
import { seedPaidRegistration } from "../../utils/registration-context";

/**
 * Wires `asCredit` through both refund endpoints:
 *  - POST /api/admin/registrations/[id]/refund (admin-direct)
 *  - POST /api/admin/refunds/[id] (customer-request approve)
 *
 * Both must issue an account credit instead of a Stripe refund when
 * asCredit:true, and both must still 404 on a cross-tenant registration id
 * even with asCredit:true (tenant-scoping is orthogonal to the refund kind).
 */
describe("Refund endpoints — asCredit wiring", () => {
  let adminCookie: string;
  let organizationId: string;
  let seasonId: string;
  const cleanupRegistrationIds: string[] = [];
  const cleanupMemberIds: string[] = [];

  beforeAll(async () => {
    adminCookie = await getAdminCookie();
    const ctx = await createAdminOrgGameContext();
    organizationId = ctx.organizationId;
    seasonId = ctx.seasonId;
  });

  afterAll(async () => {
    for (const id of cleanupRegistrationIds) {
      await getDb().delete(registrations).where(eq(registrations.id, id)).catch(() => {});
    }
    for (const id of cleanupMemberIds) {
      await getDb().delete(familyMembers).where(eq(familyMembers.id, id)).catch(() => {});
    }
    resetCookies();
  });

  async function createInOrgRegistration(overrides: Partial<typeof registrations.$inferInsert> = {}) {
    // Any user row works as the registrant — reuse the seeded admin's own
    // user id so we don't need a fresh users insert.
    const [adminUser] = await getDb()
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, "admin@test.aspiresports.com"))
      .limit(1);
    if (!adminUser) throw new Error("Seeded admin user not found");

    const [member] = await getDb()
      .insert(familyMembers)
      .values({
        parentUserId: adminUser.id,
        firstName: "CreditTest",
        lastName: `Kid-${Math.random().toString(36).slice(2, 8)}`,
        birthDate: "2015-01-01",
      })
      .returning();
    cleanupMemberIds.push(member.id);

    const [row] = await getDb()
      .insert(registrations)
      .values({
        seasonId,
        familyMemberId: member.id,
        registeredByUserId: adminUser.id,
        status: "confirmed",
        paymentStatus: "paid",
        amountPaidCents: 10000,
        amountDueCents: 10000,
        ...overrides,
      })
      .returning();
    cleanupRegistrationIds.push(row.id);
    return { row, userId: adminUser.id };
  }

  describe("POST /api/admin/registrations/[id]/refund with asCredit", () => {
    it("issues an account credit at 200 (no Stripe refund)", async () => {
      const { row, userId } = await createInOrgRegistration();

      const res = await apiFetch(`/api/admin/registrations/${row.id}/refund`, {
        method: "POST",
        cookie: adminCookie,
        body: JSON.stringify({ amountCents: 4000, asCredit: true, reason: "test credit" }),
      });

      const json = await expectJson(res, 200);
      expect(json.refund.isCredit).toBe(true);
      expect(json.refund.stripeRefundId).toBeNull();
      expect(json.registration.refundStatus).toBe("credited");

      const balance = await getAccountCreditBalanceCents(userId, organizationId);
      expect(balance).toBeGreaterThanOrEqual(4000);
    });

    it("returns 404 for a cross-tenant registration even with asCredit", async () => {
      const other = await seedPaidRegistration(5000);
      const res = await apiFetch(`/api/admin/registrations/${other.registrationId}/refund`, {
        method: "POST",
        cookie: adminCookie,
        body: JSON.stringify({ amountCents: 1000, asCredit: true }),
      });
      expect(res.status).toBe(404);
    });
  });

  describe("POST /api/admin/refunds/[id] approve with asCredit", () => {
    it("issues an account credit at 200 (no Stripe refund)", async () => {
      const { row, userId } = await createInOrgRegistration({
        refundStatus: "pending_approval",
        refundAmountCents: 3000,
      });

      const res = await apiFetch(`/api/admin/refunds/${row.id}`, {
        method: "POST",
        cookie: adminCookie,
        body: JSON.stringify({ action: "approve", asCredit: true }),
      });

      const json = await expectJson(res, 200);
      expect(json.refund.isCredit).toBe(true);
      expect(json.refund.stripeRefundId).toBeNull();
      expect(json.registration.refundStatus).toBe("credited");

      const balance = await getAccountCreditBalanceCents(userId, organizationId);
      expect(balance).toBeGreaterThanOrEqual(3000);
    });

    it("returns 404 for a cross-tenant registration even with asCredit", async () => {
      const other = await seedPaidRegistration(5000, {
        status: "confirmed",
      });
      // Give it a pending_approval refund state so it would otherwise be
      // approvable — the 404 must come purely from tenant scoping.
      await getDb()
        .update(registrations)
        .set({ refundStatus: "pending_approval", refundAmountCents: 2000 })
        .where(eq(registrations.id, other.registrationId));

      const res = await apiFetch(`/api/admin/refunds/${other.registrationId}`, {
        method: "POST",
        cookie: adminCookie,
        body: JSON.stringify({ action: "approve", asCredit: true }),
      });
      expect(res.status).toBe(404);
    });
  });
});
