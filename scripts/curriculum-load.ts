/**
 * Permanent idempotent curriculum content loader (Task 8 of the
 * curriculum-recovery plan).
 *
 * Upserts the authored `CURRICULUM_CONTENT` registry
 * (src/lib/curriculum/content) into the database by natural key, using the
 * unique indexes added in the Task 1 migration:
 *   - skill_domains: unique(name)            [pre-existing]
 *   - development_stages: unique(slug)       [pre-existing]
 *   - skills: unique(sport_id, slug)
 *   - activities: unique(sport_id, slug)
 *   - practice_templates: unique(sport_id, name)
 *   - coach_prompts: unique(content)
 *   - coach_resources: unique(title)
 *   - coaching_principles: unique(title)
 *
 * Safe to re-run: every write is `INSERT ... ON CONFLICT ... DO UPDATE` on
 * one of the natural keys above, so re-running with unchanged content is a
 * no-op (aside from bumping `updated_at`).
 *
 * Guard style mirrors
 * .superpowers/curriculum-recovery/scripts/curriculum-day0-seed.ts and the
 * staging check in src/lib/db/seeds/seed-e2e-tests.ts:
 *   - ALLOW_CURRICULUM_SEED=yes is ALWAYS required.
 *   - ALLOW_PROD_AUDIT=yes is additionally required when DATABASE_URL does
 *     not contain "staging" (i.e. it looks like it might be prod).
 *
 * Usage:
 *   ALLOW_CURRICULUM_SEED=yes npx tsx scripts/curriculum-load.ts --org <slug> --dry-run
 *   ALLOW_CURRICULUM_SEED=yes npx tsx scripts/curriculum-load.ts --org <slug>
 *   ALLOW_CURRICULUM_SEED=yes ALLOW_PROD_AUDIT=yes npx tsx scripts/curriculum-load.ts --org <slug>
 *
 * `--dry-run` prints the plan report and exits 0 without writing anything
 * (the plan is computed by reading current rows only -- no transaction is
 * opened for writes in this mode).
 */
import "dotenv/config";
import { and, asc, eq } from "drizzle-orm";
import { getDb } from "../src/lib/db";
import { organizations } from "../src/lib/db/schema/organizations";
import { sports } from "../src/lib/db/schema/sports";
import { developmentStages, skillDomains, skills } from "../src/lib/db/schema/curriculum";
import { activities, practiceTemplates } from "../src/lib/db/schema/practice-planning";
import {
  coachPrompts,
  coachResources,
  coachingPrinciples,
} from "../src/lib/db/schema/coach-guidance";
import { CURRICULUM_CONTENT, validateRegistry } from "../src/lib/curriculum/content";
import { planUpserts, type ExistingRows, type UpsertPlan } from "../src/lib/curriculum/load-helpers";
import type {
  ActivityContent,
  DomainName,
  SessionPlanContent,
  SkillContent,
} from "../src/lib/curriculum/content/types";

type DB = ReturnType<typeof getDb>;
type SlugMap = Map<string, string>; // natural key -> uuid

// ---------------------------------------------------------------------------
// CLI arg parsing
// ---------------------------------------------------------------------------

interface CliOptions {
  org: string;
  dryRun: boolean;
}

function parseArgs(argv: string[]): CliOptions {
  let org: string | undefined;
  let dryRun = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--org") {
      org = argv[++i];
    } else if (arg.startsWith("--org=")) {
      org = arg.slice("--org=".length);
    } else if (arg === "--dry-run") {
      dryRun = true;
    }
  }
  if (!org) {
    console.error("REFUSED: --org <slug> is required.");
    console.error("Usage: tsx scripts/curriculum-load.ts --org <slug> [--dry-run]");
    process.exit(2);
  }
  return { org, dryRun };
}

// ---------------------------------------------------------------------------
// Env guards
// ---------------------------------------------------------------------------

