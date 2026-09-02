/**
 * Stripe Customer Portal — `POST /api/memberships/billing-portal` plus the
 * library it wraps (`src/lib/memberships/billing-portal.ts`).
 *
 * Split the same way as tests/api/class-pack-purchase.test.ts: everything
 * that can be asserted without Stripe (auth, the return-path allow-list, the
 * no-customer 404) runs everywhere; every assertion whose shape comes back
 * FROM Stripe is `itWithStripe`-gated, because CI has no STRIPE_SECRET_KEY
 * (the standing CI-has-no-Stripe lesson).
 *
 * The happy path needs a REAL Stripe customer — the seeded fixtures carry
 * fake `cus_test_seeded_*` ids that Stripe would reject — so it mints one in
 * `beforeAll` and pins it to a freshly inserted `memberships` row for the
 * test parent. That row is deliberately `status: 'cancelled'`: the endpoint
 * resolves the customer by "newest row with a stripeCustomerId" regardless
 * of status, and a cancelled row sits outside BOTH partial unique indexes
 * (`memberships_one_active_per_user_org` / `..._per_child_org`), so this
 * spec can never collide with a live fixture membership on the shared
 * staging DB. Row + Stripe customer are both torn down in `afterAll`.
 *
 * The configuration test asserts the find-before-create contract ACROSS
 * processes: the happy-path request above made the dev server's process
 * bootstrap a configuration, and this process bootstraps its own — if the
 * lookup-by-metadata leg were missing, the list would show two.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { and, asc, desc, eq, isNotNull } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { memberships, membershipTiers } from "@/lib/db/schema/memberships";
import { organizations } from "@/lib/db/schema/organizations";
import { users } from "@/lib/db/schema/users";
import {
  BILLING_PORTAL_CONFIG_VERSION,
  BILLING_RETURN_PATHS,
  createBillingPortalSession,
  ensureBillingPortalConfiguration,
} from "@/lib/memberships/billing-portal";
import { membershipsStripe } from "@/lib/memberships/stripe";
import { getAuthCookie } from "./setup/test-helpers";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:4321";
const stripeConfigured = Boolean(process.env.STRIPE_SECRET_KEY);
const itWithStripe = stripeConfigured ? it : it.skip;

const PARENT_EMAIL = "parent@test.aspiresports.com";
const PARENT_PASSWORD = "TestParent123!";

/** Accounts that plausibly hold NO membership with a Stripe customer id.
 *  The first one that actually qualifies (checked against the DB, since the
 *  shared staging DB drifts) drives the 404 case. */
const NO_BILLING_CANDIDATES = [
  { email: "coach@test.aspiresports.com", password: "TestCoach123!" },
  { email: "fresh@test.aspiresports.com", password: "TestFresh123!" },
  { email: "familyonly@test.aspiresports.com", password: "TestFamily123!" },
];

let noBillingAccount: { email: string; password: string } | undefined;
/** memberships.id inserted by this spec — deleted in afterAll. */
let seededMembershipId: string | undefined;
/** Real Stripe customer minted by this spec — deleted in afterAll. */
let stripeCustomerId: string | undefined;

async function postPortal(opts: {
  cookie?: string;
  body?: unknown;
}): Promise<Response> {
  return fetch(`${BASE}/api/memberships/billing-portal`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(opts.cookie ? { cookie: opts.cookie } : {}),
    },
    body: JSON.stringify(opts.body ?? {}),
  });
}

beforeAll(async () => {
  const db = getDb();

  // organizations.slug and users.email are uniquely constrained — single
  // match guaranteed, no orderBy needed. Every non-unique lookup below gets
  // an explicit orderBy per the shared-DB convention.
  const [aspireOrg] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.slug, "aspire-sports"))
    .limit(1);

  for (const candidate of NO_BILLING_CANDIDATES) {
    const [user] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, candidate.email))
      .limit(1);
    if (!user) continue;
    const [withCustomer] = await db
      .select({ id: memberships.id })
      .from(memberships)
      .where(
        and(
          eq(memberships.userId, user.id),
          isNotNull(memberships.stripeCustomerId),
        ),
      )
      .orderBy(desc(memberships.createdAt))
      .limit(1);
    if (!withCustomer) {
      noBillingAccount = candidate;
      break;
    }
  }

  if (!stripeConfigured || !aspireOrg) return;

  const [parentUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, PARENT_EMAIL))
    .limit(1);
  const [tier] = await db
    .select({ id: membershipTiers.id })
    .from(membershipTiers)
    .where(eq(membershipTiers.organizationId, aspireOrg.id))
    .orderBy(asc(membershipTiers.createdAt))
    .limit(1);
  if (!parentUser || !tier) return;

  const customer = await membershipsStripe().customers.create({
    email: PARENT_EMAIL,
    name: "Billing Portal Spec",
    metadata: { aspire_test_fixture: "memberships-billing-portal" },
  });
  stripeCustomerId = customer.id;

  const [row] = await db
    .insert(memberships)
    .values({
      userId: parentUser.id,
      organizationId: aspireOrg.id,
      tierId: tier.id,
      status: "cancelled",
      billingInterval: "month",
      stripeCustomerId: customer.id,
    })
    .returning({ id: memberships.id });
  seededMembershipId = row?.id;
});

