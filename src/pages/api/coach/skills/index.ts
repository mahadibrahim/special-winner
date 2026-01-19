import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { skills, skillDomains, developmentStages, sports } from "@/lib/db/schema";
import { eq, and, or } from "drizzle-orm";

// GET - Get skills by sport and optionally by stage/domain
export const GET: APIRoute = async ({ url, locals }) => {
  try {
    const user = locals.user;
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const db = getDb();

    // Query parameters
    const sportId = url.searchParams.get("sportId");
    const stageId = url.searchParams.get("stageId");
    const domainId = url.searchParams.get("domainId");
    const isCore = url.searchParams.get("isCore");

    if (!sportId) {
      return new Response(JSON.stringify({ error: "sportId is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Build query conditions
    const conditions = [
      eq(skills.sportId, sportId),
      eq(skills.active, true),
    ];

    if (stageId) {
      conditions.push(eq(skills.stageId, stageId));
    }

    if (domainId) {
      conditions.push(eq(skills.domainId, domainId));
    }

    if (isCore === "true") {
      conditions.push(eq(skills.isCore, true));
    }

    // Fetch skills with domain and stage info
    const skillsList = await getDb()
      .select({
        id: skills.id,
        name: skills.name,
        slug: skills.slug,
        description: skills.description,
        introductionAge: skills.introductionAge,
        assessmentMethod: skills.assessmentMethod,
        progressionLevels: skills.progressionLevels,
        observableBehaviors: skills.observableBehaviors,
        commonMistakes: skills.commonMistakes,
        coachingTips: skills.coachingTips,
        tags: skills.tags,
        isCore: skills.isCore,
        sortOrder: skills.sortOrder,
        domain: {
          id: skillDomains.id,
          name: skillDomains.name,
          displayName: skillDomains.displayName,
          color: skillDomains.color,
          icon: skillDomains.icon,
        },
        stage: {
          id: developmentStages.id,
          name: developmentStages.name,
          slug: developmentStages.slug,
          ageMin: developmentStages.ageMin,
          ageMax: developmentStages.ageMax,
        },
      })
      .from(skills)
      .innerJoin(skillDomains, eq(skills.domainId, skillDomains.id))
      .innerJoin(developmentStages, eq(skills.stageId, developmentStages.id))
      .where(and(...conditions))
      .orderBy(skillDomains.sortOrder, developmentStages.sortOrder, skills.sortOrder);

    return new Response(JSON.stringify({ skills: skillsList }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error fetching skills:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};

// GET all domains
export const getDomains = async () => {
  return await getDb()
    .select()
    .from(skillDomains)
    .orderBy(skillDomains.sortOrder);
};

// GET all stages
export const getStages = async () => {
  return await getDb()
    .select()
    .from(developmentStages)
    .orderBy(developmentStages.sortOrder);
};
