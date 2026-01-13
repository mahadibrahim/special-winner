import type { APIRoute } from "astro";
import { db } from "@/lib/db";
import { organizations } from "@/lib/db/schema/organizations";
import { createConnectAccount, createAccountOnboardingLink } from "@/lib/stripe/connect";
import { eq } from "drizzle-orm";

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    // Check authentication
    if (!locals.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    // TODO: Check if user has admin permission for the organization

    const body = await request.json();
    const { organizationId } = body;

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
      email: org.email || locals.user.email,
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
    const origin = new URL(request.url).origin;
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