function guardEnv(): void {
  if (process.env.ALLOW_CURRICULUM_SEED !== "yes") {
    console.error("REFUSED: set ALLOW_CURRICULUM_SEED=yes to run this loader.");
    process.exit(2);
  }
  if (!process.env.DATABASE_URL) {
    console.error("REFUSED: DATABASE_URL is unset.");
    process.exit(2);
  }
  const looksLikeStaging = /staging/i.test(process.env.DATABASE_URL);
  if (!looksLikeStaging && process.env.ALLOW_PROD_AUDIT !== "yes") {
    console.error(
      "REFUSED: DATABASE_URL does not contain 'staging'. Set ALLOW_PROD_AUDIT=yes to " +
        "confirm you intend to load curriculum content into this database.",
    );
    process.exit(2);
  }
}

// ---------------------------------------------------------------------------
// Sport metadata -- only consulted when creating a brand-new sport row for
// an org that doesn't have one yet for a sport slug the content
// references. Mirrors the (name, icon, color) shape used when sports are
// created by hand elsewhere (src/pages/api/admin/sports.ts,
// src/lib/db/seeds/seed-e2e-tests.ts).
// ---------------------------------------------------------------------------

const SPORT_DEFAULTS: Record<string, { name: string; icon: string; color: string }> = {
  soccer: { name: "Soccer", icon: "⚽", color: "#22c55e" },
  basketball: { name: "Basketball", icon: "🏀", color: "#f97316" },
  hockey: { name: "Hockey", icon: "🏒", color: "#0ea5e9" },
  baseball: { name: "Baseball", icon: "⚾", color: "#eab308" },
};

function sportDefaults(slug: string): { name: string; icon?: string; color?: string } {
  return SPORT_DEFAULTS[slug] ?? { name: slug };
}

// ---------------------------------------------------------------------------
// Org resolution -- CLAUDE.md multi-tenant hazard: explicit orderBy on any
// query that could match more than one row.
// ---------------------------------------------------------------------------

async function resolveOrg(db: DB, slug: string) {
  const rows = await db
    .select()
    .from(organizations)
    .where(eq(organizations.slug, slug))
    .orderBy(asc(organizations.createdAt))
    .limit(1);
  const org = rows[0];
  if (!org) {
    console.error(`REFUSED: no organization found with slug "${slug}".`);
    process.exit(2);
  }
  return org;
}

// ---------------------------------------------------------------------------
// Read the current database state, translated back into content shape, so
// planUpserts() (pure, DB-free) can diff against it. See
// src/lib/curriculum/load-helpers.ts's module header for why this
// translation lives here rather than in the pure helper.
// ---------------------------------------------------------------------------

