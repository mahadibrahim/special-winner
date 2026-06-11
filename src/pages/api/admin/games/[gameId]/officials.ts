/**
 * /api/admin/games/:gameId/officials
 *
 * Ref-assignment MVP. GET lists a game's officials; POST assigns one
 * (upsert by (game, user) — re-assigning the same official updates the
 * slot/fee instead of erroring). Fee + paymentStatus are bookkeeping:
 * v1 payouts happen manually in the Stripe dashboard, this is the
 * system of record for who is owed what.
 *
 * Tenant rule: every read/mutation validates the game belongs to the
 * caller's org via requireSameOrgGame (CLAUDE.md: never skip this on
 * admin endpoints).
 */
import type { APIRoute } from "astro";
import { z } from "zod";
import { eq, asc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { gameOfficials } from "@/lib/db/schema/teams";
import { users } from "@/lib/db/schema/users";
import { requireSuperAdminAccess, requireOrganizationContext } from "@/lib/auth";
import { requireSameOrgGame } from "@/lib/auth/require-resource-ownership";

const assignSchema = z.object({
  userId: z.string().uuid(),
  position: z.string().trim().min(1).max(50).default("referee"),
  feeCents: z.number().int().min(0).max(1_000_000).default(0),
  notes: z.string().trim().max(2000).optional(),
});

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export const GET: APIRoute = async (context) => {
  const auth = await requireSuperAdminAccess(context);
  if (!auth.authorized) return auth.response;
  const orgContext = await requireOrganizationContext(context);
  if (!orgContext.hasOrganization) return orgContext.response;

  const gameId = context.params.gameId;
  if (!gameId) return json({ error: "gameId required" }, 400);

  const owned = await requireSameOrgGame(orgContext.organizationId, gameId);
  if (!owned.ok) return json({ error: "Game not found" }, owned.status);

  const rows = await getDb()
    .select({
      id: gameOfficials.id,
      userId: gameOfficials.userId,
      position: gameOfficials.position,
      feeCents: gameOfficials.feeCents,
      paymentStatus: gameOfficials.paymentStatus,
      notes: gameOfficials.notes,
      createdAt: gameOfficials.createdAt,
      official: {
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
        phone: users.phone,
      },
    })
    .from(gameOfficials)
    .innerJoin(users, eq(gameOfficials.userId, users.id))
    .where(eq(gameOfficials.gameId, gameId))
    .orderBy(asc(gameOfficials.createdAt));

  return json({ officials: rows }, 200);
};

export const POST: APIRoute = async (context) => {
  const auth = await requireSuperAdminAccess(context);
  if (!auth.authorized) return auth.response;
  const orgContext = await requireOrganizationContext(context);
  if (!orgContext.hasOrganization) return orgContext.response;

  const gameId = context.params.gameId;
  if (!gameId) return json({ error: "gameId required" }, 400);

  const owned = await requireSameOrgGame(orgContext.organizationId, gameId);
  if (!owned.ok) return json({ error: "Game not found" }, owned.status);

  let parsed;
  try {
    parsed = assignSchema.safeParse(await context.request.json());
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0].message }, 400);
  }
  const { userId, position, feeCents, notes } = parsed.data;

  // The official must be a real user; any user can be assigned (the
  // referee ROLE drives the picker UI, not an assignment constraint —
  // a coach covering a game is legitimate).
  const [official] = await getDb()
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!official) return json({ error: "User not found" }, 404);

  const [row] = await getDb()
    .insert(gameOfficials)
    .values({ gameId, userId, position, feeCents, notes: notes ?? null })
    .onConflictDoUpdate({
      target: [gameOfficials.gameId, gameOfficials.userId],
      set: {
        position,
        feeCents,
        notes: notes ?? null,
        updatedAt: new Date(),
      },
    })
    .returning();

  return json({ official: row }, 200);
};
