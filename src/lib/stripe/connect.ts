import Stripe from "stripe";
import { getDb } from "@/lib/db";
import { organizations, organizationRelationships } from "@/lib/db/schema/organizations";
import { eq, and } from "drizzle-orm";

// ============================================
// STRIPE INITIALIZATION
// ============================================

const stripeSecretKey = import.meta.env.STRIPE_SECRET_KEY;

export const stripe = stripeSecretKey
  ? new Stripe(stripeSecretKey, {
      typescript: true,
    })
  : null;

// ============================================
// STRIPE CONNECT ACCOUNT MANAGEMENT
// ============================================

/**
 * Create a Stripe Connect account for a franchise/organization
 */
export async function createConnectAccount(
  organizationId: string,
  options: {
    email: string;
    businessName: string;
    country?: string;
    type?: "standard" | "express";
  }
): Promise<Stripe.Account | null> {
  if (!stripe || !getDb()) return null;

  const { email, businessName, country = "US", type = "standard" } = options;

  try {
    // Create Stripe Connect account
    // Idempotency key: see top of client.ts — keyed on organizationId
    // since a single org should only ever have one Connect account.
    const account = await stripe.accounts.create(
      {
        type,
        country,
        email,
        business_profile: {
          name: businessName,
          mcc: "7941", // Sports clubs/fields/stadiums
        },
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        metadata: {
          organizationId,
        },
      },
      {
        idempotencyKey: `${organizationId}:connect-account`,
      },
    );

    // Update organization with Stripe account ID
    await getDb()
      .update(organizations)
      .set({
        stripeAccountId: account.id,
        stripeAccountStatus: "pending",
        updatedAt: new Date(),
      })
      .where(eq(organizations.id, organizationId));

    return account;
  } catch (error) {
    console.error("Error creating Stripe Connect account:", error);
    throw error;
  }
}

/**
 * Generate Stripe Connect onboarding link
 */
export async function createAccountOnboardingLink(
  accountId: string,
  returnUrl: string,
  refreshUrl: string
): Promise<string | null> {
  if (!stripe) return null;

  try {
    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: refreshUrl,
      return_url: returnUrl,
      type: "account_onboarding",
    });

    return accountLink.url;
  } catch (error) {
    console.error("Error creating onboarding link:", error);
    throw error;
  }
}

/**
 * Generate Stripe Connect dashboard link
 */
export async function createAccountDashboardLink(
  accountId: string
): Promise<string | null> {
  if (!stripe) return null;

  try {
    const loginLink = await stripe.accounts.createLoginLink(accountId);
    return loginLink.url;
  } catch (error) {
    console.error("Error creating dashboard link:", error);
    throw error;
  }
}

/**
 * Check Stripe Connect account status
 */
export async function getConnectAccountStatus(
  accountId: string
): Promise<{
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  requiresAction: boolean;
  requirements: Stripe.Account.Requirements | null;
} | null> {
  if (!stripe) return null;

  try {
    const account = await stripe.accounts.retrieve(accountId);

    return {
      chargesEnabled: account.charges_enabled,
      payoutsEnabled: account.payouts_enabled,
      detailsSubmitted: account.details_submitted,
      requiresAction:
        (account.requirements?.currently_due?.length ?? 0) > 0 ||
        (account.requirements?.past_due?.length ?? 0) > 0,
      requirements: account.requirements ?? null,
    };
  } catch (error) {
    console.error("Error getting account status:", error);
    return null;
  }
}

/**
 * Update organization Stripe status from webhook
 */
export async function updateOrganizationStripeStatus(
  accountId: string,
  status: "pending" | "active" | "restricted" | "disabled"
): Promise<void> {
  if (false) return;

  await getDb()
    .update(organizations)
    .set({
      stripeAccountStatus: status,
      stripeOnboardingComplete: status === "active",
      updatedAt: new Date(),
    })
    .where(eq(organizations.stripeAccountId, accountId));
}