async function readExistingRows(db: DB, orgId: string): Promise<ExistingRows> {
  const domainRows = await db.select().from(skillDomains);
  const stageRows = await db.select().from(developmentStages);
  // Scoped to this org: skills/activities/practice_templates are always
  // written with organizationId = the target org (see applySkills et al.
  // below) because their sportId already belongs to exactly one org
  // (sports.organizationId is NOT NULL) -- there is no "global" sport to
  // hang a truly platform-wide skill/activity off of.
  const sportRows = await db.select().from(sports).where(eq(sports.organizationId, orgId));
  const skillRows = await db.select().from(skills).where(eq(skills.organizationId, orgId));
  const activityRows = await db.select().from(activities).where(eq(activities.organizationId, orgId));
  const templateRows = await db
    .select()
    .from(practiceTemplates)
    .where(eq(practiceTemplates.organizationId, orgId));
  // NOT org-scoped: coach_prompts/coach_resources have a natural key
  // (content/title) that is global, not org-scoped, and
  // coaching_principles has no organizationId column at all -- these are
  // shared coaching wisdom across the whole platform. See the report for
  // the known limitation this implies for a future multi-org rollout.
  const promptRows = await db.select().from(coachPrompts);
  const resourceRows = await db.select().from(coachResources);
  const principleRows = await db.select().from(coachingPrinciples);

  const domainNameById = new Map(domainRows.map((d) => [d.id, d.name]));
  const stageSlugById = new Map(stageRows.map((s) => [s.id, s.slug]));
  const sportSlugById = new Map(sportRows.map((s) => [s.id, s.slug]));

  const skillIdIndex = new Map<string, { sport: string; slug: string }>();
  const existingSkills: SkillContent[] = skillRows.map((s) => {
    const sport = sportSlugById.get(s.sportId) ?? "";
    skillIdIndex.set(s.id, { sport, slug: s.slug });
    return {
      slug: s.slug,
      name: s.name,
      sport,
      domain: (domainNameById.get(s.domainId) ?? "technical") as DomainName,
      stage: stageSlugById.get(s.stageId) ?? "",
      description: s.description ?? undefined,
      introductionAge: s.introductionAge ?? undefined,
      assessmentMethod: s.assessmentMethod ?? undefined,
      progressionLevels: s.progressionLevels ?? undefined,
      observableBehaviors: s.observableBehaviors ?? undefined,
      commonMistakes: s.commonMistakes ?? undefined,
      coachingTips: s.coachingTips ?? undefined,
      tags: s.tags ?? undefined,
      comprehensiveGuide: s.comprehensiveGuide ?? undefined,
      isCore: s.isCore,
      sortOrder: s.sortOrder,
    };
  });

  const existingActivities: ActivityContent[] = activityRows.map((a) => {
    const sport = sportSlugById.get(a.sportId) ?? "";
    const skillsDeveloped = (a.skillsDeveloped ?? [])
      .map((id) => skillIdIndex.get(id)?.slug)
      .filter((slug): slug is string => !!slug);
    const appropriateStages = (a.appropriateStageIds ?? [])
      .map((id) => stageSlugById.get(id))
      .filter((slug): slug is string => !!slug);
    return {
      slug: a.slug,
      name: a.name,
      description: a.description ?? undefined,
      sport,
      activityType: a.activityType,
      difficulty: a.difficulty,
      minPlayers: a.minPlayers,
      maxPlayers: a.maxPlayers ?? undefined,
      durationMinutes: a.durationMinutes,
      skillsDeveloped: skillsDeveloped.length ? skillsDeveloped : undefined,
      setupInstructions: a.setupInstructions ?? undefined,
      howToPlay: a.howToPlay,
      diagram: a.diagram ?? undefined,
      coachingPoints: a.coachingPoints ?? undefined,
      questionsToAsk: a.questionsToAsk ?? undefined,
      commonMistakes: a.commonMistakes ?? undefined,
      variations: a.variations ?? undefined,
      makeEasier: a.makeEasier ?? undefined,
      makeHarder: a.makeHarder ?? undefined,
      equipmentNeeded: a.equipmentNeeded ?? undefined,
      spaceRequired: a.spaceRequired ?? undefined,
      indoorSuitable: a.indoorSuitable,
      appropriateStages: appropriateStages.length ? appropriateStages : undefined,
      tags: a.tags ?? undefined,
      featured: a.featured,
      comprehensiveGuide: a.comprehensiveGuide ?? undefined,
    };
  });

  const existingTemplates: SessionPlanContent[] = templateRows.map((t) => ({
    name: t.name,
    sport: sportSlugById.get(t.sportId) ?? "",
    stage: stageSlugById.get(t.stageId),
    durationMinutes: t.totalDurationMinutes,
    structure: t.structure ?? [],
    description: t.description ?? undefined,
    equipmentNeeded: t.equipmentNeeded ?? undefined,
    isDefault: t.isDefault,
    coachingNotes: t.coachingNotes ?? undefined,
  }));

  const withSportStage = (
    base: Record<string, unknown>,
    sportId: string | null,
    stageId: string | null,
  ): Record<string, unknown> => {
    const row = { ...base };
    if (sportId) {
      const slug = sportSlugById.get(sportId);
      if (slug) row.sport = slug;
    }
    if (stageId) {
      const slug = stageSlugById.get(stageId);
      if (slug) row.stage = slug;
    }
    return row;
  };

  const existingPrompts = promptRows.map((p) =>
    withSportStage(
      {
        triggerContext: p.triggerContext,
        promptType: p.promptType,
        title: p.title ?? undefined,
        content: p.content,
        priority: p.priority,
        frequency: p.frequency,
        isQuestionBased: p.isQuestionBased,
        targetedBehavior: p.targetedBehavior ?? undefined,
        tags: p.tags ?? undefined,
        active: p.active,
      },
      p.sportId,
      p.stageId,
    ),
  );

  const existingResources = resourceRows.map((r) =>
    withSportStage(
      {
        resourceType: r.resourceType,
        title: r.title,
        description: r.description ?? undefined,
        url: r.url ?? undefined,
        content: r.content ?? undefined,
        thumbnailUrl: r.thumbnailUrl ?? undefined,
        durationMinutes: r.durationMinutes ?? undefined,
        topic: r.topic ?? undefined,
        tags: r.tags ?? undefined,
        source: r.source ?? undefined,
        author: r.author ?? undefined,
        featured: r.featured,
        active: r.active,
      },
      r.sportId,
      r.stageId,
    ),
  );

  const existingPrinciples = principleRows.map((p) =>
    withSportStage(
      {
        title: p.title,
        principle: p.principle,
        explanation: p.explanation ?? undefined,
        doExamples: p.doExamples ?? undefined,
        dontExamples: p.dontExamples ?? undefined,
        europeanInsight: p.europeanInsight ?? undefined,
        source: p.source ?? undefined,
        sortOrder: p.sortOrder,
        active: p.active,
      },
      p.sportId,
      p.stageId,
    ),
  );

  return {
    domains: domainRows.map((d) => ({
      name: d.name,
      displayName: d.displayName,
      description: d.description ?? "",
      color: d.color ?? undefined,
      icon: d.icon ?? undefined,
      assessmentFrequency: d.assessmentFrequency ?? undefined,
      weightInOverall: d.weightInOverall ?? "0",
      sortOrder: d.sortOrder,
    })),
    stages: stageRows.map((s) => ({
      slug: s.slug,
      name: s.name,
      ageMin: s.ageMin,
      ageMax: s.ageMax,
      description: s.description ?? "",
      philosophy: s.philosophy ?? undefined,
      practiceToGameRatio: s.practiceToGameRatio ?? undefined,
      maxHoursPerWeek: s.maxHoursPerWeek ?? undefined,
      keyPrinciples: s.keyPrinciples ?? undefined,
      coachRole: s.coachRole ?? undefined,
      sortOrder: s.sortOrder,
    })),
    skills: existingSkills,
    activities: existingActivities,
    templates: existingTemplates,
    prompts: existingPrompts,
    resources: existingResources,
    principles: existingPrinciples,
  };
}

