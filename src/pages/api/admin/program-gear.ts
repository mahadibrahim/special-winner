import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import {
  programGear,
  products,
  programs,
  seasons,
  locations,
} from "@/lib/db/schema";
import { eq, and, asc } from "drizzle-orm";
import { z } from "zod";
import { requireOrgAdminAccess } from "@/lib/auth";

function getDbErrorCode(error: any): string | undefined {
  return error?.code ?? error?.cause?.code;
}

const programGearSchema = z
  .object({
    productId: z.string().uuid(),
    programId: z.string().uuid().optional().nullable(),
    seasonId: z.string().uuid().optional().nullable(),
    required: z.boolean().default(false),
    priceCents: z.number().int().min(0).optional().nullable(),
    sortOrder: z.number().int().default(0),
  })
  .refine((d) => (d.programId ? !d.seasonId : !!d.seasonId), {
    message: "Exactly one of programId or seasonId must be set",
  });

type OwnershipResult =
  | { ok: true }
  | { ok: false; reason: string };

async function assertOwnedByOrg(
  orgId: string,
  productId: string,
  programId?: string | null,
  seasonId?: string | null,
): Promise<OwnershipResult> {
  const [product] = await getDb()
    .select({ id: products.id })
    .from(products)
    .where(
      and(eq(products.id, productId), eq(products.organizationId, orgId)),
    );
  if (!product) return { ok: false, reason: "Product not found" };

  if (programId) {
    const [row] = await getDb()
      .select({ id: programs.id })
      .from(programs)
      .innerJoin(locations, eq(programs.locationId, locations.id))
      .where(
        and(
          eq(programs.id, programId),
          eq(locations.organizationId, orgId),
        ),
      );
    if (!row) return { ok: false, reason: "Program not found" };
  }

  if (seasonId) {
    const [row] = await getDb()
      .select({ id: seasons.id })
      .from(seasons)
      .innerJoin(programs, eq(seasons.programId, programs.id))
      .innerJoin(locations, eq(programs.locationId, locations.id))
      .where(
        and(
          eq(seasons.id, seasonId),
          eq(locations.organizationId, orgId),
        ),
      );
    if (!row) return { ok: false, reason: "Season not found" };
  }

  return { ok: true };
}

async function getBindingIfOwned(bindingId: string, orgId: string) {
  const [row] = await getDb()
    .select({
      binding: programGear,
      productOrgId: products.organizationId,
    })
    .from(programGear)
    .innerJoin(products, eq(programGear.productId, products.id))
    .where(eq(programGear.id, bindingId));

  if (!row) return null;
  if (row.productOrgId !== orgId) return null;
  return row.binding;
}

// GET - List bindings for a program or season
export const GET: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;

  const url = new URL(context.request.url);
  const programId = url.searchParams.get("programId");
  const seasonId = url.searchParams.get("seasonId");

  if (!programId && !seasonId) {
    return new Response(
      JSON.stringify({ error: "programId or seasonId query parameter required" }),
      { status: 400 },
    );
  }

  try {
    if (programId) {
      const [row] = await getDb()
        .select({ id: programs.id })
        .from(programs)
        .innerJoin(locations, eq(programs.locationId, locations.id))
        .where(
          and(
            eq(programs.id, programId),
            eq(locations.organizationId, auth.organizationId),
          ),
        );
      if (!row) {
        return new Response(JSON.stringify({ error: "Program not found" }), {
          status: 404,
        });
      }
    } else if (seasonId) {
      const [row] = await getDb()
        .select({ id: seasons.id })
        .from(seasons)
        .innerJoin(programs, eq(seasons.programId, programs.id))
        .innerJoin(locations, eq(programs.locationId, locations.id))
        .where(
          and(
            eq(seasons.id, seasonId),
            eq(locations.organizationId, auth.organizationId),
          ),
        );
      if (!row) {
        return new Response(JSON.stringify({ error: "Season not found" }), {
          status: 404,
        });
      }
    }

    const where = programId
      ? eq(programGear.programId, programId)
      : eq(programGear.seasonId, seasonId!);

    const rows = await getDb()
      .select()
      .from(programGear)
      .where(where)
      .orderBy(asc(programGear.sortOrder));

    return new Response(JSON.stringify({ bindings: rows }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error fetching program gear bindings:", error);
    return new Response(
      JSON.stringify({ error: "Failed to fetch bindings" }),
      { status: 500 },
    );
  }
};

// POST - Create new binding
export const POST: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;

  try {
    const body = await context.request.json();
    const result = programGearSchema.safeParse(body);

    if (!result.success) {
      return new Response(
        JSON.stringify({
          error: "Validation failed",
          details: result.error.flatten().fieldErrors,
        }),
        { status: 400 },
      );
    }

    const ownership = await assertOwnedByOrg(
      auth.organizationId,
      result.data.productId,
      result.data.programId ?? null,
      result.data.seasonId ?? null,
    );
    if (!ownership.ok) {
      return new Response(JSON.stringify({ error: ownership.reason }), {
        status: 404,
      });
    }

    const [row] = await getDb()
      .insert(programGear)
      .values(result.data)
      .returning();

    return new Response(JSON.stringify({ binding: row }), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error creating program gear binding:", error);
    return new Response(
      JSON.stringify({ error: "Failed to create binding" }),
      { status: 500 },
    );
  }
};

// PUT - Update binding
export const PUT: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;

  try {
    const body = await context.request.json();
    const { id, ...data } = body;

    if (!id) {
      return new Response(
        JSON.stringify({ error: "Binding ID is required" }),
        { status: 400 },
      );
    }

    const result = programGearSchema.safeParse(data);
    if (!result.success) {
      return new Response(
        JSON.stringify({
          error: "Validation failed",
          details: result.error.flatten().fieldErrors,
        }),
        { status: 400 },
      );
    }

    const existing = await getBindingIfOwned(id, auth.organizationId);
    if (!existing) {
      return new Response(JSON.stringify({ error: "Binding not found" }), {
        status: 404,
      });
    }

    const ownership = await assertOwnedByOrg(
      auth.organizationId,
      result.data.productId,
      result.data.programId ?? null,
      result.data.seasonId ?? null,
    );
    if (!ownership.ok) {
      return new Response(JSON.stringify({ error: ownership.reason }), {
        status: 404,
      });
    }

    const [row] = await getDb()
      .update(programGear)
      .set({ ...result.data, updatedAt: new Date() })
      .where(eq(programGear.id, id))
      .returning();

    return new Response(JSON.stringify({ binding: row }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error updating program gear binding:", error);
    return new Response(
      JSON.stringify({ error: "Failed to update binding" }),
      { status: 500 },
    );
  }
};

// DELETE - Remove binding (?id=bindingId)
export const DELETE: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;

  try {
    const url = new URL(context.request.url);
    const id = url.searchParams.get("id");

    if (!id) {
      return new Response(
        JSON.stringify({ error: "Binding ID is required" }),
        { status: 400 },
      );
    }

    const existing = await getBindingIfOwned(id, auth.organizationId);
    if (!existing) {
      return new Response(JSON.stringify({ error: "Binding not found" }), {
        status: 404,
      });
    }

    await getDb().delete(programGear).where(eq(programGear.id, id));

    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch (error: any) {
    console.error("Error deleting program gear binding:", error);
    if (getDbErrorCode(error) === "23503") {
      return new Response(
        JSON.stringify({
          error: "Cannot delete binding that is referenced by active orders",
        }),
        { status: 400 },
      );
    }
    return new Response(
      JSON.stringify({ error: "Failed to delete binding" }),
      { status: 500 },
    );
  }
};