// ============================================
// PAYMENT WITH CONNECT (SPLIT PAYMENTS)
// ============================================

interface PaymentWithConnectOptions {
  amountCents: number;
  currency?: string;
  destinationAccountId: string;
  applicationFeePercent?: number;
  applicationFeeAmountCents?: number;
  customerEmail: string;
  customerId?: string;
  metadata?: Record<string, string>;
  productName: string;
  productDescription?: string;
}

/**
 * Create a PaymentIntent with Stripe Connect split payment for a
 * registration. Returns the `pi_..._secret_...` clientSecret consumed
 * by the embedded PaymentElement on the wizard's payment step.
 */
export async function createConnectCheckoutSession(
  options: PaymentWithConnectOptions
): Promise<{ id: string; clientSecret: string } | null> {
  if (!stripe) return null;

  const {
    amountCents,
    currency = "usd",
    destinationAccountId,
    applicationFeePercent,
    applicationFeeAmountCents,
    customerEmail,
    customerId,
    metadata = {},
    productName,
    productDescription,
  } = options;

  // Calculate application fee
  let applicationFee = applicationFeeAmountCents;
  if (!applicationFee && applicationFeePercent) {
    applicationFee = Math.round(amountCents * (applicationFeePercent / 100));
  }

  try {
    const description = productDescription
      ? `${productName} — ${productDescription}`
      : productName;

    const params: Stripe.PaymentIntentCreateParams = {
      amount: amountCents,
      currency,
      automatic_payment_methods: { enabled: true },
      description,
      metadata,
      application_fee_amount: applicationFee,
      transfer_data: {
        destination: destinationAccountId,
      },
      ...(customerId
        ? { customer: customerId }
        : { receipt_email: customerEmail }),
    };

    const registrationId = metadata.registrationId;
    const idempotencyKey = registrationId
      ? `${registrationId}:connect-pi:${amountCents}`
      : `${destinationAccountId}:connect-pi:${amountCents}`;

    const paymentIntent = await stripe.paymentIntents.create(params, {
      idempotencyKey,
    });

    if (!paymentIntent.client_secret) {
      console.error("Stripe Connect payment intent returned without client_secret");
      return null;
    }

    return { id: paymentIntent.id, clientSecret: paymentIntent.client_secret };
  } catch (error) {
    console.error("Error creating Connect payment intent:", error);
    throw error;
  }
}

/**
 * Create a Payment Intent with Stripe Connect split payment
 * (For custom payment forms)
 */
export async function createConnectPaymentIntent(
  options: Omit<PaymentWithConnectOptions, "productName" | "productDescription">
): Promise<Stripe.PaymentIntent | null> {
  if (!stripe) return null;

  const {
    amountCents,
    currency = "usd",
    destinationAccountId,
    applicationFeePercent,
    applicationFeeAmountCents,
    customerId,
    metadata = {},
  } = options;

  // Calculate application fee
  let applicationFee = applicationFeeAmountCents;
  if (!applicationFee && applicationFeePercent) {
    applicationFee = Math.round(amountCents * (applicationFeePercent / 100));
  }

  try {
    const registrationId = metadata.registrationId;
    const idempotencyKey = registrationId
      ? `${registrationId}:connect-pi:${amountCents}`
      : `${destinationAccountId}:connect-pi:${amountCents}`;

    const paymentIntent = await stripe.paymentIntents.create(
      {
        amount: amountCents,
        currency,
        customer: customerId,
        application_fee_amount: applicationFee,
        transfer_data: {
          destination: destinationAccountId,
        },
        metadata,
      },
      { idempotencyKey },
    );

    return paymentIntent;
  } catch (error) {
    console.error("Error creating Connect payment intent:", error);
    throw error;
  }
}

// ============================================
// REVENUE REPORTING
// ============================================

/**
 * Get revenue breakdown for a franchise
 */
