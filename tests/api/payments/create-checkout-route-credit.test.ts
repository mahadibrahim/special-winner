import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { registrations, familyMembers, users } from "@/lib/db/schema";
import { getParentCookie, apiFetch, expectJson, resetCookies } from "../setup/test-helpers";
import { createAdminOrgGameContext } from "../../utils/admin-org-game-context";
import { issueAccountCredit, getAccountCreditBalanceCents } from "@/lib/payments/account-credit";

const stripeConfigured = Boolean(process.env.STRIPE_SECRET_KEY);
const itWithStripe = stripeConfigured ? it : it.skip;

/**
 * HTTP-level check that POST /api/payments/create-checkout accepts
 * applyAccountCredit and returns creditAppliedCents — the library-level
 * behavior is already covered by
 * tests/api/payments/create-checkout-account-credit.test.ts; this test only
 * proves the route wires the field through in both directions.
 */
describe("POST /api/payments/create-checkout — applyAccountCredit wiring", () => {
  let parentCookie: string;
  let parentUserId: string;
  let organizationId: string;
  let seasonId: string;
  const cleanupRegistrationIds: string[] = [];
  const cleanupMemberIds: string[] = [];

  beforeAll(async () => {
    parentCookie = await getParentCookie();
    const [parentUser] = await getDb()
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, "parent@test.aspiresports.com"))
      .limit(1);
    if (!parentUser) throw new Error("Seeded parent user not found");
    parentUserId = parentUser.id;

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

  itWithStripe(
    "applies credit and returns creditAppliedCents on the paid_zero shape",
    async () => {
      const [member] = await getDb()
        .insert(familyMembers)
        .values({
          parentUserId,
          firstName: "CreditRoute",
          lastName: `Kid-${Math.random().toString(36).slice(2, 8)}`,
          birthDate: "2015-01-01",
        })
        .returning();
      cleanupMemberIds.push(member.id);

      const [registration] = await getDb()
        .insert(registrations)
        .values({
          seasonId,
          familyMemberId: member.id,
          registeredByUserId: parentUserId,
          status: "pending",
          paymentStatus: "unpaid",
          amountPaidCents: 0,
          amountDueCents: 5000,
        })
        .returning();
      cleanupRegistrationIds.push(registration.id);

      await issueAccountCredit({
        userId: parentUserId,
        organizationId,
        amountCents: 5000,
      });

      const res = await apiFetch("/api/payments/create-checkout", {
        method: "POST",
        cookie: parentCookie,
        body: JSON.stringify({
          registrationId: registration.id,
          applyAccountCredit: true,
        }),
      });

      const json = await expectJson(res, 200);
      expect(json.discountApplied).toBe(true);
      expect(json.creditAppliedCents).toBe(5000);

      const balance = await getAccountCreditBalanceCents(parentUserId, organizationId);
      expect(balance).toBe(0);
    },
  );
});
