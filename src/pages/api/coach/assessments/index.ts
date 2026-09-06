import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import {
  playerAssessments,
  playerSkillSummary,
  skills,
  skillDomains,
  developmentStages,
  familyMembers,
  rosters,
  registrations,
  teams,
} from "@/lib/db/schema";
import { eq, and, or, isNull, desc, asc, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import {
  requireCoachPortalAccess,
  canCoachReachFamilyMember,
  getCoachPlayerIds,
} from "@/lib/auth";
import { clampLimit } from "@/lib/http/clamp-limit";
import { recomputePlayerSnapshots } from "@/lib/curriculum/snapshots";

const createAssessmentSchema = z.object({
  familyMemberId: z.string().uuid(),
  skillId: z.string().uuid(),
  teamId: z.string().uuid().optional(),
  seasonId: z.string().uuid().optional(),
  level: z.number().int().min(1).max(5),
  observationContext: z.enum(["practice", "game", "test", "scrimmage", "training"]).default("practice"),
  notes: z.string().optional(),
  strengths: z.array(z.string()).optional(),
  areasForImprovement: z.array(z.string()).optional(),
});

// GET - Get assessments. Two distinct access modes:
//   - `familyMemberId` supplied: a per-child read, gated by
//     `canCoachReachFamilyMember` (roster OR active class assignment
//     covering the child) — same reach predicate the POST write gate uses.
//   - no `familyMemberId`: "list my players" stays ROSTER-ONLY this phase.
//     Opening this to the org's broader coaching staff (`isOrgCoachingStaff`)
//     is deliberately out of scope for S3 — only the single-child path
//     follows class assignments for now.
export const GET: APIRoute = async (context) => {
  try {
    // Portal variant resolves organizationId, needed by
    // canCoachReachFamilyMember's cross-org defense-in-depth checks.
    const auth = await requireCoachPortalAccess(context);
    if (!auth.authorized) return auth.response;

    const db = getDb();

    // Query parameters
    const familyMemberId = context.url.searchParams.get("familyMemberId");
    const skillId = context.url.searchParams.get("skillId");
    const teamId = context.url.searchParams.get("teamId");
    const domainId = context.url.searchParams.get("domainId");
    const limit = clampLimit(context.url.searchParams.get("limit"), 50);

    // If teamId is specified, verify coach owns that team
    if (teamId && !auth.teamIds.includes(teamId)) {
      return new Response(JSON.stringify({ error: "Access denied - not your team" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    // If familyMemberId is specified, verify the coach can reach this child
    // (roster OR class assignment) — the per-child read gate. A specific
    // familyMemberId, once access-checked here, is sufficient on its own —
    // no need to additionally intersect with the roster-only coachPlayerIds
    // list below, which would incorrectly exclude class-only children.
    let conditions;
    if (familyMemberId) {
      const hasAccess = await canCoachReachFamilyMember(auth.user.id, familyMemberId, auth.organizationId);
      if (!hasAccess) {
        return new Response(JSON.stringify({ error: "You don't coach this player" }), {
          status: 403,
          headers: { "Content-Type": "application/json" },
        });
      }
      conditions = [eq(playerAssessments.familyMemberId, familyMemberId)];
    } else {
      // No specific child requested: fall back to the roster-only player
      // list (see header note — broad org-staff read isn't wired up here).
      //
      // Deliberate contract, pinned post-requireCoachPortalAccess swap: a
      // coach-role user with ZERO team assignments (class-only coaches are
      // real since #626) gets 200 with an empty list here, NOT 403. A flat
      // 403 would be wrong now that class-only coaches legitimately exist —
      // they just have nothing in the roster-scoped list, and reach their
      // actual players via the per-child `?familyMemberId=` branch above.
      const coachPlayerIds = await getCoachPlayerIds(auth.teamIds);
      if (coachPlayerIds.length === 0) {
        return new Response(JSON.stringify({ assessments: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      conditions = [inArray(playerAssessments.familyMemberId, coachPlayerIds)];
    }

    if (skillId) {
      conditions.push(eq(playerAssessments.skillId, skillId));
    }

    if (teamId) {
      conditions.push(eq(playerAssessments.teamId, teamId));
    }

    if (domainId) {
      conditions.push(eq(skills.domainId, domainId));
    }

    // Build query
    const assessments = await getDb()
      .select({
        id: playerAssessments.id,
        familyMemberId: playerAssessments.familyMemberId,
        skillId: playerAssessments.skillId,
        teamId: playerAssessments.teamId,
        seasonId: playerAssessments.seasonId,
        coachUserId: playerAssessments.coachUserId,
        level: playerAssessments.level,
        previousLevel: playerAssessments.previousLevel,
        observationContext: playerAssessments.observationContext,
        notes: playerAssessments.notes,
        strengths: playerAssessments.strengths,
        areasForImprovement: playerAssessments.areasForImprovement,
        assessedAt: playerAssessments.assessedAt,
        createdAt: playerAssessments.createdAt,
        skill: {
          id: skills.id,
          name: skills.name,
          description: skills.description,
        },
        domain: {
          id: skillDomains.id,
          name: skillDomains.name,
          displayName: skillDomains.displayName,
          color: skillDomains.color,
        },
        stage: {
          id: developmentStages.id,
          name: developmentStages.name,
        },
        player: {
          id: familyMembers.id,
          firstName: familyMembers.firstName,
          lastName: familyMembers.lastName,
        },
      })
      .from(playerAssessments)
      .innerJoin(skills, eq(playerAssessments.skillId, skills.id))
      .innerJoin(skillDomains, eq(skills.domainId, skillDomains.id))
      .innerJoin(developmentStages, eq(skills.stageId, developmentStages.id))
      .innerJoin(familyMembers, eq(playerAssessments.familyMemberId, familyMembers.id))
      .where(and(...conditions))
      .orderBy(desc(playerAssessments.assessedAt))
      .limit(limit);

    return new Response(JSON.stringify({ assessments }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error fetching assessments:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};

// POST - Create a new assessment
export const POST: APIRoute = async (context) => {
  try {
    // Verify coach access (portal variant resolves organizationId, needed
    // below to org-scope the skillId check)
    const auth = await requireCoachPortalAccess(context);
    if (!auth.authorized) return auth.response;

    const db = getDb();

    // Parse and validate request body
    const body = await context.request.json();
    const validation = createAssessmentSchema.safeParse(body);

    if (!validation.success) {
      return new Response(
        JSON.stringify({
          error: "Validation failed",
          details: validation.error.flatten().fieldErrors,
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const {
      familyMemberId,
      skillId,
      teamId,
      seasonId,
      level,
      observationContext,
      notes,
      strengths,
      areasForImprovement,
    } = validation.data;

    // If teamId is provided, verify coach owns that team
    if (teamId && !auth.teamIds.includes(teamId)) {
      return new Response(JSON.stringify({ error: "Access denied - not your team" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Verify the coach can reach this player — roster OR an active class
    // assignment covering an active enrollment/confirmed booking (#626's
    // unified reach predicate). Context-neutral message: this write is no
    // longer team-only, so "not on your team" would be actively wrong for
    // a class-context coach.
    const hasAccess = await canCoachReachFamilyMember(auth.user.id, familyMemberId, auth.organizationId);
    if (!hasAccess) {
      return new Response(JSON.stringify({ error: "You don't coach this player" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    // seasonId must be a season one of this coach's teams plays in — an
    // arbitrary (even cross-org) season id would otherwise be written bare.
    if (seasonId) {
      const [seasonTeam] = await db
        .select({ id: teams.id })
        .from(teams)
        .where(and(inArray(teams.id, auth.teamIds), eq(teams.seasonId, seasonId)))
        .orderBy(asc(teams.id))
        .limit(1);

      if (!seasonTeam) {
        return new Response(
          JSON.stringify({ error: "Invalid seasonId - not a season your teams play in" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }
    }

    // Verify the player (family member) exists
    const [player] = await getDb()
      .select()
      .from(familyMembers)
      .where(eq(familyMembers.id, familyMemberId));

    if (!player) {
      return new Response(JSON.stringify({ error: "Player not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Verify the skill exists and belongs to this org (or is a global seed)
    // — otherwise a coach could write an assessment against another org's
    // skill by guessing/enumerating its id.
    const [skill] = await getDb()
      .select()
      .from(skills)
      .where(
        and(
          eq(skills.id, skillId),
          or(eq(skills.organizationId, auth.organizationId), isNull(skills.organizationId))
        )
      );

    if (!skill) {
      return new Response(JSON.stringify({ error: "Skill not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Assessment insert + snapshot recompute + summary upsert are ONE unit.
    // If the snapshot recompute throws, everything rolls back and the coach
    // gets a 500 they can retry — a failed write beats a silently stale radar.
    const newAssessment = await db.transaction(async (tx) => {
      const [previousAssessment] = await tx
        .select({ level: playerAssessments.level })
        .from(playerAssessments)
        .where(
          and(
            eq(playerAssessments.familyMemberId, familyMemberId),
            eq(playerAssessments.skillId, skillId)
          )
        )
        .orderBy(desc(playerAssessments.assessedAt), desc(playerAssessments.id))
        .limit(1);

      const previousLevel = previousAssessment?.level ?? null;

      const [created] = await tx
        .insert(playerAssessments)
        .values({
          familyMemberId,
          skillId,
          teamId: teamId || null,
          seasonId: seasonId || null,
          coachUserId: auth.user.id,
          level,
          previousLevel,
          observationContext,
          notes: notes || null,
          strengths: strengths || null,
          areasForImprovement: areasForImprovement || null,
        })
        .returning();

      // Bucket by the assessment's own assessedAt (defaultNow() at insert
      // time here — the schema has no client-supplied assessedAt on this
      // route), not a fresh `new Date()` read, so the snapshot's period key
      // always matches the row that produced it.
      await recomputePlayerSnapshots(tx, familyMemberId, created.assessedAt);

      const now = new Date();
      await tx
        .insert(playerSkillSummary)
        .values({
          familyMemberId,
          skillId,
          currentLevel: level,
          highestLevel: level,
          assessmentCount: 1,
          trend: "new",
          firstAssessedAt: now,
          lastAssessedAt: now,
        })
        .onConflictDoUpdate({
          target: [playerSkillSummary.familyMemberId, playerSkillSummary.skillId],
          set: {
            currentLevel: level,
            highestLevel: sql`GREATEST(${playerSkillSummary.highestLevel}, ${level})`,
            assessmentCount: sql`${playerSkillSummary.assessmentCount} + 1`,
            trend: sql`CASE
              WHEN ${level} > ${playerSkillSummary.currentLevel} THEN 'improving'::trend_direction
              WHEN ${level} < ${playerSkillSummary.currentLevel} THEN 'declining'::trend_direction
              ELSE 'stable'::trend_direction
            END`,
            lastAssessedAt: now,
            updatedAt: now,
          },
        });

      return created;
    });

    return new Response(JSON.stringify({ assessment: newAssessment }), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error creating assessment:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
