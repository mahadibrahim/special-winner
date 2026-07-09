/**
 * PATCH/DELETE /api/admin/games/:gameId/officials/:officialId
 *
 * Update an assignment (fee, position, paid flag, notes) or remove it.
 * Tenant-validated through the game (requireSameOrgGame) AND the
 * assignment row's gameId — an official id from another game 404s.
 */
import type { APIRoute } from "astro";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { games, gameOfficials } from "@/lib/db/schema/teams";
import { requireSuperAdminAccess, requireOrganizationContext } from "@/lib/auth";
import { requireSameOrgGame } from "@/lib/auth/require-resource-ownership";

const updateSchema = z
  .object({
    position: z.string().trim().min(1).max(50).optional(),
    feeCents: z.number().int().min(0).max(1_000_000).optional(),
    paymentStatus: z.enum(["unpaid", "paid"]).optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "At least one field is required",
  });

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

async function authorize(context: Parameters<APIRoute>[0]) {
  const auth = await requireSuperAdminAccess(context);
  if (!auth.authorized) return { ok: false as const, response: auth.response };
  const orgContext = await requireOrganizationContext(context);
  if (!orgContext.hasOrganization)
    return { ok: false as const, response: orgContext.response };

  const { gameId, officialId } = context.params;
  if (!gameId || !officialId)
    return {
      ok: false as const,
      response: json({ error: "gameId and officialId required" }, 400),
    };

  const owned = await requireSameOrgGame(orgContext.organizationId, gameId);
  if (!owned.ok)
    return {
      ok: false as const,
      response: json({ error: "Game not found" }, owned.status),
    };

  return { ok: true as const, gameId, officialId };
}

export const PATCH: APIRoute = async (context) => {
  const authz = await authorize(context);
  if (!authz.ok) return authz.response;

  let parsed;
  try {
    parsed = updateSchema.safeParse(await context.request.json());
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0].message }, 400);
  }

  if (parsed.data.paymentStatus === "paid") {
    const [g] = await getDb()
      .select({ status: games.status })
      .from(games)
      .where(eq(games.id, authz.gameId))
      .limit(1);
    if (!g) return json({ error: "Game not found" }, 404);
    if (g.status !== "completed") {
      return json({ error: "Cannot mark paid until the game is closed out" }, 400);
    }
  }

  const [row] = await getDb()
    .update(gameOfficials)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(
      and(
        eq(gameOfficials.id, authz.officialId),
        eq(gameOfficials.gameId, authz.gameId),
      ),
    )
    .returning();

  if (!row) return json({ error: "Assignment not found" }, 404);
  return json({ official: row }, 200);
};

export const DELETE: APIRoute = async (context) => {
  const authz = await authorize(context);
  if (!authz.ok) return authz.response;

  const [row] = await getDb()
    .delete(gameOfficials)
    .where(
      and(
        eq(gameOfficials.id, authz.officialId),
        eq(gameOfficials.gameId, authz.gameId),
      ),
    )
    .returning();

  if (!row) return json({ error: "Assignment not found" }, 404);
  return json({ success: true }, 200);
};
