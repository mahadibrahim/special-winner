/**
 * GET  /api/admin/classes/blocks → list class blocks for the active org.
 * POST /api/admin/classes/blocks → create a block window.
 *
 * No Stripe objects — blocks price dynamically at purchase time, unlike
 * templates and packs (see src/lib/classes/admin-blocks.ts's doc comment).
 */
import type { APIRoute } from "astro";
import { eq, asc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { classBlocks } from "@/lib/db/schema/classes";
import { requireOrgAdminAccess } from "@/lib/auth/roles";
import { blockInputSchema, hasOverlappingActiveBlock } from "@/lib/classes/admin-blocks";

export const prerender = false;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

export const GET: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;
  const orgId = auth.organizationId;

  const db = getDb();
  const blocks = await db
    .select()
    .from(classBlocks)
    .where(eq(classBlocks.organizationId, orgId))
    .orderBy(asc(classBlocks.startDate), asc(classBlocks.createdAt));
  return json({ blocks }, 200);
};

export const POST: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;
  const orgId = auth.organizationId;

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
    const overlaps = await hasOverlappingActiveBlock(orgId, input.startDate, input.endDate);
    if (overlaps) return json({ error: "overlapping_block" }, 422);
  }

  const db = getDb();
  const [block] = await db
    .insert(classBlocks)
    .values({
      organizationId: orgId,
      name: input.name,
      startDate: input.startDate,
      endDate: input.endDate,
      active: input.active,
    })
    .returning();
  return json({ block }, 201);
};