afterAll(async () => {
  if (seededMembershipId) {
    await getDb().delete(memberships).where(eq(memberships.id, seededMembershipId));
  }
  if (stripeCustomerId) {
    try {
      await membershipsStripe().customers.del(stripeCustomerId);
    } catch {
      // Best-effort cleanup — a leftover test-mode customer is harmless.
    }
  }
});

describe("POST /api/memberships/billing-portal", () => {
  it("401s an unauthenticated caller", async () => {
    const res = await postPortal({});
    expect(res.status).toBe(401);
  });

  it("422s a returnPath outside the allow-list", async () => {
    const cookie = await getAuthCookie(PARENT_EMAIL, PARENT_PASSWORD);
    for (const returnPath of [
      "/admin",
      "https://evil.example.com/dashboard",
      "//evil.example.com",
      "/dashboard/family?next=/admin",
      "/dashboard/family/extra",
      42,
    ]) {
      const res = await postPortal({ cookie, body: { returnPath } });
      expect(
        res.status,
        `expected 422 for returnPath ${JSON.stringify(returnPath)}`,
      ).toBe(422);
    }
  });

  it("404s no_billing_account for a user with no Stripe customer", async (ctx) => {
    if (!noBillingAccount) return ctx.skip();
    const cookie = await getAuthCookie(
      noBillingAccount.email,
      noBillingAccount.password,
    );
    const res = await postPortal({ cookie });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("no_billing_account");
    expect(typeof body.message).toBe("string");
  });

  itWithStripe("returns a hosted portal URL for the caller", async (ctx) => {
    if (!seededMembershipId) return ctx.skip();
    const cookie = await getAuthCookie(PARENT_EMAIL, PARENT_PASSWORD);
    const res = await postPortal({ cookie, body: { returnPath: "/dashboard" } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.url).toMatch(/^https:\/\/billing\.stripe\.com\//);
  });

  itWithStripe("defaults the returnPath when the body omits it", async (ctx) => {
    if (!seededMembershipId) return ctx.skip();
    const cookie = await getAuthCookie(PARENT_EMAIL, PARENT_PASSWORD);
    const res = await postPortal({ cookie });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.url).toMatch(/^https:\/\/billing\.stripe\.com\//);
  });
});

describe("billing-portal library", () => {
  it("rejects an off-list returnPath before touching Stripe", async () => {
    await expect(
      createBillingPortalSession({
        customerId: "cus_never_used",
        returnPath: "/admin",
        origin: "https://example.com",
      }),
    ).rejects.toThrow(/returnPath/i);
  });

  it("allow-lists exactly the two dashboard paths, family first", () => {
    expect([...BILLING_RETURN_PATHS]).toEqual(["/dashboard/family", "/dashboard"]);
  });

  itWithStripe("creates the configuration once and reuses it", async () => {
    const first = await ensureBillingPortalConfiguration();
    const second = await ensureBillingPortalConfiguration();
    expect(second).toBe(first);

    const s = membershipsStripe();
    const matching: string[] = [];
    for await (const config of s.billingPortal.configurations.list({ limit: 100 })) {
      if (config.metadata?.aspire_config === BILLING_PORTAL_CONFIG_VERSION) {
        matching.push(config.id);
      }
    }
    // Exactly one across BOTH processes (this one and the dev server's) —
    // the find-before-create leg is what keeps this from being two.
    expect(matching).toEqual([first]);
  });

  itWithStripe("configures the features the spec calls for", async () => {
    const configId = await ensureBillingPortalConfiguration();
    const config = await membershipsStripe().billingPortal.configurations.retrieve(
      configId,
    );
    expect(config.features.payment_method_update.enabled).toBe(true);
    expect(config.features.invoice_history.enabled).toBe(true);
    expect(config.features.subscription_cancel.enabled).toBe(true);
    expect(config.features.subscription_cancel.mode).toBe("at_period_end");
    expect(config.features.subscription_update.enabled).toBe(false);
    expect(config.business_profile.headline).toBeTruthy();
  });
});
