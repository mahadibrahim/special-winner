/**
 * PUT    /api/admin/classes/blocks/[id] → edit a block window.
 * DELETE /api/admin/classes/blocks/[id] → hard-delete iff unreferenced, else 409.
 */
import type { APIRoute } from "astro";
import { and, count, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { classBlocks, classCreditGrants } from "@/lib/db/schema/classes";
import { requireOrgAdminAccess } from "@/lib/auth/roles";
import { blockInputSchema, hasOverlappingActiveBlock } from "@/lib/classes/admin-blocks";

export const prerender = false;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

async function loadOwned(orgId: string, id: string) {
  const [row] = await getDb()
    .select()
    .from(classBlocks)
    .where(and(eq(classBlocks.id, id), eq(classBlocks.organizationId, orgId)))
    .limit(1);
  return row ?? null;
}

export const PUT: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;
  const orgId = auth.organizationId;

  const id = context.params.id;
  if (!id) return json({ error: "Block id required" }, 400);

  const existing = await loadOwned(orgId, id);
  if (!existing) return json({ error: "Block not found" }, 404);

  let raw: unknown;
  try {
    raw = await context.request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  const parsed = blockInputSchema.safeParse(raw);
  if (!parsed.success) return json({ error: "Validation failed", details: parsed.error.flatten() }, 422);
  const input = parsed.data;

  if (input.active) {
    const overlaps = await hasOverlappingActiveBlock(orgId, input.startDate, input.endDate, existing.id);
    if (overlaps) return json({ error: "overlapping_block" }, 422);
  }

  const db = getDb();
  const [block] = await db
    .update(classBlocks)
    .set({
      name: input.name,
      startDate: input.startDate,
      endDate: input.endDate,
      active: input.active,
      updatedAt: new Date(),
    })
    .where(eq(classBlocks.id, existing.id))
    .returning();
  return json({ block }, 200);
};

export const DELETE: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;
  const orgId = auth.organizationId;

  const id = context.params.id;
  if (!id) return json({ error: "Block id required" }, 400);

  const existing = await loadOwned(orgId, id);
  if (!existing) return json({ error: "Block not found" }, 404);

  const db = getDb();
  const [{ value }] = await db
    .select({ value: count() })
    .from(classCreditGrants)
    .where(eq(classCreditGrants.blockId, existing.id));
  if (value > 0) return json({ error: "Block has been purchased — deactivate instead" }, 409);

  await db.delete(classBlocks).where(eq(classBlocks.id, existing.id));
  return json({ ok: true }, 200);
};
