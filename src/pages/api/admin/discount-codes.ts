import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { discountCodes, seasons, programs } from "@/lib/db/schema";
import { eq, asc, desc, and, or, isNull, gte, lte } from "drizzle-orm";
import { z } from "zod";
import { requireAdminAccess, requireOrganizationContext } from "@/lib/auth";

const discountCodeSchema = z.object({
  code: z.string().min(1, "Code is required").max(50).toUpperCase(),
  description: z.string().optional().nullable(),
  discountType: z.enum(["percentage", "fixed_amount"]),
  discountValue: z.number().min(1, "Discount value must be positive"),
  minPurchaseCents: z.number().min(0).optional().nullable(),
  maxDiscountCents: z.number().min(0).optional().nullable(),
  maxUses: z.number().min(1).optional().nullable(),
  maxUsesPerUser: z.number().min(1).default(1),
  seasonId: z.string().uuid().optional().nullable(),
  active: z.boolean().default(true),
  startsAt: z.string().datetime().optional().nullable(),
  expiresAt: z.string().datetime().optional().nullable(),
});

// GET - List all discount codes
export const GET: APIRoute = async (context) => {
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) return auth.response;

  // Get organization context for multi-tenant filtering
  const orgContext = await requireOrganizationContext(context);
  if (!orgContext.hasOrganization) return orgContext.response;

  try {
    const allCodes = await getDb()
      .select({
        id: discountCodes.id,
        code: discountCodes.code,
        description: discountCodes.description,
        discountType: discountCodes.discountType,
        discountValue: discountCodes.discountValue,
        minPurchaseCents: discountCodes.minPurchaseCents,
        maxDiscountCents: discountCodes.maxDiscountCents,
        maxUses: discountCodes.maxUses,
        usedCount: discountCodes.usedCount,
        maxUsesPerUser: discountCodes.maxUsesPerUser,
        seasonId: discountCodes.seasonId,
        active: discountCodes.active,
        startsAt: discountCodes.startsAt,
        expiresAt: discountCodes.expiresAt,
        createdAt: discountCodes.createdAt,
      })
      .from(discountCodes)
      .where(eq(discountCodes.organizationId, orgContext.organizationId))
      .orderBy(desc(discountCodes.createdAt));

    return new Response(JSON.stringify({ discountCodes: allCodes }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error fetching discount codes:", error);
    return new Response(JSON.stringify({ error: "Failed to fetch discount codes" }), { status: 500 });
  }
};

// POST - Create discount code
export const POST: APIRoute = async (context) => {
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) return auth.response;

  // Get organization context for multi-tenant filtering
  const orgContext = await requireOrganizationContext(context);
  if (!orgContext.hasOrganization) return orgContext.response;

  try {
    const body = await context.request.json();
    const result = discountCodeSchema.safeParse(body);

    if (!result.success) {
      return new Response(
        JSON.stringify({ error: "Validation failed", details: result.error.flatten().fieldErrors }),
        { status: 400 }
      );
    }

    // Check for duplicate code within this organization
    const existing = await getDb().query.discountCodes.findFirst({
      where: and(
        eq(discountCodes.code, result.data.code),
        eq(discountCodes.organizationId, orgContext.organizationId)
      ),
    });

    if (existing) {
      return new Response(JSON.stringify({ error: "A discount code with this code already exists" }), {
        status: 409,
      });
    }

    const [newCode] = await getDb()
      .insert(discountCodes)
      .values({
        organizationId: orgContext.organizationId,
        ...result.data,
        startsAt: result.data.startsAt ? new Date(result.data.startsAt) : null,
        expiresAt: result.data.expiresAt ? new Date(result.data.expiresAt) : null,
      })
      .returning();

    return new Response(JSON.stringify({ discountCode: newCode }), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error creating discount code:", error);
    if (error.code === "23505") {
      return new Response(JSON.stringify({ error: "A discount code with this code already exists" }), {
        status: 409,
      });
    }
    return new Response(JSON.stringify({ error: "Failed to create discount code" }), { status: 500 });
  }
};

// PUT - Update discount code
export const PUT: APIRoute = async (context) => {
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) return auth.response;

  const orgContext = await requireOrganizationContext(context);
  if (!orgContext.hasOrganization) return orgContext.response;

  try {
    const body = await context.request.json();
    const { id, ...data } = body;

    if (!id) {
      return new Response(JSON.stringify({ error: "Discount code ID is required" }), { status: 400 });
    }

    const result = discountCodeSchema.safeParse(data);
    if (!result.success) {
      return new Response(
        JSON.stringify({ error: "Validation failed", details: result.error.flatten().fieldErrors }),
        { status: 400 }
      );
    }

    // Verify discount code belongs to this organization
    const [updatedCode] = await getDb()
      .update(discountCodes)
      .set({
        ...result.data,
        startsAt: result.data.startsAt ? new Date(result.data.startsAt) : null,
        expiresAt: result.data.expiresAt ? new Date(result.data.expiresAt) : null,
        updatedAt: new Date(),
      })
      .where(and(eq(discountCodes.id, id), eq(discountCodes.organizationId, orgContext.organizationId)))
      .returning();

    if (!updatedCode) {
      return new Response(JSON.stringify({ error: "Discount code not found" }), { status: 404 });
    }

    return new Response(JSON.stringify({ discountCode: updatedCode }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error updating discount code:", error);
    if (error.code === "23505") {
      return new Response(JSON.stringify({ error: "A discount code with this code already exists" }), {
        status: 409,
      });
    }
    return new Response(JSON.stringify({ error: "Failed to update discount code" }), { status: 500 });
  }
};

// DELETE - Delete discount code
export const DELETE: APIRoute = async (context) => {
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) return auth.response;

  const orgContext = await requireOrganizationContext(context);
  if (!orgContext.hasOrganization) return orgContext.response;

  try {
    const url = new URL(context.request.url);
    const id = url.searchParams.get("id");

    if (!id) {
      return new Response(JSON.stringify({ error: "Discount code ID is required" }), { status: 400 });
    }

    // Verify discount code belongs to this organization before deleting
    const [deletedCode] = await getDb()
      .delete(discountCodes)
      .where(and(eq(discountCodes.id, id), eq(discountCodes.organizationId, orgContext.organizationId)))
      .returning();

    if (!deletedCode) {
      return new Response(JSON.stringify({ error: "Discount code not found" }), { status: 404 });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error deleting discount code:", error);
    return new Response(JSON.stringify({ error: "Failed to delete discount code" }), { status: 500 });
  }
};
