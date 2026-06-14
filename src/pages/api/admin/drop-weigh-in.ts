import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { dropPlayers, dropWeighIns } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { requireSuperAdminAccess, requireOrganizationContext } from "@/lib/auth";

const weighInSchema = z.object({
  dropPlayerId: z.string().uuid(),
  weekNumber: z.number().int().min(1),
  weightG: z.number().int().positive(),
  weighInDate: z.string().optional().nullable(),
});

export const POST: APIRoute = async (context) => {
  const auth = await requireSuperAdminAccess(context);
  if (!auth.authorized) return auth.response;

  const orgContext = await requireOrganizationContext(context);
  if (!orgContext.hasOrganization) return orgContext.response;

  try {
    const body = await context.request.json();
    const result = weighInSchema.safeParse(body);

    if (!result.success) {
      return new Response(
        JSON.stringify({
          error: "Validation failed",
          details: result.error.flatten().fieldErrors,
        }),
        { status: 400 }
      );
    }

    const { dropPlayerId, weekNumber, weightG, weighInDate } = result.data;
    const db = getDb();

    // Validate player exists in caller's org
    const [player] = await db
      .select({
        id: dropPlayers.id,
        dropSeasonId: dropPlayers.dropSeasonId,
        organizationId: dropPlayers.organizationId,
        seasonStartWeightG: dropPlayers.seasonStartWeightG,
      })
      .from(dropPlayers)
      .where(
        and(
          eq(dropPlayers.id, dropPlayerId),
          eq(dropPlayers.organizationId, orgContext.organizationId)
        )
      )
      .limit(1);

    if (!player) {
      return new Response(
        JSON.stringify({ error: "Player not found" }),
        { status: 404 }
      );
    }

    // Compute delta vs season start
    const deltaVsSeasonStartG = weightG - player.seasonStartWeightG;

    // Look up prior week weigh-in (weekNumber - 1) for delta vs prior week
    // Sequential queries — pool is max:1, no nested transactions
    let deltaVsPriorWeekG: number | null = null;
    if (weekNumber > 1) {
      const [priorRow] = await db
        .select({ weightG: dropWeighIns.weightG })
        .from(dropWeighIns)
        .where(
          and(
            eq(dropWeighIns.dropPlayerId, dropPlayerId),
            eq(dropWeighIns.weekNumber, weekNumber - 1)
          )
        )
        .limit(1);

      if (priorRow) {
        deltaVsPriorWeekG = weightG - priorRow.weightG;
      }
    }

    // Upsert weigh-in row on unique (dropPlayerId, weekNumber)
    await db
      .insert(dropWeighIns)
      .values({
        dropPlayerId,
        dropSeasonId: player.dropSeasonId,
        weekNumber,
        weightG,
        weighInDate: weighInDate ?? null,
        deltaVsSeasonStartG,
        deltaVsPriorWeekG,
        recordedByUserId: auth.user.id,
      })
      .onConflictDoUpdate({
        target: [dropWeighIns.dropPlayerId, dropWeighIns.weekNumber],
        set: {
          weightG,
          weighInDate: weighInDate ?? null,
          deltaVsSeasonStartG,
          deltaVsPriorWeekG,
          recordedByUserId: auth.user.id,
        },
      });

    // Update player's current weight
    await db
      .update(dropPlayers)
      .set({ currentWeightG: weightG })
      .where(eq(dropPlayers.id, dropPlayerId));

    return new Response(JSON.stringify({ ok: true, weekNumber }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error recording weigh-in:", error);
    return new Response(
      JSON.stringify({ error: "Failed to record weigh-in" }),
      { status: 500 }
    );
  }
};
