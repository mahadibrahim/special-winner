import { describe, expect, it, beforeAll, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { memberships, membershipTiers } from "@/lib/db/schema/memberships";
import { organizations } from "@/lib/db/schema/organizations";
import { users } from "@/lib/db/schema/users";
import Stripe from "stripe";
import crypto from "crypto";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:4321";
const SECRET = process.env.STRIPE_CONNECT_WEBHOOK_SECRET ?? "whsec_test";

let userId: string;
let orgId: string;
let tierId: string;

function signPayload(payload: string, secret: string): string {
  const t = Math.floor(Date.now() / 1000);
  const signed = `${t}.${payload}`;
  const v1 = crypto.createHmac("sha256", secret).update(signed).digest("hex");
  return `t=${t},v1=${v1}`;
}

async function send(event: Stripe.Event): Promise<Response> {
  const payload = JSON.stringify(event);
  return await fetch(`${BASE}/api/webhooks/stripe-connect`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "stripe-signature": signPayload(payload, SECRET),
    },
    body: payload,
  });
}

beforeAll(async () => {
  const db = getDb();
  const [org] = await db.select().from(organizations).where(eq(organizations.slug, "soccerone"));
  orgId = org?.id;
  const [u] = await db.select().from(users).where(eq(users.email, "member-pending@test.soccerone.com"));
  userId = u?.id;
  const [tier] = await db.select().from(membershipTiers).where(eq(membershipTiers.organizationId, orgId));
  tierId = tier?.id;
});

afterEach(async () => {
  if (!userId) return;
  const db = getDb();
  await db.delete(memberships).where(eq(memberships.userId, userId));
});

describe.skip("Connect webhook — subscription lifecycle", () => {
  it("creates a membership row on checkout.session.completed", async () => {
    const subId = `sub_test_${Date.now()}`;
    const event = {
      id: `evt_test_${Date.now()}`,
      type: "checkout.session.completed",
      data: {
        object: {
          id: `cs_test_${Date.now()}`,
          mode: "subscription",
          customer: "cus_test_x",
          subscription: subId,
          metadata: {
            type: "membership_subscription",
            user_id: userId,
            organization_id: orgId,
            tier_id: tierId,
            billing_interval: "month",
          },
        },
      },
    } as unknown as Stripe.Event;

    const res = await send(event);
    expect(res.status).toBe(200);

    const db = getDb();
    const rows = await db.select().from(memberships).where(eq(memberships.stripeSubscriptionId, subId));
    expect(rows.length).toBe(1);
    expect(rows[0]).toMatchObject({
      userId,
      organizationId: orgId,
      tierId,
      status: "active",
      billingInterval: "month",
    });
  });

  it("is idempotent on replay", async () => {
    const subId = `sub_test_${Date.now()}`;
    const eventBase = {
      id: `evt_test_${Date.now()}`,
      type: "checkout.session.completed",
      data: {
        object: {
          id: `cs_test_${Date.now()}`,
          mode: "subscription",
          customer: "cus_test_x",
          subscription: subId,
          metadata: {
            type: "membership_subscription",
            user_id: userId,
            organization_id: orgId,
            tier_id: tierId,
            billing_interval: "month",
          },
        },
      },
    } as unknown as Stripe.Event;

    await send(eventBase);
    const res2 = await send(eventBase);
    expect(res2.status).toBe(200);

    const db = getDb();
    const rows = await db.select().from(memberships).where(eq(memberships.stripeSubscriptionId, subId));
    expect(rows.length).toBe(1);
  });

  it("flips status to cancelled on customer.subscription.deleted", async () => {
    const subId = `sub_test_${Date.now()}`;
    const db = getDb();
    await db.insert(memberships).values({
      userId,
      organizationId: orgId,
      tierId,
      status: "active",
      billingInterval: "month",
      stripeSubscriptionId: subId,
      stripeCustomerId: "cus_test_x",
    });

    const event = {
      id: `evt_test_${Date.now()}`,
      type: "customer.subscription.deleted",
      data: { object: { id: subId, status: "canceled" } },
    } as unknown as Stripe.Event;

    await send(event);
    const [row] = await db.select().from(memberships).where(eq(memberships.stripeSubscriptionId, subId));
    expect(row.status).toBe("cancelled");
    expect(row.cancelledAt).not.toBeNull();
  });

  it("flips status to past_due on invoice.payment_failed", async () => {
    const subId = `sub_test_${Date.now()}`;
    const db = getDb();
    await db.insert(memberships).values({
      userId,
      organizationId: orgId,
      tierId,
      status: "active",
      billingInterval: "month",
      stripeSubscriptionId: subId,
      stripeCustomerId: "cus_test_x",
    });
    const event = {
      id: `evt_test_${Date.now()}`,
      type: "invoice.payment_failed",
      data: { object: { subscription: subId } },
    } as unknown as Stripe.Event;
    await send(event);
    const [row] = await db.select().from(memberships).where(eq(memberships.stripeSubscriptionId, subId));
    expect(row.status).toBe("past_due");
  });
});