// ---------------------------------------------------------------------------
// Apply -- one upsert pass per table, in the load order specified by the
// plan: reference tables first (domains/stages, platform-wide), then
// sports (org-scoped, created if missing), then skills (need domain/stage/
// sport ids), then activities (need skill/stage ids), then practice
// templates, then coach guidance (need sport/stage ids, org-scoped
// organizationId but a global natural key -- see readExistingRows above).
// ---------------------------------------------------------------------------

async function applyDomainsAndStages(db: DB): Promise<{ domainMap: SlugMap; stageMap: SlugMap }> {
  for (const d of CURRICULUM_CONTENT.domains) {
    const set = {
      displayName: d.displayName,
      description: d.description,
      color: d.color,
      icon: d.icon,
      assessmentFrequency: d.assessmentFrequency,
      weightInOverall: d.weightInOverall,
      sortOrder: d.sortOrder,
      updatedAt: new Date(),
    };
    await db
      .insert(skillDomains)
      .values({ name: d.name, ...set })
      .onConflictDoUpdate({ target: skillDomains.name, set });
  }

  for (const s of CURRICULUM_CONTENT.stages) {
    const set = {
      name: s.name,
      ageMin: s.ageMin,
      ageMax: s.ageMax,
      description: s.description,
      philosophy: s.philosophy,
      practiceToGameRatio: s.practiceToGameRatio,
      maxHoursPerWeek: s.maxHoursPerWeek,
      keyPrinciples: s.keyPrinciples,
      coachRole: s.coachRole,
      sortOrder: s.sortOrder,
      updatedAt: new Date(),
    };
    await db
      .insert(developmentStages)
      .values({ slug: s.slug, ...set })
      .onConflictDoUpdate({ target: developmentStages.slug, set });
  }

  const domainRows = await db.select().from(skillDomains);
  const stageRows = await db.select().from(developmentStages);
  return {
    domainMap: new Map(domainRows.map((d) => [d.name, d.id])),
    stageMap: new Map(stageRows.map((s) => [s.slug, s.id])),
  };
}

