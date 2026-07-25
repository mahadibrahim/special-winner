import type { APIRoute } from "astro";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { seasons } from "@/lib/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { requireOrgAdminAccess } from "@/lib/auth";
import {
  requireSameOrgProgram,
  ownershipDeniedResponse,
} from "@/lib/auth/require-resource-ownership";

const DAY = z.enum(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]);

const bodySchema = z.object({
  assignments: z
    .array(
      z.object({
        seasonId: z.string().uuid(),
        dayOfWeek: DAY.nullable(),
      }),
    )
    // The planner posts every division for the selected venue at once; a big
    // program (or the "no venue set" bucket) can exceed a couple hundred. Cap
    // high enough not to reject a real save, low enough to bound the tx.
    .max(2000),
});

/**
 * Batch-assign a day-of-week to a program's divisions (seasons). Days-only
 * capacity planning — see the day-planner spec. Tenant-scoped: the program must
 * belong to the caller's org, and every seasonId must belong to that program.
 */
export const PATCH: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;

  const programId = context.params.id;
  if (!programId) {
    return new Response(JSON.stringify({ error: "Missing program id" }), { status: 400 });
  }

  const owns = await requireSameOrgProgram(auth.organizationId, programId);
  if (!owns.ok) return ownershipDeniedResponse();

  const parsed = bodySchema.safeParse(await context.request.json().catch(() => null));
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: "Invalid body" }), { status: 400 });
  }
  const { assignments } = parsed.data;
  if (assignments.length === 0) {
    return new Response(JSON.stringify({ updated: 0 }), { status: 200 });
  }

  const db = getDb();
  // Every seasonId must belong to THIS program — blocks cross-program (and thus
  // cross-org, since the program is already org-verified) writes.
  const ids = [...new Set(assignments.map((a) => a.seasonId))];
  const owned = await db
    .select({ id: seasons.id })
    .from(seasons)
    .where(and(eq(seasons.programId, programId), inArray(seasons.id, ids)));

  if (owned.length !== ids.length) {
    return new Response(JSON.stringify({ error: "Unknown season for program" }), { status: 400 });
  }

  await db.transaction(async (tx) => {
    for (const a of assignments) {
      await tx.update(seasons).set({ dayOfWeek: a.dayOfWeek }).where(eq(seasons.id, a.seasonId));
    }
  });

  return new Response(JSON.stringify({ updated: assignments.length }), { status: 200 });
};
