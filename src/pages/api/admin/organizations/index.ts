import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { organizations, locations, userOrganizationAccess } from "@/lib/db/schema/organizations";
import { eq, sql, and, count, inArray } from "drizzle-orm";
import { requireAdminAccess } from "@/lib/auth";

export const GET: APIRoute = async (context) => {
  const { locals } = context;

  // Require admin access
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) return auth.response;

  // super_admins can see every org; everyone else only sees orgs they have
  // userOrganizationAccess access to (typically just their own).
  const isSuperAdmin = auth.roles.some((r) => r.name === "super_admin");

  try {
    const db = getDb();

    // For non-super_admins: pull the set of orgs the caller is a member of.
    let allowedOrgIds: string[] | null = null;
    if (!isSuperAdmin) {
      const memberships = await getDb()
        .select({ organizationId: userOrganizationAccess.organizationId })
        .from(userOrganizationAccess)
        .where(
          and(
            eq(userOrganizationAccess.userId, auth.user.id),
            eq(userOrganizationAccess.active, true),
          ),
        );
      allowedOrgIds = memberships.map((m) => m.organizationId);

      if (allowedOrgIds.length === 0) {
        return new Response(JSON.stringify({ organizations: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    // Get organizations with counts
    const orgsQuery = getDb()
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
      .from(organizations);

    const orgsWithCounts = await (allowedOrgIds
      ? orgsQuery.where(inArray(organizations.id, allowedOrgIds)).orderBy(organizations.name)
      : orgsQuery.orderBy(organizations.name));

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

  // Require admin access — only super_admins can create new organizations
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) return auth.response;

  const isSuperAdmin = auth.roles.some((r) => r.name === "super_admin");
  if (!isSuperAdmin) {
    return new Response(
      JSON.stringify({ error: "Forbidden: super_admin required" }),
      { status: 403, headers: { "Content-Type": "application/json" } },
    );
  }

  try {
    const db = getDb();

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
    const [existing] = await getDb()
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
    const [newOrg] = await getDb()
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
    await getDb().insert(userOrganizationAccess).values({
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