async function resolveSports(db: DB, orgId: string, sportSlugs: string[]): Promise<SlugMap> {
  const existingRows = await db.select().from(sports).where(eq(sports.organizationId, orgId));
  const map: SlugMap = new Map(existingRows.map((s) => [s.slug, s.id]));

  for (const slug of sportSlugs) {
    if (map.has(slug)) continue;
    const defaults = sportDefaults(slug);
    const [created] = await db
      .insert(sports)
      .values({
        organizationId: orgId,
        name: defaults.name,
        slug,
        icon: defaults.icon,
        color: defaults.color,
      })
      .onConflictDoNothing()
      .returning();
    if (created) {
      map.set(slug, created.id);
      continue;
    }
    // Lost a race with a concurrent insert (unique on organizationId+slug)
    // -- re-select rather than fail.
    const rows = await db
      .select()
      .from(sports)
      .where(and(eq(sports.organizationId, orgId), eq(sports.slug, slug)))
      .orderBy(asc(sports.createdAt))
      .limit(1);
    if (rows[0]) map.set(slug, rows[0].id);
  }

  return map;
}

async function applySkills(
  db: DB,
  orgId: string,
  sportMap: SlugMap,
  domainMap: SlugMap,
  stageMap: SlugMap,
): Promise<SlugMap> {
  const skillIdMap: SlugMap = new Map();
  for (const s of CURRICULUM_CONTENT.skills) {
    const sportId = sportMap.get(s.sport);
    const domainId = domainMap.get(s.domain);
    const stageId = stageMap.get(s.stage);
    if (!sportId || !domainId || !stageId) {
      throw new Error(
        `Cannot resolve sport/domain/stage for skill "${s.slug}" (sport=${s.sport}, domain=${s.domain}, stage=${s.stage})`,
      );
    }
    const set = {
      organizationId: orgId,
      domainId,
      stageId,
      name: s.name,
      description: s.description,
      introductionAge: s.introductionAge,
      assessmentMethod: s.assessmentMethod ?? "observation",
      progressionLevels: s.progressionLevels,
      observableBehaviors: s.observableBehaviors,
      commonMistakes: s.commonMistakes,
      coachingTips: s.coachingTips,
      tags: s.tags,
      // comprehensiveGuide is `unknown` in SkillContent by design (Task 2)
      // -- content authors transcribed it verbatim from the recovered
      // seeds to match skills.comprehensiveGuide's $type exactly.
      comprehensiveGuide: s.comprehensiveGuide as never,
      isCore: s.isCore ?? false,
      sortOrder: s.sortOrder ?? 0,
      updatedAt: new Date(),
    };
    const [row] = await db
      .insert(skills)
      .values({ sportId, slug: s.slug, ...set })
      .onConflictDoUpdate({ target: [skills.sportId, skills.slug], set })
      .returning({ id: skills.id });
    skillIdMap.set(`${s.sport}::${s.slug}`, row.id);
  }
  return skillIdMap;
}

