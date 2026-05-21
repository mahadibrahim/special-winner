import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { venues, locations, organizations } from "@/lib/db/schema";
import { eq, asc } from "drizzle-orm";
import { z } from "zod";
import { requireAdminAccess, requireOrganizationContext } from "@/lib/auth";
import {
  requireSameOrgLocation,
  requireSameOrgVenue,
  ownershipDeniedResponse,
} from "@/lib/auth/require-resource-ownership";

const venueSchema = z
  .object({
    locationId: z.string().uuid("Valid location ID is required"),
    name: z.string().min(1, "Name is required"),
    // Optional kiosk URL slug. Empty / whitespace normalizes to null so the
    // unique index doesn't trip over multiple "" venues. Format matches
    // requireKioskVenue's SLUG_RX.
    slug: z
      .preprocess(
        (v) => {
          if (typeof v !== "string") return v;
          const t = v.trim().toLowerCase();
          return t === "" ? null : t;
        },
        z
          .string()
          .regex(
            /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
            "Slug may contain only lowercase letters, numbers, and hyphens",
          )
          .max(64, "Slug must be 64 characters or fewer")
          .nullable(),
      )
      .optional(),
    address: z.string().optional().nullable(),
    fieldCount: z.number().min(1).default(1),
    indoor: z.boolean().default(false),
    owned: z.boolean().default(false),
    concessions: z.boolean().default(false),
    parkingManaged: z.boolean().default(false),
    notes: z.string().optional().nullable(),
    active: z.boolean().default(true),
    rentalEnabled: z.boolean().default(false),
    rentalHourlyRateCents: z
      .number()
      .int("rentalHourlyRateCents must be a whole number of cents")
      .min(0, "rentalHourlyRateCents must be >= 0")
      .nullable()
      .optional(),
    rentalOpenMinute: z
      .number()
      .int("rentalOpenMinute must be an integer")
      .min(0, "rentalOpenMinute must be in [0, 1440]")
      .max(1440, "rentalOpenMinute must be in [0, 1440]")
      .nullable()
      .optional(),
    rentalCloseMinute: z
      .number()
      .int("rentalCloseMinute must be an integer")
      .min(0, "rentalCloseMinute must be in [0, 1440]")
      .max(1440, "rentalCloseMinute must be in [0, 1440]")
      .nullable()
      .optional(),
  })
  .superRefine((data, ctx) => {
    const open = data.rentalOpenMinute ?? null;
    const close = data.rentalCloseMinute ?? null;
    if (open != null && close != null && open >= close) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "rentalOpenMinute must be less than rentalCloseMinute",
        path: ["rentalOpenMinute"],
      });
    }
  });

