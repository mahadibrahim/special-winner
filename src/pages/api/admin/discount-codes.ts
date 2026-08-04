import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { discountCodes, seasons, programs, locations } from "@/lib/db/schema";
import { eq, asc, desc, and, or, isNull, gte, lte } from "drizzle-orm";
import { z } from "zod";
import { requireOrgAdminAccess } from "@/lib/auth";

/**
 * Admin-facing schema. `discountValue` is the human-readable number the
 * staff member types — a percentage in 1-100 for percentage discounts,
 * or dollars for fixed_amount discounts. We convert to the underlying
 * storage shape (basis points / cents) in `encodeDiscountValue` before
 * the DB write and back to human form in `decodeDiscountValue` on read.
 *
 * Storage convention (unchanged):
 *   - percentage:    basis points  (10000 = 100%)
 *   - fixed_amount:  cents         (12000 = $120)
 *
 * Bug history: this schema previously accepted whatever number the admin
 * typed and stored it verbatim. A staff member entering "100" for a
 * percentage discount got 1% off, not 100% off. Same shape for
 * fixed_amount: "120" was stored as 120 cents = $1.20 instead of $120.
 */
const discountCodeSchema = z.object({
  code: z.string().min(1, "Code is required").max(50).toUpperCase(),
  description: z.string().optional().nullable(),
  discountType: z.enum(["percentage", "fixed_amount"]),
  discountValue: z.number().min(0.01, "Discount value must be positive"),
  minPurchaseCents: z.number().min(0).optional().nullable(),
  maxDiscountCents: z.number().min(0).optional().nullable(),
  maxUses: z.number().min(1).optional().nullable(),
  maxUsesPerUser: z.number().min(1).default(1),
  seasonId: z.string().uuid().optional().nullable(),
  active: z.boolean().default(true),
  startsAt: z.string().datetime().optional().nullable(),
  expiresAt: z.string().datetime().optional().nullable(),
}).superRefine((data, ctx) => {
  if (data.discountType === "percentage" && data.discountValue > 100) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["discountValue"],
      message: "Percentage discount cannot exceed 100",
    });
  }
});

/** Convert human input (percentage / dollars) → storage units. */
function encodeDiscountValue(
  type: "percentage" | "fixed_amount",
  human: number,
): number {
  return type === "percentage"
    ? Math.round(human * 100) // 100 → 10000 basis points
    : Math.round(human * 100); // 120 → 12000 cents
}

/**
 * Sanity guardrail: a fixed-amount discount larger than the org's most
 * expensive current offering is almost certainly a unit mistake, not a real
 * promotion — the 2026-08-04 incident stored "$25 off" as $2,500 (a cents
 * value passed where dollars were expected) and silently zeroed a paid
 * registration. Compares ENCODED cents against max(price, teamPrice) across
 * the org's non-test seasons; returns null when acceptable, else a
 * human-readable rejection. Orgs with no seasons skip the check.
 */
async function fixedDiscountTooLarge(
  organizationId: string,
  discountType: "percentage" | "fixed_amount",
  encodedCents: number,
): Promise<string | null> {
  if (discountType !== "fixed_amount") return null;
  const rows = await getDb()
    .select({ price: seasons.priceCents, teamPrice: seasons.teamPriceCents })
    .from(seasons)
    .innerJoin(programs, eq(seasons.programId, programs.id))
    .innerJoin(locations, eq(programs.locationId, locations.id))
    .where(and(eq(locations.organizationId, organizationId), eq(seasons.isTest, false)));
  if (rows.length === 0) return null;
  const maxOfferCents = Math.max(...rows.map((r) => Math.max(r.price ?? 0, r.teamPrice ?? 0)));
  if (maxOfferCents > 0 && encodedCents > maxOfferCents) {
    return `A $${(encodedCents / 100).toLocaleString()} discount exceeds your most expensive offering ($${(maxOfferCents / 100).toLocaleString()}). Enter the discount in dollars — e.g. 25 for $25 off.`;
  }
  return null;
}

/** Convert storage units → human input (percentage / dollars). */
function decodeDiscountValue(
  type: string | null,
  stored: number,
): number {
  if (type === "percentage" || type === "fixed_amount") {
    return stored / 100;
  }
  return stored;
}

