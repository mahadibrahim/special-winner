import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { dropMatches, dropTeams, dropPlayers } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { requireSuperAdminAccess, requireOrganizationContext } from "@/lib/auth";
import { buildPlayerWeeks } from "@/lib/drop-league/match-result";
import { computeTeamBonus, finalScore } from "@/lib/drop-league/scoring";

// ─── Schemas ─────────────────────────────────────────────────────────────────

const createSchema = z.object({
  action: z.literal("create"),
  dropSeasonId: z.string().uuid(),
  weekNumber: z.number().int().min(1),
  homeTeamId: z.string().uuid(),
  awayTeamId: z.string().uuid(),
});

const finalizeSchema = z.object({
  action: z.literal("finalize"),
  dropMatchId: z.string().uuid(),
  homePitchScore: z.number().int().min(0),
  awayPitchScore: z.number().int().min(0),
});

const postBodySchema = z.discriminatedUnion("action", [createSchema, finalizeSchema]);

// ─── GET ─────────────────────────────────────────────────────────────────────

export const GET: APIRoute = async (context) => {
  const auth = await requireSuperAdminAccess(context);
  if (!auth.authorized) return auth.response;

  const orgContext = await requireOrganizationContext(context);
  if (!orgContext.hasOrganization) return orgContext.response;

  const dropSeasonId = context.url.searchParams.get("dropSeasonId");
  if (!dropSeasonId) {
    return new Response(
      JSON.stringify({ error: "dropSeasonId query param is required" }),
      { status: 400 }
    );
  }

  try {
    const db = getDb();

    const matches = await db
      .select()
      .from(dropMatches)
      .where(
        and(
          eq(dropMatches.dropSeasonId, dropSeasonId),
          eq(dropMatches.organizationId, orgContext.organizationId)
        )
      )
      .orderBy(dropMatches.weekNumber, dropMatches.createdAt);

    return new Response(JSON.stringify({ matches }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error fetching drop matches:", error);
    return new Response(
      JSON.stringify({ error: "Failed to fetch drop matches" }),
      { status: 500 }
    );
  }
};

// ─── POST ────────────────────────────────────────────────────────────────────

export const POST: APIRoute = async (context) => {
  const auth = await requireSuperAdminAccess(context);
  if (!auth.authorized) return auth.response;

  const orgContext = await requireOrganizationContext(context);
  if (!orgContext.hasOrganization) return orgContext.response;

  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400 });
  }

  const parsed = postBodySchema.safeParse(body);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({
        error: "Validation failed",
        details: parsed.error.flatten().fieldErrors,
      }),
      { status: 400 }
    );
  }

  const db = getDb();
  const data = parsed.data;

  // ── create ────────────────────────────────────────────────────────────────
  if (data.action === "create") {
    try {
      // Validate home team in this season + org
      const [homeTeam] = await db
        .select({ id: dropTeams.id, dropSeasonId: dropTeams.dropSeasonId })
        .from(dropTeams)
        .where(
          and(
            eq(dropTeams.id, data.homeTeamId),
            eq(dropTeams.organizationId, orgContext.organizationId)
          )
        )
        .limit(1);

      if (!homeTeam) {
        return new Response(
          JSON.stringify({ error: "Home team not found" }),
          { status: 404 }
        );
      }

      if (homeTeam.dropSeasonId !== data.dropSeasonId) {
        return new Response(
          JSON.stringify({ error: "Home team does not belong to the given drop season" }),
          { status: 400 }
        );
      }

      // Validate away team in this season + org
      const [awayTeam] = await db
        .select({ id: dropTeams.id, dropSeasonId: dropTeams.dropSeasonId })
        .from(dropTeams)
        .where(
          and(
            eq(dropTeams.id, data.awayTeamId),
            eq(dropTeams.organizationId, orgContext.organizationId)
          )
        )
        .limit(1);

      if (!awayTeam) {
        return new Response(
          JSON.stringify({ error: "Away team not found" }),
          { status: 404 }
        );
      }

      if (awayTeam.dropSeasonId !== data.dropSeasonId) {
        return new Response(
          JSON.stringify({ error: "Away team does not belong to the given drop season" }),
          { status: 400 }
        );
      }

      const [newMatch] = await db
        .insert(dropMatches)
        .values({
          dropSeasonId: data.dropSeasonId,
          organizationId: orgContext.organizationId,
          weekNumber: data.weekNumber,
          homeTeamId: data.homeTeamId,
          awayTeamId: data.awayTeamId,
          status: "scheduled",
        })
        .returning();

      return new Response(JSON.stringify({ match: newMatch }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      console.error("Error creating drop match:", error);
      return new Response(
        JSON.stringify({ error: "Failed to create match" }),
        { status: 500 }
      );
    }
  }

  // ── finalize ──────────────────────────────────────────────────────────────
  // data.action === "finalize"
  try {
    // Load and org-scope the match
    const [match] = await db
      .select()
      .from(dropMatches)
      .where(
        and(
          eq(dropMatches.id, data.dropMatchId),
          eq(dropMatches.organizationId, orgContext.organizationId)
        )
      )
      .limit(1);

    if (!match) {
      return new Response(
        JSON.stringify({ error: "Match not found" }),
        { status: 404 }
      );
    }

    // Build PlayerWeek arrays from weigh-in history (idempotent — no mutable counters read)
    const homePW = await buildPlayerWeeks(db, {
      dropSeasonId: match.dropSeasonId,
      dropTeamId: match.homeTeamId,
      weekNumber: match.weekNumber,
    });

    const awayPW = await buildPlayerWeeks(db, {
      dropSeasonId: match.dropSeasonId,
      dropTeamId: match.awayTeamId,
      weekNumber: match.weekNumber,
    });

    // Run the scoring engine
    const homeBonus = computeTeamBonus(homePW);
    const awayBonus = computeTeamBonus(awayPW);
    const homeFinal = finalScore(data.homePitchScore, homeBonus);
    const awayFinal = finalScore(data.awayPitchScore, awayBonus);

    // Persist the match result
    await db
      .update(dropMatches)
      .set({
        homePitchScore: data.homePitchScore,
        awayPitchScore: data.awayPitchScore,
        homeBonusGoals: String(homeBonus.bonusGoalsTotal),
        awayBonusGoals: String(awayBonus.bonusGoalsTotal),
        homeFinalScore: String(homeFinal),
        awayFinalScore: String(awayFinal),
        status: "final",
        playedAt: new Date(),
      })
      .where(eq(dropMatches.id, match.id));

    // Sync display counters on dropPlayers for each player who weighed in.
    // These are fully re-derived from the engine output, so re-finalizing
    // produces identical values (idempotent — no drift).
    //
    // Pool is max:1 — run sequential UPDATE statements, never nested.
    const allPW: Array<{ pw: (typeof homePW)[number]; bonus: typeof homeBonus }> = [
      ...homePW.map((pw) => ({ pw, bonus: homeBonus })),
      ...awayPW.map((pw) => ({ pw, bonus: awayBonus })),
    ];

    for (const { pw, bonus } of allPW) {
      const breakdown = bonus.perPlayer.find((b) => b.playerId === pw.playerId);
      if (!breakdown) continue;

      const newWeeksLost = pw.priorWeeksLost + (breakdown.lostVsPrior ? 1 : 0);
      const newHatTricks = Math.min(pw.hatTricksAwarded + (breakdown.hatTrickAwarded ? 1 : 0), 4);
      const newFivePct = pw.fivePctAwarded || breakdown.fivePctNewlyAwarded;
      const newTenPct = pw.tenPctAwarded || breakdown.tenPctNewlyAwarded;

      await db
        .update(dropPlayers)
        .set({
          weeksLost: newWeeksLost,
          hatTricksAwarded: newHatTricks,
          fivePctAwarded: newFivePct,
          tenPctAwarded: newTenPct,
        })
        .where(eq(dropPlayers.id, pw.playerId));
    }

    return new Response(
      JSON.stringify({
        homeFinalScore: homeFinal,
        awayFinalScore: awayFinal,
        homeBonus,
        awayBonus,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error finalizing drop match:", error);
    return new Response(
      JSON.stringify({ error: "Failed to finalize match" }),
      { status: 500 }
    );
  }
};
