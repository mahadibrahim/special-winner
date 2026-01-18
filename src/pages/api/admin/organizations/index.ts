import type { APIRoute } from "astro";
import { db } from "@/lib/db";
import { organizations, locations, userOrganizationAccess } from "@/lib/db/schema/organizations";
import { eq, sql, and, count, inArray } from "drizzle-orm";
import { requireAdminAccess } from "@/lib/auth";

export const GET: APIRoute = async (context) => {
  const { locals } = context;

  // Require admin access
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) return auth.response;

  try {
    if (!db) {
      return new Response(JSON.stringify({ error: "Database not available" }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Get all organizations with counts
    const orgsWithCounts = await db
      .select({
        id: organizations.id,
        name: organizations.name,
        slug: organizations.slug,
        legalName: organizations.legalName,
        description: organizations.description,
        organizationType: organizations.organizationType,
        status: organizations.status,
        logoUrl: organizations.logoUrl,
        email: organizations.email,
        phone: organizations.phone,
        website: organizations.website,
        city: organizations.city,
        state: organizations.state,
        stripeAccountId: organizations.stripeAccountId,
        stripeAccountStatus: organizations.stripeAccountStatus,
        stripeOnboardingComplete: organizations.stripeOnboardingComplete,
        createdAt: organizations.createdAt,
        // Subquery for location count
        locationCount: sql<number>`(
          SELECT COUNT(*) FROM locations
          WHERE locations.organization_id = ${organizations.id}
        )::int`,
        // Subquery for user count
        userCount: sql<number>`(
          SELECT COUNT(DISTINCT user_id) FROM user_organization_access
          WHERE user_organization_access.organization_id = ${organizations.id}
        )::int`,
      })
      .from(organizations)
      .orderBy(organizations.name);

    return new Response(
      JSON.stringify({
        organizations: orgsWithCounts.map((org) => ({
          ...org,
          locationCount: org.locationCount || 0,
          userCount: org.userCount || 0,
        })),
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error fetching organizations:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};

export const POST: APIRoute = async (context) => {
  const { request, locals } = context;

  // Require admin access - only admins can create organizations
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) return auth.response;

  try {
    if (!db) {
      return new Response(JSON.stringify({ error: "Database not available" }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      });
    }

    const body = await request.json();

    const {
      name,
      slug,
      legalName,
      description,
      organizationType,
      email,
      phone,
      website,
      addressLine1,
      addressLine2,
      city,
      state,
      postalCode,
      country,
      timezone,
    } = body;

    // Validate required fields
    if (!name || !slug) {
      return new Response(
        JSON.stringify({ error: "Name and slug are required" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Check if slug is unique
    const [existing] = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.slug, slug))
      .limit(1);

    if (existing) {
      return new Response(
        JSON.stringify({ error: "An organization with this slug already exists" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Create organization
    const [newOrg] = await db
      .insert(organizations)
      .values({
        name,
        slug,
        legalName: legalName || null,
        description: description || null,
        organizationType: organizationType || "franchise",
        status: "pending",
        email: email || null,
        phone: phone || null,
        website: website || null,
        addressLine1: addressLine1 || null,
        addressLine2: addressLine2 || null,
        city: city || null,
        state: state || null,
        postalCode: postalCode || null,
        country: country || "US",
        timezone: timezone || "America/New_York",
        settings: {
          branding: {
            primaryColor: "#cc442c",
          },
          contact: {},
          payments: {
            currency: "USD",
          },
          registration: {
            requireWaiver: true,
            requireEmergencyContact: true,
          },
          notifications: {
            sendWelcomeEmail: true,
            sendRegistrationConfirmation: true,
            sendPaymentReceipts: true,
          },
        },
        features: {
          enableDeposits: true,
          enableWaivers: true,
          enableTeamManagement: true,
          enableCoachPortal: true,
          enableOnlinePayments: true,
          enableScheduling: true,
        },
      })
      .returning();

    // Add the creating user as owner
    await db.insert(userOrganizationAccess).values({
      userId: auth.user.id,
      organizationId: newOrg.id,
      role: "owner",
      active: true,
      acceptedAt: new Date(),
    });

    return new Response(JSON.stringify({ organization: newOrg }), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error creating organization:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