// GET - List venues
// ?scope=all  (super_admin only) — returns venues across all orgs with
//             organizationName + organizationSlug for cross-org dropdowns.
// Default (no param / scope=org) — returns only venues in the caller's org.
export const GET: APIRoute = async (context) => {
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) return auth.response;

  const url = new URL(context.request.url);
  const scope = url.searchParams.get("scope");
  const wantsAll = scope === "all";

  // Only super_admin may list venues cross-org
  if (wantsAll) {
    const isSuperAdmin = auth.roles.some((r) => r.name === "super_admin");
    if (!isSuperAdmin) {
      return new Response(
        JSON.stringify({ error: "Forbidden: super_admin required for scope=all" }),
        { status: 403, headers: { "Content-Type": "application/json" } },
      );
    }

    try {
      const allVenues = await getDb()
        .select({
          id: venues.id,
          locationId: venues.locationId,
          name: venues.name,
          slug: venues.slug,
          address: venues.address,
          fieldCount: venues.fieldCount,
          indoor: venues.indoor,
          owned: venues.owned,
          concessions: venues.concessions,
          parkingManaged: venues.parkingManaged,
          notes: venues.notes,
          active: venues.active,
          createdAt: venues.createdAt,
          rentalEnabled: venues.rentalEnabled,
          rentalHourlyRateCents: venues.rentalHourlyRateCents,
          rentalOpenMinute: venues.rentalOpenMinute,
          rentalCloseMinute: venues.rentalCloseMinute,
          location: {
            id: locations.id,
            name: locations.name,
          },
          organizationName: organizations.name,
          organizationSlug: organizations.slug,
        })
        .from(venues)
        .innerJoin(locations, eq(venues.locationId, locations.id))
        .innerJoin(organizations, eq(locations.organizationId, organizations.id))
        .orderBy(asc(organizations.name), asc(venues.name));

      return new Response(JSON.stringify({ venues: allVenues }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      console.error("Error fetching all venues:", error);
      return new Response(JSON.stringify({ error: "Failed to fetch venues" }), { status: 500 });
    }
  }

  // Default: same-org only
  const orgContext = await requireOrganizationContext(context);
  if (!orgContext.hasOrganization) return orgContext.response;

  try {
    const allVenues = await getDb()
      .select({
        id: venues.id,
        locationId: venues.locationId,
        name: venues.name,
        slug: venues.slug,
        address: venues.address,
        fieldCount: venues.fieldCount,
        indoor: venues.indoor,
        owned: venues.owned,
        concessions: venues.concessions,
        parkingManaged: venues.parkingManaged,
        notes: venues.notes,
        active: venues.active,
        createdAt: venues.createdAt,
        rentalEnabled: venues.rentalEnabled,
        rentalHourlyRateCents: venues.rentalHourlyRateCents,
        rentalOpenMinute: venues.rentalOpenMinute,
        rentalCloseMinute: venues.rentalCloseMinute,
        location: {
          id: locations.id,
          name: locations.name,
        },
      })
      .from(venues)
      .innerJoin(locations, eq(venues.locationId, locations.id))
      .where(eq(locations.organizationId, orgContext.organizationId))
      .orderBy(asc(venues.name));

    return new Response(JSON.stringify({ venues: allVenues }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error fetching venues:", error);
    return new Response(JSON.stringify({ error: "Failed to fetch venues" }), { status: 500 });
  }
};

// POST - Create new venue
export const POST: APIRoute = async (context) => {
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) return auth.response;

  const orgContext = await requireOrganizationContext(context);
  if (!orgContext.hasOrganization) return orgContext.response;

  try {
    const body = await context.request.json();
    const result = venueSchema.safeParse(body);

    if (!result.success) {
      return new Response(
        JSON.stringify({ error: "Validation failed", details: result.error.flatten().fieldErrors }),
        { status: 400 }
      );
    }

    // Verify the posted locationId belongs to caller's org
    const locationCheck = await requireSameOrgLocation(
      orgContext.organizationId,
      result.data.locationId,
    );
    if (!locationCheck.ok) return ownershipDeniedResponse();

    const [newVenue] = await getDb()
      .insert(venues)
      .values({
        ...result.data,
      })
      .returning();

    return new Response(JSON.stringify({ venue: newVenue }), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error creating venue:", error);
    if (error.code === "23503" || error.cause?.code === "23503") {
      return new Response(JSON.stringify({ error: "Invalid location selected" }), { status: 400 });
    }
    if (error.code === "23505" || error.cause?.code === "23505") {
      return new Response(
        JSON.stringify({ error: "That kiosk slug is already in use by another venue" }),
        { status: 409 },
      );
    }
    return new Response(JSON.stringify({ error: "Failed to create venue" }), { status: 500 });
  }
};

// PUT - Update venue
export const PUT: APIRoute = async (context) => {
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) return auth.response;

  const orgContext = await requireOrganizationContext(context);
  if (!orgContext.hasOrganization) return orgContext.response;

  try {
    const body = await context.request.json();
    const { id, ...data } = body;

    if (!id) {
      return new Response(JSON.stringify({ error: "Venue ID is required" }), { status: 400 });
    }

    // Verify the existing venue belongs to caller's org
    const existing = await requireSameOrgVenue(orgContext.organizationId, id);
    if (!existing.ok) return ownershipDeniedResponse();

    const result = venueSchema.safeParse(data);
    if (!result.success) {
      return new Response(
        JSON.stringify({ error: "Validation failed", details: result.error.flatten().fieldErrors }),
        { status: 400 }
      );
    }

    // Verify the (possibly different) target locationId still belongs to caller's org
    const locationCheck = await requireSameOrgLocation(
      orgContext.organizationId,
      result.data.locationId,
    );
    if (!locationCheck.ok) return ownershipDeniedResponse();

    const [updatedVenue] = await getDb()
      .update(venues)
      .set({
        ...result.data,
        updatedAt: new Date(),
      })
      .where(eq(venues.id, id))
      .returning();

    if (!updatedVenue) {
      return new Response(JSON.stringify({ error: "Venue not found" }), { status: 404 });
    }

    return new Response(JSON.stringify({ venue: updatedVenue }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error updating venue:", error);
    if (error.code === "23503" || error.cause?.code === "23503") {
      return new Response(JSON.stringify({ error: "Invalid location selected" }), { status: 400 });
    }
    if (error.code === "23505" || error.cause?.code === "23505") {
      return new Response(
        JSON.stringify({ error: "That kiosk slug is already in use by another venue" }),
        { status: 409 },
      );
    }
    return new Response(JSON.stringify({ error: "Failed to update venue" }), { status: 500 });
  }
};

// DELETE - Delete venue
export const DELETE: APIRoute = async (context) => {
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) return auth.response;

  const orgContext = await requireOrganizationContext(context);
  if (!orgContext.hasOrganization) return orgContext.response;

  try {
    const url = new URL(context.request.url);
    const id = url.searchParams.get("id");

    if (!id) {
      return new Response(JSON.stringify({ error: "Venue ID is required" }), { status: 400 });
    }

    const existing = await requireSameOrgVenue(orgContext.organizationId, id);
    if (!existing.ok) return ownershipDeniedResponse();

    const [deletedVenue] = await getDb().delete(venues).where(eq(venues.id, id)).returning();

    if (!deletedVenue) {
      return new Response(JSON.stringify({ error: "Venue not found" }), { status: 404 });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error deleting venue:", error);
    if (error.code === "23503" || error.cause?.code === "23503") {
      return new Response(
        JSON.stringify({ error: "Cannot delete venue that has games scheduled" }),
        { status: 400 }
      );
    }
    return new Response(JSON.stringify({ error: "Failed to delete venue" }), { status: 500 });
  }
};