// GET - List all discount codes
export const GET: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;

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
      .where(eq(discountCodes.organizationId, auth.organizationId))
      .orderBy(desc(discountCodes.createdAt));

    // Decode storage units back to the human-readable form the admin
    // form expects (percentage 1-100, dollars). Round-trip is stable:
    // GET → edit → PUT stores the same value.
    const decoded = allCodes.map((c) => ({
      ...c,
      discountValue: decodeDiscountValue(c.discountType, c.discountValue),
    }));

    return new Response(JSON.stringify({ discountCodes: decoded }), {
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
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;

  try {
    const body = await context.request.json();
    const result = discountCodeSchema.safeParse(body);

    if (!result.success) {
      return new Response(
        JSON.stringify({ error: "Validation failed", details: result.error.flatten().fieldErrors }),
        { status: 400 }
      );
    }

    // Check for duplicate code within this organization. orderBy ensures a
    // stable "does a duplicate exist" answer on shared DBs with any
    // accidental duplicates.
    const existing = await getDb().query.discountCodes.findFirst({
      where: and(
        eq(discountCodes.code, result.data.code),
        eq(discountCodes.organizationId, auth.organizationId)
      ),
      orderBy: (d, { asc }) => asc(d.createdAt),
    });

    if (existing) {
      return new Response(JSON.stringify({ error: "A discount code with this code already exists" }), {
        status: 409,
      });
    }

    const encodedValue = encodeDiscountValue(
      result.data.discountType,
      result.data.discountValue,
    );

    const tooLarge = await fixedDiscountTooLarge(
      auth.organizationId,
      result.data.discountType,
      encodedValue,
    );
    if (tooLarge) {
      return new Response(JSON.stringify({ error: tooLarge }), { status: 400 });
    }

    const [newCode] = await getDb()
      .insert(discountCodes)
      .values({
        organizationId: auth.organizationId,
        ...result.data,
        discountValue: encodedValue,
        startsAt: result.data.startsAt ? new Date(result.data.startsAt) : null,
        expiresAt: result.data.expiresAt ? new Date(result.data.expiresAt) : null,
      })
      .returning();

    return new Response(
      JSON.stringify({
        discountCode: {
          ...newCode,
          discountValue: decodeDiscountValue(
            newCode.discountType,
            newCode.discountValue,
          ),
        },
      }),
      {
        status: 201,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error: any) {
    console.error("Error creating discount code:", error);
    const pgCode = error.code ?? error.cause?.code;
    if (pgCode === "23505") {
      return new Response(JSON.stringify({ error: "A discount code with this code already exists" }), {
        status: 409,
      });
    }
    return new Response(JSON.stringify({ error: "Failed to create discount code" }), { status: 500 });
  }
};

// PUT - Update discount code
export const PUT: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;

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

    const encodedValue = encodeDiscountValue(
      result.data.discountType,
      result.data.discountValue,
    );

    const tooLarge = await fixedDiscountTooLarge(
      auth.organizationId,
      result.data.discountType,
      encodedValue,
    );
    if (tooLarge) {
      return new Response(JSON.stringify({ error: tooLarge }), { status: 400 });
    }

    // Verify discount code belongs to this organization
    const [updatedCode] = await getDb()
      .update(discountCodes)
      .set({
        ...result.data,
        discountValue: encodedValue,
        startsAt: result.data.startsAt ? new Date(result.data.startsAt) : null,
        expiresAt: result.data.expiresAt ? new Date(result.data.expiresAt) : null,
        updatedAt: new Date(),
      })
      .where(and(eq(discountCodes.id, id), eq(discountCodes.organizationId, auth.organizationId)))
      .returning();

    if (!updatedCode) {
      return new Response(JSON.stringify({ error: "Discount code not found" }), { status: 404 });
    }

    return new Response(
      JSON.stringify({
        discountCode: {
          ...updatedCode,
          discountValue: decodeDiscountValue(
            updatedCode.discountType,
            updatedCode.discountValue,
          ),
        },
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error: any) {
    console.error("Error updating discount code:", error);
    const pgCode = error.code ?? error.cause?.code;
    if (pgCode === "23505") {
      return new Response(JSON.stringify({ error: "A discount code with this code already exists" }), {
        status: 409,
      });
    }
    return new Response(JSON.stringify({ error: "Failed to update discount code" }), { status: 500 });
  }
};

// DELETE - Delete discount code
export const DELETE: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;

  try {
    const url = new URL(context.request.url);
    const id = url.searchParams.get("id");

    if (!id) {
      return new Response(JSON.stringify({ error: "Discount code ID is required" }), { status: 400 });
    }

    // Verify discount code belongs to this organization before deleting
    const [deletedCode] = await getDb()
      .delete(discountCodes)
      .where(and(eq(discountCodes.id, id), eq(discountCodes.organizationId, auth.organizationId)))
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
