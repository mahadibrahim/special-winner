import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  registrations,
  familyMembers,
  users,
  accountCredits,
  accountCreditRedemptions,
} from "@/lib/db/schema";
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
  const cleanupCreditIds: string[] = [];

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

    // Self-healing, one-time cleanup: this test (and unrelated tests, e.g.
    // refund-to-credit flows) share this fixture user+org's account-credit
    // ledger, and prior failed/dirty runs can leave unredeemed balance
    // behind (see .superpowers/sdd/credit-triage-report.md). Wipe any
    // pre-existing *unredeemed* rows for this exact (userId, organizationId)
    // pair before establishing our own baseline, using the same direct
    // db-delete pattern as the afterAll cleanup below. Scoped strictly to
    // this fixture identity — never touches other users/orgs.
    const existingCredits = await getDb()
      .select({ id: accountCredits.id, amountCents: accountCredits.amountCents })
      .from(accountCredits)
      .where(
        and(
          eq(accountCredits.userId, parentUserId),
          eq(accountCredits.organizationId, organizationId),
        ),
      );

    for (const credit of existingCredits) {
      const [redeemedRow] = await getDb()
        .select({
          total: sql<string>`COALESCE(SUM(${accountCreditRedemptions.amountCents}), 0)`,
        })
        .from(accountCreditRedemptions)
        .where(eq(accountCreditRedemptions.accountCreditId, credit.id));
      const redeemed = Number(redeemedRow?.total ?? 0);
      if (redeemed < credit.amountCents) {
        // Unredeemed (or partially redeemed) stray balance — delete its
        // redemption rows first (FK restrict on accountCreditId), then the
        // issuance row itself.
        await getDb()
          .delete(accountCreditRedemptions)
          .where(eq(accountCreditRedemptions.accountCreditId, credit.id))
          .catch(() => {});
        await getDb()
          .delete(accountCredits)
          .where(eq(accountCredits.id, credit.id))
          .catch(() => {});
      }
    }
  });

  afterAll(async () => {
    for (const id of cleanupCreditIds) {
      await getDb()
        .delete(accountCreditRedemptions)
        .where(eq(accountCreditRedemptions.accountCreditId, id))
        .catch(() => {});
      await getDb().delete(accountCredits).where(eq(accountCredits.id, id)).catch(() => {});
    }
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

      const balanceBeforeIssue = await getAccountCreditBalanceCents(
        parentUserId,
        organizationId,
      );

      const credit = await issueAccountCredit({
        userId: parentUserId,
        organizationId,
        amountCents: 5000,
      });
      cleanupCreditIds.push(credit.id);

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

      // Assert a DELTA rather than an absolute balance: this fixture
      // user+org's account-credit ledger is shared across the whole suite,
      // so its starting balance isn't guaranteed to be zero even after the
      // beforeAll cleanup above (a concurrently-running test could add
      // activity). We issued and fully redeemed exactly 5000, so the net
      // change should be zero regardless of what else touches this ledger.
      const balanceAfter = await getAccountCreditBalanceCents(parentUserId, organizationId);
      expect(balanceAfter).toBe(balanceBeforeIssue);
    },
  );
});