export async function getFranchiseRevenue(
  accountId: string,
  startDate: Date,
  endDate: Date
): Promise<{
  grossVolume: number;
  platformFees: number;
  netVolume: number;
  transactionCount: number;
} | null> {
  if (!stripe) return null;

  try {
    // Get balance transactions for the connected account
    const transactions = await stripe.balanceTransactions.list(
      {
        created: {
          gte: Math.floor(startDate.getTime() / 1000),
          lte: Math.floor(endDate.getTime() / 1000),
        },
        limit: 100,
      },
      {
        stripeAccount: accountId,
      }
    );

    let grossVolume = 0;
    let platformFees = 0;
    let transactionCount = 0;

    for (const transaction of transactions.data) {
      if (transaction.type === "charge" || transaction.type === "payment") {
        grossVolume += transaction.amount;
        platformFees += transaction.fee;
        transactionCount++;
      }
    }

    return {
      grossVolume,
      platformFees,
      netVolume: grossVolume - platformFees,
      transactionCount,
    };
  } catch (error) {
    console.error("Error getting franchise revenue:", error);
    return null;
  }
}

/**
 * Get platform revenue from all franchises
 */
export async function getPlatformRevenue(
  startDate: Date,
  endDate: Date
): Promise<{
  totalApplicationFees: number;
  transactionCount: number;
  byFranchise: Array<{
    accountId: string;
    applicationFees: number;
    transactionCount: number;
  }>;
} | null> {
  if (!stripe) return null;

  try {
    // Get application fees collected by the platform
    const fees = await stripe.applicationFees.list({
      created: {
        gte: Math.floor(startDate.getTime() / 1000),
        lte: Math.floor(endDate.getTime() / 1000),
      },
      limit: 100,
    });

    const byFranchise = new Map<
      string,
      { applicationFees: number; transactionCount: number }
    >();

    let totalApplicationFees = 0;
    let transactionCount = 0;

    for (const fee of fees.data) {
      totalApplicationFees += fee.amount;
      transactionCount++;

      const accountId = fee.account as string;
      const existing = byFranchise.get(accountId) || {
        applicationFees: 0,
        transactionCount: 0,
      };
      existing.applicationFees += fee.amount;
      existing.transactionCount++;
      byFranchise.set(accountId, existing);
    }

    return {
      totalApplicationFees,
      transactionCount,
      byFranchise: Array.from(byFranchise.entries()).map(([accountId, data]) => ({
        accountId,
        ...data,
      })),
    };
  } catch (error) {
    console.error("Error getting platform revenue:", error);
    return null;
  }
}

// ============================================
// HELPER: GET ORGANIZATION PAYMENT CONFIG
// ============================================

/**
 * Get payment configuration for an organization
 * Determines whether to use Connect (franchise) or direct payment (HQ)
 */
export async function getOrganizationPaymentConfig(
  organizationId: string
): Promise<{
  useConnect: boolean;
  destinationAccountId: string | null;
  applicationFeePercent: number;
} | null> {
  if (false) return null;

  try {
    // Get organization
    const [org] = await getDb()
      .select()
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .limit(1);

    if (!org) return null;

    // If HQ, use direct payments
    if (org.organizationType === "headquarters") {
      return {
        useConnect: false,
        destinationAccountId: null,
        applicationFeePercent: 0,
      };
    }

    // If franchise, check for parent relationship to get fee structure
    const [relationship] = await getDb()
      .select()
      .from(organizationRelationships)
      .where(
        and(
          eq(organizationRelationships.childOrgId, organizationId),
          eq(organizationRelationships.active, true)
        )
      )
      .limit(1);

    const feePercent = relationship?.revenueSharePercent
      ? parseFloat(relationship.revenueSharePercent)
      : (org.settings?.payments?.platformFeePercent ?? 10);

    return {
      useConnect: !!org.stripeAccountId && org.stripeOnboardingComplete === true,
      destinationAccountId: org.stripeAccountId,
      applicationFeePercent: feePercent,
    };
  } catch (error) {
    console.error("Error getting organization payment config:", error);
    return null;
  }
}
