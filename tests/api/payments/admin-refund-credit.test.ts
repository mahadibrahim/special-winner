import { describe, it, expect, vi, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { registrations, type Registration } from "@/lib/db/schema";
import * as emailModule from "@/lib/email/send";
import { adminRefund } from "@/lib/payments/admin-refund";
import { getAccountCreditBalanceCents } from "@/lib/payments/account-credit";
import { seedPaidRegistration } from "../../utils/registration-context";

async function fetchRegistration(id: string): Promise<Registration> {
  const [row] = await getDb().select().from(registrations).where(eq(registrations.id, id));
  return row;
}

describe("adminRefund({ asCredit: true })", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("issues an account credit instead of a Stripe refund on full refund", async () => {
    vi.spyOn(emailModule, "sendRefundNotificationEmail").mockResolvedValue({
      success: true,
    });
    const { registrationId, organizationId, userId, programName, seasonName, childName } =
      await seedPaidRegistration(17500);
    const registration = await fetchRegistration(registrationId);

    const result = await adminRefund({
      registration,
      refundAmountCents: 17500,
      adminUserId: userId,
      organizationId,
      childName,
      programName,
      seasonName,
      asCredit: true,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.stripeRefundId).toBeNull();
    expect(result.registration.refundStatus).toBe("credited");
    expect(result.registration.status).toBe("refunded");
    expect(result.registration.paymentStatus).toBe("refunded");
    expect(result.registration.amountPaidCents).toBe(0);

    const balance = await getAccountCreditBalanceCents(userId, organizationId);
    expect(balance).toBe(17500);
  });

  it("issues a partial credit without cancelling/refunding the registration status", async () => {
    vi.spyOn(emailModule, "sendRefundNotificationEmail").mockResolvedValue({
      success: true,
    });
    const { registrationId, organizationId, userId, programName, seasonName, childName } =
      await seedPaidRegistration(17500);
    const registration = await fetchRegistration(registrationId);

    const result = await adminRefund({
      registration,
      refundAmountCents: 5000,
      adminUserId: userId,
      organizationId,
      childName,
      programName,
      seasonName,
      asCredit: true,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.stripeRefundId).toBeNull();
    expect(result.isPartial).toBe(true);
    expect(result.registration.refundStatus).toBe("credited");
    expect(result.registration.paymentStatus).toBe("partial_refund");
    expect(result.registration.status).not.toBe("refunded");
    expect(result.registration.amountPaidCents).toBe(12500);

    const balance = await getAccountCreditBalanceCents(userId, organizationId);
    expect(balance).toBe(5000);
  });

  it("still rejects a credit amount exceeding amountPaidCents", async () => {
    const { registrationId, organizationId, userId, programName, seasonName, childName } =
      await seedPaidRegistration(5000);
    const registration = await fetchRegistration(registrationId);

    const result = await adminRefund({
      registration,
      refundAmountCents: 999_999,
      adminUserId: userId,
      organizationId,
      childName,
      programName,
      seasonName,
      asCredit: true,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(400);

    const balance = await getAccountCreditBalanceCents(userId, organizationId);
    expect(balance).toBe(0);
  });

  it("sends the refund-notification email with refundStatus 'credited'", async () => {
    const spy = vi
      .spyOn(emailModule, "sendRefundNotificationEmail")
      .mockResolvedValue({ success: true });
    const { registrationId, organizationId, userId, programName, seasonName, childName } =
      await seedPaidRegistration(9000);
    const registration = await fetchRegistration(registrationId);

    await adminRefund({
      registration,
      refundAmountCents: 9000,
      adminUserId: userId,
      organizationId,
      childName,
      programName,
      seasonName,
      asCredit: true,
    });

    // Email is fire-and-forget inside adminRefund — flush microtasks.
    await new Promise((r) => setTimeout(r, 50));

    expect(spy).toHaveBeenCalledOnce();
    expect(spy.mock.calls[0][0]).toMatchObject({ refundStatus: "credited" });
  });
});
