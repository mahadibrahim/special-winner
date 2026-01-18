import type { APIRoute } from "astro";
import { db } from "@/lib/db";
import { organizations } from "@/lib/db/schema/organizations";
import {
  getConnectAccountStatus,
  createAccountOnboardingLink,
  createAccountDashboardLink,
} from "@/lib/stripe/connect";
import { eq } from "drizzle-orm";
import { requireAdminAccess } from "@/lib/auth";

export const GET: APIRoute = async (context) => {
  try {
    // Check admin authentication
    const auth = await requireAdminAccess(context);
    if (!auth.authorized) return auth.response;

    const url = new URL(context.request.url);
    const organizationId = url.searchParams.get("organizationId");

    if (!organizationId) {
      return new Response(JSON.stringify({ error: "Organization ID required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!db) {
      return new Response(JSON.stringify({ error: "Database not available" }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Get organization
    const [org] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .limit(1);

    if (!org) {
      return new Response(JSON.stringify({ error: "Organization not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!org.stripeAccountId) {
      return new Response(
        JSON.stringify({
          hasStripeAccount: false,
          status: null,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Get account status from Stripe
    const status = await getConnectAccountStatus(org.stripeAccountId);

    // Generate dashboard link if onboarding complete
    let dashboardUrl: string | null = null;
    if (status?.detailsSubmitted && status?.chargesEnabled) {
      dashboardUrl = await createAccountDashboardLink(org.stripeAccountId);
    }

    // Generate onboarding link if incomplete
    let onboardingUrl: string | null = null;
    if (!status?.detailsSubmitted || status?.requiresAction) {
      const origin = new URL(context.request.url).origin;
      onboardingUrl = await createAccountOnboardingLink(
        org.stripeAccountId,
        `${origin}/admin/organizations/${organizationId}/stripe/complete`,
        `${origin}/admin/organizations/${organizationId}/stripe/refresh`
      );
    }

    return new Response(
      JSON.stringify({
        hasStripeAccount: true,
        accountId: org.stripeAccountId,
        status: {
          chargesEnabled: status?.chargesEnabled ?? false,
          payoutsEnabled: status?.payoutsEnabled ?? false,
          detailsSubmitted: status?.detailsSubmitted ?? false,
          requiresAction: status?.requiresAction ?? false,
          currentlyDue: status?.requirements?.currently_due ?? [],
          pastDue: status?.requirements?.past_due ?? [],
        },
        dashboardUrl,
        onboardingUrl,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error getting Stripe Connect status:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
