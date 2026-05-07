/**
 * GET /api/admin/users/:id/skill-levels  → list per-sport skill levels for a user
 * PUT /api/admin/users/:id/skill-levels  → upsert one (sport, level, source).
 *                                          source defaults to admin_assigned.
 *
 * Body shape for PUT:
 *   { sport: string, level: "recreational"|"intermediate"|"advanced",
 *     remove?: boolean }
 *
 * Setting `remove: true` deletes the row (admin-overrides can be undone).
 */
import type { APIRoute } from "astro";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { userSkillLevels } from "@/lib/db/schema/drop-in";
import { users } from "@/lib/db/schema/users";
import { requireAdminAccess } from "@/lib/auth/roles";

export const prerender = false;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const VALID_LEVELS = new Set(["recreational", "intermediate", "advanced"]);

export const GET: APIRoute = async (context) => {
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) return auth.response;

  const userId = context.params.id;
  if (!userId) return json({ error: "user id required" }, 400);

  const db = getDb();
  // Confirm user exists; we don't gate by org because users are not
  // org-scoped at the schema level. This is consistent with other admin
  // user endpoints.
  const [u] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!u) return json({ error: "User not found" }, 404);

  const rows = await db
    .select()
    .from(userSkillLevels)
    .where(eq(userSkillLevels.userId, userId));

  return json({ skillLevels: rows }, 200);
};

interface PutBody {
  sport?: string;
  level?: "recreational" | "intermediate" | "advanced";
  remove?: boolean;
}

export const PUT: APIRoute = async (context) => {
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) return auth.response;

  const userId = context.params.id;
  if (!userId) return json({ error: "user id required" }, 400);

  let body: PutBody;
  try {
    body = await context.request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  if (!body.sport || typeof body.sport !== "string") {
    return json({ error: "sport required" }, 400);
  }
  const sport = body.sport.trim().toLowerCase();

  const db = getDb();
  const [u] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!u) return json({ error: "User not found" }, 404);

  if (body.remove) {
    await db
      .delete(userSkillLevels)
      .where(
        and(
          eq(userSkillLevels.userId, userId),
          eq(userSkillLevels.sport, sport),
        ),
      );
    return json({ ok: true, removed: true }, 200);
  }

  if (!body.level || !VALID_LEVELS.has(body.level)) {
    return json(
      { error: "level must be recreational, intermediate, or advanced" },
      400,
    );
  }

  const [row] = await db
    .insert(userSkillLevels)
    .values({
      userId,
      sport,
      level: body.level,
      source: "admin_assigned",
      setAt: new Date(),
      setByUserId: auth.user.id,
    })
    .onConflictDoUpdate({
      target: [userSkillLevels.userId, userSkillLevels.sport],
      set: {
        level: body.level,
        source: "admin_assigned",
        setAt: new Date(),
        setByUserId: auth.user.id,
      },
    })
    .returning();

  return json({ skillLevel: row }, 200);
};
