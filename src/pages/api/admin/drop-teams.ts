import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { dropTeams, dropPlayers } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { requireSuperAdminAccess, requireOrganizationContext } from "@/lib/auth";

const createSchema = z.object({
  action: z.literal("create"),
  dropSeasonId: z.string().uuid(),
  name: z.string().min(1, "Name is required"),
  color: z.string().optional().nullable(),
});

const assignSchema = z.object({
  action: z.literal("assign"),
  dropPlayerId: z.string().uuid(),
  dropTeamId: z.string().uuid(),
});

const postBodySchema = z.discriminatedUnion("action", [createSchema, assignSchema]);

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

    // Fetch teams for this season (org-scoped)
    const teams = await db
      .select()
      .from(dropTeams)
      .where(
        and(
          eq(dropTeams.dropSeasonId, dropSeasonId),
          eq(dropTeams.organizationId, orgContext.organizationId)
        )
      )
      .orderBy(dropTeams.createdAt);

    // Fetch roster for each team — standalone query (pool is max:1, no nesting)
    const teamIds = teams.map((t) => t.id);
    const rosterRows =
      teamIds.length > 0
        ? await db
            .select({
              id: dropPlayers.id,
              dropTeamId: dropPlayers.dropTeamId,
              firstName: dropPlayers.firstName,
              lastName: dropPlayers.lastName,
              division: dropPlayers.division,
            })
            .from(dropPlayers)
            .where(
              and(
                eq(dropPlayers.dropSeasonId, dropSeasonId),
                eq(dropPlayers.organizationId, orgContext.organizationId)
              )
            )
        : [];

    // Group roster rows by team
    const rosterByTeam = new Map<string, typeof rosterRows>();
    for (const row of rosterRows) {
      if (row.dropTeamId === null) continue;
      const bucket = rosterByTeam.get(row.dropTeamId) ?? [];
      bucket.push(row);
      rosterByTeam.set(row.dropTeamId, bucket);
    }

    const teamsWithRoster = teams.map((t) => ({
      ...t,
      roster: rosterByTeam.get(t.id) ?? [],
    }));

    return new Response(JSON.stringify({ teams: teamsWithRoster }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error fetching drop teams:", error);
    return new Response(
      JSON.stringify({ error: "Failed to fetch drop teams" }),
      { status: 500 }
    );
  }
};

export const POST: APIRoute = async (context) => {
  const auth = await requireSuperAdminAccess(context);
  if (!auth.authorized) return auth.response;

  const orgContext = await requireOrganizationContext(context);
  if (!orgContext.hasOrganization) return orgContext.response;

  try {
    const body = await context.request.json();
    const result = postBodySchema.safeParse(body);

    if (!result.success) {
      return new Response(
        JSON.stringify({
          error: "Validation failed",
          details: result.error.flatten().fieldErrors,
        }),
        { status: 400 }
      );
    }

    const db = getDb();
    const data = result.data;

    if (data.action === "create") {
      const [newTeam] = await db
        .insert(dropTeams)
        .values({
          dropSeasonId: data.dropSeasonId,
          organizationId: orgContext.organizationId,
          name: data.name,
          color: data.color ?? null,
        })
        .returning();

      return new Response(JSON.stringify({ team: newTeam }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      });
    }

    // action === "assign"
    // Validate player exists within caller's org
    const [player] = await db
      .select({
        id: dropPlayers.id,
        dropSeasonId: dropPlayers.dropSeasonId,
        organizationId: dropPlayers.organizationId,
      })
      .from(dropPlayers)
      .where(
        and(
          eq(dropPlayers.id, data.dropPlayerId),
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

    // Validate team exists within caller's org AND same season as player
    const [team] = await db
      .select({
        id: dropTeams.id,
        dropSeasonId: dropTeams.dropSeasonId,
        organizationId: dropTeams.organizationId,
      })
      .from(dropTeams)
      .where(
        and(
          eq(dropTeams.id, data.dropTeamId),
          eq(dropTeams.organizationId, orgContext.organizationId)
        )
      )
      .limit(1);

    if (!team) {
      return new Response(
        JSON.stringify({ error: "Team not found" }),
        { status: 404 }
      );
    }

    if (player.dropSeasonId !== team.dropSeasonId) {
      return new Response(
        JSON.stringify({ error: "Player and team must be in the same drop season" }),
        { status: 400 }
      );
    }

    await db
      .update(dropPlayers)
      .set({ dropTeamId: data.dropTeamId })
      .where(eq(dropPlayers.id, data.dropPlayerId));

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in drop-teams POST:", error);
    return new Response(
      JSON.stringify({ error: "Request failed" }),
      { status: 500 }
    );
  }
};
