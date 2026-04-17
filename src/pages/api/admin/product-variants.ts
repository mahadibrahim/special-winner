import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { products, productVariants } from "@/lib/db/schema";
import { eq, and, asc } from "drizzle-orm";
import { z } from "zod";
import { requireAdminAccess, requireOrganizationContext } from "@/lib/auth";

/** Extract the PG error code from a Drizzle-wrapped or raw pg error. */
function getDbErrorCode(error: any): string | undefined {
  return error?.code ?? error?.cause?.code;
}

const variantSchema = z.object({
  productId: z.string().uuid(),
  sku: z.string().max(100).optional().nullable(),
  size: z.string().min(1).max(20),
  color: z.string().max(40).optional().nullable(),
  priceOverrideCents: z.number().int().min(0).optional().nullable(),
  active: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
});

async function assertProductInOrg(
  productId: string,
  organizationId: string,
): Promise<boolean> {
  const [p] = await getDb()
    .select({ id: products.id })
    .from(products)
    .where(
      and(eq(products.id, productId), eq(products.organizationId, organizationId)),
    );
  return !!p;
}

async function getVariantIfOwned(
  variantId: string,
  organizationId: string,
) {
  const [row] = await getDb()
    .select({
      variant: productVariants,
      productOrgId: products.organizationId,
    })
    .from(productVariants)
    .innerJoin(products, eq(productVariants.productId, products.id))
    .where(eq(productVariants.id, variantId));

  if (!row) return null;
  if (row.productOrgId !== organizationId) return null;
  return row.variant;
}

// GET - List variants for a product (?productId=...)
export const GET: APIRoute = async (context) => {
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) return auth.response;

  const orgContext = await requireOrganizationContext(context);
  if (!orgContext.hasOrganization) return orgContext.response;

  const url = new URL(context.request.url);
  const productId = url.searchParams.get("productId");

  if (!productId) {
    return new Response(
      JSON.stringify({ error: "productId query parameter is required" }),
      { status: 400 },
    );
  }

  try {
    const owned = await assertProductInOrg(productId, orgContext.organizationId);
    if (!owned) {
      return new Response(JSON.stringify({ error: "Product not found" }), {
        status: 404,
      });
    }

    const rows = await getDb()
      .select()
      .from(productVariants)
      .where(eq(productVariants.productId, productId))
      .orderBy(asc(productVariants.sortOrder), asc(productVariants.size));

    return new Response(JSON.stringify({ variants: rows }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error fetching product variants:", error);
    return new Response(
      JSON.stringify({ error: "Failed to fetch variants" }),
      { status: 500 },
    );
  }
};

// POST - Create new variant
export const POST: APIRoute = async (context) => {
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) return auth.response;

  const orgContext = await requireOrganizationContext(context);
  if (!orgContext.hasOrganization) return orgContext.response;

  try {
    const body = await context.request.json();
    const result = variantSchema.safeParse(body);

    if (!result.success) {
      return new Response(
        JSON.stringify({
          error: "Validation failed",
          details: result.error.flatten().fieldErrors,
        }),
        { status: 400 },
      );
    }

    const owned = await assertProductInOrg(
      result.data.productId,
      orgContext.organizationId,
    );
    if (!owned) {
      return new Response(JSON.stringify({ error: "Product not found" }), {
        status: 404,
      });
    }

    const [row] = await getDb()
      .insert(productVariants)
      .values(result.data)
      .returning();

    return new Response(JSON.stringify({ variant: row }), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error creating product variant:", error);
    if (getDbErrorCode(error) === "23505") {
      return new Response(
        JSON.stringify({
          error:
            "A variant with that size/color already exists for this product.",
        }),
        { status: 409 },
      );
    }
    return new Response(
      JSON.stringify({ error: "Failed to create variant" }),
      { status: 500 },
    );
  }
};

// PUT - Update variant
export const PUT: APIRoute = async (context) => {
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) return auth.response;

  const orgContext = await requireOrganizationContext(context);
  if (!orgContext.hasOrganization) return orgContext.response;

  try {
    const body = await context.request.json();
    const { id, ...data } = body;

    if (!id) {
      return new Response(
        JSON.stringify({ error: "Variant ID is required" }),
        { status: 400 },
      );
    }

    const result = variantSchema.safeParse(data);
    if (!result.success) {
      return new Response(
        JSON.stringify({
          error: "Validation failed",
          details: result.error.flatten().fieldErrors,
        }),
        { status: 400 },
      );
    }

    const existing = await getVariantIfOwned(id, orgContext.organizationId);
    if (!existing) {
      return new Response(JSON.stringify({ error: "Variant not found" }), {
        status: 404,
      });
    }

    // Guard against moving a variant to a product in another org.
    if (result.data.productId !== existing.productId) {
      const owned = await assertProductInOrg(
        result.data.productId,
        orgContext.organizationId,
      );
      if (!owned) {
        return new Response(JSON.stringify({ error: "Product not found" }), {
          status: 404,
        });
      }
    }

    const [row] = await getDb()
      .update(productVariants)
      .set({ ...result.data, updatedAt: new Date() })
      .where(eq(productVariants.id, id))
      .returning();

    return new Response(JSON.stringify({ variant: row }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error updating product variant:", error);
    if (getDbErrorCode(error) === "23505") {
      return new Response(
        JSON.stringify({
          error:
            "A variant with that size/color already exists for this product.",
        }),
        { status: 409 },
      );
    }
    return new Response(
      JSON.stringify({ error: "Failed to update variant" }),
      { status: 500 },
    );
  }
};

// DELETE - Delete variant (?id=variantId)
export const DELETE: APIRoute = async (context) => {
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) return auth.response;

  const orgContext = await requireOrganizationContext(context);
  if (!orgContext.hasOrganization) return orgContext.response;

  try {
    const url = new URL(context.request.url);
    const id = url.searchParams.get("id");

    if (!id) {
      return new Response(
        JSON.stringify({ error: "Variant ID is required" }),
        { status: 400 },
      );
    }

    const existing = await getVariantIfOwned(id, orgContext.organizationId);
    if (!existing) {
      return new Response(JSON.stringify({ error: "Variant not found" }), {
        status: 404,
      });
    }

    await getDb()
      .delete(productVariants)
      .where(eq(productVariants.id, id));

    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch (error: any) {
    console.error("Error deleting product variant:", error);
    if (getDbErrorCode(error) === "23503") {
      return new Response(
        JSON.stringify({
          error: "Cannot delete variant that is referenced by active orders",
        }),
        { status: 400 },
      );
    }
    return new Response(
      JSON.stringify({ error: "Failed to delete variant" }),
      { status: 500 },
    );
  }
};
