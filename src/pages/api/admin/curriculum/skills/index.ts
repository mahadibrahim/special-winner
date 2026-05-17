import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { skills, skillDomains, developmentStages } from "@/lib/db/schema";
import { sports } from "@/lib/db/schema/sports";
import { eq, and, asc, ilike, or, isNull } from "drizzle-orm";
import { z } from "zod";
import { requireAdminAccess, requireOrganizationContext } from "@/lib/auth";
import {
  requireSameOrgSport,
  ownershipDeniedResponse,
} from "@/lib/auth/require-resource-ownership";

const skillSchema = z.object({
  sportId: z.string().uuid(),
  domainId: z.string().uuid(),
  stageId: z.string().uuid().optional(),
  name: z.string().min(1, "Name is required"),
  slug: z.string().min(1, "Slug is required").regex(/^[a-z0-9-]+$/, "Slug must be lowercase with hyphens only"),
  description: z.string().optional(),
  introductionAge: z.number().int().min(3).max(18).optional(),
  assessmentMethod: z.enum(["observation", "test", "game", "self-report"]).default("observation"),
  progressionLevels: z.object({
    1: z.string(),
    2: z.string(),
    3: z.string(),
    4: z.string(),
    5: z.string(),
  }).optional(),
  coachingTips: z.array(z.string()).optional(),
  commonMistakes: z.array(z.string()).optional(),
  sortOrder: z.number().int().default(0),
  active: z.boolean().default(true),
});

// GET - List skills with filtering
export const GET: APIRoute = async (context) => {
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) {
    return auth.response;
  }

  const orgContext = await requireOrganizationContext(context);
  if (!orgContext.hasOrganization) return orgContext.response;

  try {
    const db = getDb();

    const url = new URL(context.request.url);
    const sportId = url.searchParams.get("sportId");
    const domainId = url.searchParams.get("domainId");
    const stageId = url.searchParams.get("stageId");
    const search = url.searchParams.get("search");
    const activeOnly = url.searchParams.get("active") !== "false";

    // Tenant scoping: caller sees their org's skills + global skills
    // (organizationId IS NULL means a platform-wide seed entry).
    const conditions: ReturnType<typeof and>[] = [
      or(
        eq(skills.organizationId, orgContext.organizationId),
        isNull(skills.organizationId),
      )!,
    ];
    if (activeOnly) {
      conditions.push(eq(skills.active, true));
    }
    if (sportId) {
      conditions.push(eq(skills.sportId, sportId));
    }
    if (domainId) {
      conditions.push(eq(skills.domainId, domainId));
    }
    if (stageId) {
      conditions.push(eq(skills.stageId, stageId));
    }
    if (search) {
      conditions.push(
        or(
          ilike(skills.name, `%${search}%`),
          ilike(skills.description, `%${search}%`)
        )!
      );
    }

    const skillsRaw = await getDb()
      .select({
        id: skills.id,
        organizationId: skills.organizationId,
        sportId: skills.sportId,
        domainId: skills.domainId,
        stageId: skills.stageId,
        name: skills.name,
        slug: skills.slug,
        description: skills.description,
        introductionAge: skills.introductionAge,
        assessmentMethod: skills.assessmentMethod,
        progressionLevels: skills.progressionLevels,
        coachingTips: skills.coachingTips,
        commonMistakes: skills.commonMistakes,
        sortOrder: skills.sortOrder,
        active: skills.active,
        createdAt: skills.createdAt,
        sportName: sports.name,
        domainName: skillDomains.displayName,
      })
      .from(skills)
      .innerJoin(sports, eq(skills.sportId, sports.id))
      .innerJoin(skillDomains, eq(skills.domainId, skillDomains.id))
      .where(and(...conditions))
      .orderBy(asc(skills.sortOrder), asc(skills.name));

    // Transform to match expected shape
    const skillsList = skillsRaw.map((s) => ({
      ...s,
      sport: { id: s.sportId, name: s.sportName },
      domain: { id: s.domainId, name: s.domainName },
    }));

    // Get reference data for filters — sports scoped to caller's org.
    const [sportsList, domainsList, stagesList] = await Promise.all([
      getDb()
        .select({ id: sports.id, name: sports.name })
        .from(sports)
        .where(eq(sports.organizationId, orgContext.organizationId))
        .orderBy(asc(sports.name)),
      getDb().select({ id: skillDomains.id, name: skillDomains.displayName }).from(skillDomains).orderBy(asc(skillDomains.sortOrder)),
      getDb().select({ id: developmentStages.id, name: developmentStages.name, slug: developmentStages.slug }).from(developmentStages).orderBy(asc(developmentStages.sortOrder)),
    ]);

    return new Response(
      JSON.stringify({
        skills: skillsList,
        sports: sportsList,
        domains: domainsList,
        stages: stagesList,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error fetching skills:", error);
    return new Response(JSON.stringify({ error: "Failed to fetch skills" }), { status: 500 });
  }
};

// POST - Create new skill
export const POST: APIRoute = async (context) => {
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) {
    return auth.response;
  }

  const orgContext = await requireOrganizationContext(context);
  if (!orgContext.hasOrganization) return orgContext.response;

  try {
    const db = getDb();

    const body = await context.request.json();
    const result = skillSchema.safeParse(body);

    if (!result.success) {
      return new Response(
        JSON.stringify({ error: "Validation failed", details: result.error.flatten().fieldErrors }),
        { status: 400 }
      );
    }

    // Verify the posted sportId belongs to the caller's org.
    const sportCheck = await requireSameOrgSport(
      orgContext.organizationId,
      result.data.sportId,
    );
    if (!sportCheck.ok) return ownershipDeniedResponse();

    // New skills are always created in the caller's org. To seed a global
    // skill (organizationId = null), do it directly in a migration or
    // seed script — not through this endpoint.
    const [newSkill] = await getDb()
      .insert(skills)
      .values({ ...result.data, organizationId: orgContext.organizationId } as any)
      .returning();

    return new Response(JSON.stringify({ skill: newSkill }), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error creating skill:", error);
    if (error.code === "23505") {
      return new Response(JSON.stringify({ error: "A skill with this slug already exists for this sport" }), { status: 409 });
    }
    return new Response(JSON.stringify({ error: "Failed to create skill" }), { status: 500 });
  }
};