async function applyActivities(
  db: DB,
  orgId: string,
  sportMap: SlugMap,
  stageMap: SlugMap,
  skillIdMap: SlugMap,
): Promise<void> {
  for (const a of CURRICULUM_CONTENT.activities) {
    const sportId = sportMap.get(a.sport);
    if (!sportId) {
      throw new Error(`Cannot resolve sport for activity "${a.slug}" (sport=${a.sport})`);
    }
    const skillsDeveloped = (a.skillsDeveloped ?? [])
      .map((slug) => skillIdMap.get(`${a.sport}::${slug}`))
      .filter((id): id is string => !!id);
    const appropriateStageIds = (a.appropriateStages ?? [])
      .map((slug) => stageMap.get(slug))
      .filter((id): id is string => !!id);
    const set = {
      organizationId: orgId,
      name: a.name,
      description: a.description,
      activityType: a.activityType as never,
      difficulty: a.difficulty,
      minPlayers: a.minPlayers,
      maxPlayers: a.maxPlayers,
      durationMinutes: a.durationMinutes,
      skillsDeveloped: skillsDeveloped.length ? skillsDeveloped : undefined,
      setupInstructions: a.setupInstructions,
      howToPlay: a.howToPlay,
      diagram: a.diagram,
      coachingPoints: a.coachingPoints,
      questionsToAsk: a.questionsToAsk,
      commonMistakes: a.commonMistakes,
      variations: a.variations,
      makeEasier: a.makeEasier,
      makeHarder: a.makeHarder,
      equipmentNeeded: a.equipmentNeeded,
      spaceRequired: a.spaceRequired,
      indoorSuitable: a.indoorSuitable ?? true,
      appropriateStageIds: appropriateStageIds.length ? appropriateStageIds : undefined,
      tags: a.tags,
      featured: a.featured ?? false,
      comprehensiveGuide: a.comprehensiveGuide as never,
      updatedAt: new Date(),
    };
    await db
      .insert(activities)
      .values({ sportId, slug: a.slug, ...set })
      .onConflictDoUpdate({ target: [activities.sportId, activities.slug], set });
  }
}

async function applyTemplates(
  db: DB,
  orgId: string,
  sportMap: SlugMap,
  stageMap: SlugMap,
): Promise<void> {
  for (const p of CURRICULUM_CONTENT.sessionPlans) {
    const sportId = sportMap.get(p.sport);
    if (!sportId) {
      throw new Error(`Cannot resolve sport for session plan "${p.name}" (sport=${p.sport})`);
    }
    // practice_templates.stage_id is NOT NULL but SessionPlanContent.stage
    // is optional (a plan may be written to suit a broad age range).
    // "fundamentals" is the youngest stage every sport actually seeds
    // skills/activities for, so it's the least-surprising default.
    const stageSlug = p.stage ?? "fundamentals";
    const stageId = stageMap.get(stageSlug);
    if (!stageId) {
      throw new Error(`Cannot resolve stage "${stageSlug}" for session plan "${p.name}"`);
    }
    const set = {
      organizationId: orgId,
      stageId,
      description: p.description,
      totalDurationMinutes: p.durationMinutes,
      structure: p.structure,
      equipmentNeeded: p.equipmentNeeded,
      coachingNotes: p.coachingNotes,
      isDefault: p.isDefault ?? false,
      updatedAt: new Date(),
    };
    await db
      .insert(practiceTemplates)
      .values({ sportId, name: p.name, ...set })
      .onConflictDoUpdate({ target: [practiceTemplates.sportId, practiceTemplates.name], set });
  }
}

