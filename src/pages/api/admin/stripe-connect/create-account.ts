import type { APIRoute } from "astro";
import { db } from "@/lib/db";
import { organizations } from "@/lib/db/schema/organizations";
import { createConnectAccount, createAccountOnboardingLink } from "@/lib/stripe/connect";
import { eq } from "drizzle-orm";
import { requireAdminAccess, requireOrganizationContext } from "@/lib/auth";

export const POST: APIRoute = async (context) => {
  try {
    // Check admin authentication
    const auth = await requireAdminAccess(context);
    if (!auth.authorized) return auth.response;

    const orgContext = await requireOrganizationContext(context);
    if (!orgContext.hasOrganization) return orgContext.response;

    const body = await context.request.json();
    const { organizationId } = body;

    if (!organizationId) {
      return new Response(JSON.stringify({ error: "Organization ID required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Verify the organization ID matches the current org context
    if (organizationId !== orgContext.organizationId) {
      return new Response(JSON.stringify({ error: "Cannot create Stripe account for other organizations" }), {
        status: 403,
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

    // Check if already has Stripe account
    if (org.stripeAccountId) {
      return new Response(
        JSON.stringify({ error: "Organization already has a Stripe account" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Create Stripe Connect account
    const account = await createConnectAccount(organizationId, {
      email: org.email || auth.user.email,
      businessName: org.legalName || org.name,
      country: org.country || "US",
    });

    if (!account) {
      return new Response(JSON.stringify({ error: "Failed to create Stripe account" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Generate onboarding link
    const origin = new URL(context.request.url).origin;
    const onboardingUrl = await createAccountOnboardingLink(
      account.id,
      `${origin}/admin/organizations/${organizationId}/stripe/complete`,
      `${origin}/admin/organizations/${organizationId}/stripe/refresh`
    );

    return new Response(
      JSON.stringify({
        accountId: account.id,
        onboardingUrl,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error creating Stripe Connect account:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
