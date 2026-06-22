import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { products } from "@/lib/db/schema";
import { eq, and, asc } from "drizzle-orm";
import { z } from "zod";
import { requireOrgAdminAccess } from "@/lib/auth";

/** Extract the PG error code from a Drizzle-wrapped or raw pg error. */
function getDbErrorCode(error: any): string | undefined {
  return error?.code ?? error?.cause?.code;
}

const PRODUCT_CATEGORIES = [
  "jersey",
  "shorts",
  "socks",
  "hoodie",
  "t_shirt",
  "hat",
  "bag",
  "accessory",
  "other",
] as const;

const productImageSchema = z.object({
  url: z.string().url(),
  alt: z.string().optional(),
  sortOrder: z.number().optional(),
});

const productSchema = z.object({
  name: z.string().min(1, "Name is required").max(255),
  slug: z
    .string()
    .min(1, "Slug is required")
    .max(100)
    .regex(/^[a-z0-9-]+$/, "Slug must be lowercase with hyphens only"),
  description: z.string().optional().nullable(),
  category: z.enum(PRODUCT_CATEGORIES),
  basePriceCents: z.number().int().min(0, "Price must be non-negative"),
  images: z.array(productImageSchema).optional().nullable(),
  availablePostRegistration: z.boolean().default(true),
  active: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
});

// GET - List all products
export const GET: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;

  try {
    const rows = await getDb()
      .select()
      .from(products)
      .where(eq(products.organizationId, auth.organizationId))
      .orderBy(asc(products.sortOrder), asc(products.name));

    return new Response(JSON.stringify({ products: rows }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error fetching products:", error);
    return new Response(JSON.stringify({ error: "Failed to fetch products" }), { status: 500 });
  }
};

// POST - Create new product
export const POST: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;

  try {
    const body = await context.request.json();
    const result = productSchema.safeParse(body);

    if (!result.success) {
      return new Response(
        JSON.stringify({ error: "Validation failed", details: result.error.flatten().fieldErrors }),
        { status: 400 },
      );
    }

    const [row] = await getDb()
      .insert(products)
      .values({ organizationId: auth.organizationId, ...result.data })
      .returning();

    return new Response(JSON.stringify({ product: row }), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error creating product:", error);
    if (getDbErrorCode(error) === "23505") {
      return new Response(
        JSON.stringify({ error: "A product with this slug already exists" }),
        { status: 409 },
      );
    }
    return new Response(JSON.stringify({ error: "Failed to create product" }), { status: 500 });
  }
};

// PUT - Update product
export const PUT: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;

  try {
    const body = await context.request.json();
    const { id, ...data } = body;

    if (!id) {
      return new Response(JSON.stringify({ error: "Product ID is required" }), { status: 400 });
    }

    const result = productSchema.safeParse(data);
    if (!result.success) {
      return new Response(
        JSON.stringify({ error: "Validation failed", details: result.error.flatten().fieldErrors }),
        { status: 400 },
      );
    }

    const [row] = await getDb()
      .update(products)
      .set({ ...result.data, updatedAt: new Date() })
      .where(
        and(eq(products.id, id), eq(products.organizationId, auth.organizationId)),
      )
      .returning();

    if (!row) {
      return new Response(JSON.stringify({ error: "Product not found" }), { status: 404 });
    }

    return new Response(JSON.stringify({ product: row }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error updating product:", error);
    if (getDbErrorCode(error) === "23505") {
      return new Response(
        JSON.stringify({ error: "A product with this slug already exists" }),
        { status: 409 },
      );
    }
    return new Response(JSON.stringify({ error: "Failed to update product" }), { status: 500 });
  }
};

// DELETE - Delete product
export const DELETE: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;

  try {
    const url = new URL(context.request.url);
    const id = url.searchParams.get("id");

    if (!id) {
      return new Response(JSON.stringify({ error: "Product ID is required" }), { status: 400 });
    }

    const [row] = await getDb()
      .delete(products)
      .where(
        and(eq(products.id, id), eq(products.organizationId, auth.organizationId)),
      )
      .returning();

    if (!row) {
      return new Response(JSON.stringify({ error: "Product not found" }), { status: 404 });
    }

    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch (error: any) {
    console.error("Error deleting product:", error);
    if (getDbErrorCode(error) === "23503") {
      return new Response(
        JSON.stringify({
          error: "Cannot delete product that has variants or active gear bindings",
        }),
        { status: 400 },
      );
    }
    return new Response(JSON.stringify({ error: "Failed to delete product" }), { status: 500 });
  }
};