async function applyCoachGuidance(
  db: DB,
  orgId: string,
  sportMap: SlugMap,
  stageMap: SlugMap,
): Promise<void> {
  const resolveSportStage = (row: Record<string, unknown>) => ({
    sportId: typeof row.sport === "string" ? sportMap.get(row.sport) : undefined,
    stageId: typeof row.stage === "string" ? stageMap.get(row.stage) : undefined,
  });

  for (const p of CURRICULUM_CONTENT.coachGuidance.prompts) {
    const { sportId, stageId } = resolveSportStage(p);
    const set = {
      organizationId: orgId,
      sportId,
      stageId,
      triggerContext: p.triggerContext as never,
      promptType: p.promptType as never,
      title: p.title as string | undefined,
      priority: (p.priority as number | undefined) ?? 0,
      frequency: p.frequency as never,
      isQuestionBased: (p.isQuestionBased as boolean | undefined) ?? false,
      targetedBehavior: p.targetedBehavior as string | undefined,
      tags: p.tags as string[] | undefined,
      active: (p.active as boolean | undefined) ?? true,
      updatedAt: new Date(),
    };
    await db
      .insert(coachPrompts)
      .values({ content: String(p.content), ...set })
      .onConflictDoUpdate({ target: coachPrompts.content, set });
  }

  for (const r of CURRICULUM_CONTENT.coachGuidance.resources) {
    const { sportId, stageId } = resolveSportStage(r);
    const set = {
      organizationId: orgId,
      sportId,
      stageId,
      resourceType: r.resourceType as never,
      description: r.description as string | undefined,
      url: r.url as string | undefined,
      content: r.content as string | undefined,
      thumbnailUrl: r.thumbnailUrl as string | undefined,
      durationMinutes: r.durationMinutes as number | undefined,
      topic: r.topic as string | undefined,
      tags: r.tags as string[] | undefined,
      source: r.source as string | undefined,
      author: r.author as string | undefined,
      featured: (r.featured as boolean | undefined) ?? false,
      active: (r.active as boolean | undefined) ?? true,
      updatedAt: new Date(),
    };
    await db
      .insert(coachResources)
      .values({ title: String(r.title), ...set })
      .onConflictDoUpdate({ target: coachResources.title, set });
  }

  for (const pr of CURRICULUM_CONTENT.coachGuidance.principles) {
    const { sportId, stageId } = resolveSportStage(pr);
    const set = {
      sportId,
      stageId,
      principle: String(pr.principle),
      explanation: pr.explanation as string | undefined,
      doExamples: pr.doExamples as string[] | undefined,
      dontExamples: pr.dontExamples as string[] | undefined,
      europeanInsight: pr.europeanInsight as string | undefined,
      source: pr.source as string | undefined,
      sortOrder: (pr.sortOrder as number | undefined) ?? 0,
      active: (pr.active as boolean | undefined) ?? true,
      updatedAt: new Date(),
    };
    await db
      .insert(coachingPrinciples)
      .values({ title: String(pr.title), ...set })
      .onConflictDoUpdate({ target: coachingPrinciples.title, set });
  }
}

// ---------------------------------------------------------------------------
// Report printing
// ---------------------------------------------------------------------------

function printReport(plan: UpsertPlan): void {
  const rows: [string, { adds: number; updates: number; unchanged: number }][] = [
    ["skill_domains", plan.domains],
    ["development_stages", plan.stages],
    ["skills", plan.skills],
    ["activities", plan.activities],
    ["practice_templates", plan.templates],
    ["coach_prompts", plan.prompts],
    ["coach_resources", plan.resources],
    ["coaching_principles", plan.principles],
  ];
  console.log("\nCurriculum load plan:");
  console.log(
    "  " + "table".padEnd(22) + "adds".padStart(6) + "updates".padStart(9) + "unchanged".padStart(11),
  );
  for (const [name, report] of rows) {
    console.log(
      "  " +
        name.padEnd(22) +
        String(report.adds).padStart(6) +
        String(report.updates).padStart(9) +
        String(report.unchanged).padStart(11),
    );
  }
  console.log("");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  guardEnv();

  const violations = validateRegistry(CURRICULUM_CONTENT);
  if (violations.length > 0) {
    console.error("REFUSED: curriculum content registry failed validation:");
    for (const v of violations) console.error(`  - ${v}`);
    process.exit(2);
  }

  const db = getDb();
  const org = await resolveOrg(db, opts.org);
  console.log(`Target organization: ${org.name} (${org.id})`);

  const existing = await readExistingRows(db, org.id);
  const plan = planUpserts(CURRICULUM_CONTENT, existing);
  printReport(plan);

  if (opts.dryRun) {
    console.log("Dry run — no changes written.");
    process.exit(0);
  }

  console.log("Applying…");
  const { domainMap, stageMap } = await applyDomainsAndStages(db);

  const sportSlugs = Array.from(
    new Set([
      ...CURRICULUM_CONTENT.skills.map((s) => s.sport),
      ...CURRICULUM_CONTENT.activities.map((a) => a.sport),
      ...CURRICULUM_CONTENT.sessionPlans.map((p) => p.sport),
    ]),
  );
  const sportMap = await resolveSports(db, org.id, sportSlugs);

  const skillIdMap = await applySkills(db, org.id, sportMap, domainMap, stageMap);
  await applyActivities(db, org.id, sportMap, stageMap, skillIdMap);
  await applyTemplates(db, org.id, sportMap, stageMap);
  await applyCoachGuidance(db, org.id, sportMap, stageMap);

  console.log("Load complete.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
