/**
 * E2E Test Seed Data
 *
 * Creates test users with known credentials and all necessary data
 * for comprehensive end-to-end testing.
 *
 * Run with: npx tsx src/lib/db/seeds/seed-e2e-tests.ts
 */

// Load environment variables from .env file if present
import "dotenv/config";
import crypto from "node:crypto";
import { pathToFileURL } from "node:url";

import { getDb, type Database } from "../index";
import { hashPassword } from "../../auth/password";
import { ensureVenueResources } from "../../scheduling/blocks";
import { hashFeedbackToken } from "../../feedback/tokens";
import { NPS_EXPIRY_DAYS, REFEREE_EXPIRY_DAYS } from "../../feedback/constants";
import {
  users,
  roles,
  userRoles,
  organizations,
  locations,
  sports,
  programs,
  seasons,
  ageGroups,
  teams,
  familyMembers,
  registrations,
  venues,
  events,
  feedbackRequests,
  type OrganizationFeatures,
  type OrganizationSettings,
} from "../schema";
import {
  mediaStaffProfiles,
  shootSessions,
  mediaAssets,
} from "../schema/media";
import {
  rosters,
  games,
  gameOfficials,
  gameIncidents,
  jobApplications,
  practiceTemplates,
  curriculumSequences,
  curriculumSequenceEntries,
  suspensions,
} from "../schema";
import { fieldRentalRateCard } from "../schema/field-rentals";
import { teamRegistrations } from "../schema/team-registrations";
import { dropInSessions, dropInBookings } from "../schema/drop-in";
import { hostProfiles, hostGameReports } from "../schema/hosts";
import { membershipTiers, memberships } from "../schema/memberships";
import { phoneOptIns } from "../schema/phone-verifications";
import {
  skillDomains,
  skills as curriculumSkills,
  developmentStages,
  playerAssessments,
} from "../schema";
import { DOMAINS, STAGES } from "../../curriculum/content/reference";
import type { DomainName } from "../../curriculum/content/types";
import { recomputePlayerSnapshots } from "../../curriculum/snapshots";
import { asc, eq, ne, and, or, inArray } from "drizzle-orm";

// Test user credentials - use these in E2E tests
export const TEST_USERS = {
  admin: {
    email: "admin@test.aspiresports.com",
    password: "TestAdmin123!",
    firstName: "Test",
    lastName: "Admin",
  },
  adminOrgB: {
    email: "admin-orgb@test.aspiresports.com",
    password: "TestAdmin123!",
    firstName: "OrgB",
    lastName: "Admin",
  },
  coach: {
    email: "coach@test.aspiresports.com",
    password: "TestCoach123!",
    firstName: "Test",
    lastName: "Coach",
  },
  parent: {
    email: "parent@test.aspiresports.com",
    password: "TestParent123!",
    firstName: "Test",
    lastName: "Parent",
  },
  newUser: {
    email: "newuser@test.aspiresports.com",
    password: "TestNew123!",
    firstName: "New",
    lastName: "User",
  },
  mediaStaff: {
    email: "media_staff@test.aspiresports.com",
    password: "TestMedia123!",
    firstName: "Test",
    lastName: "MediaStaff",
  },
  mediaEditor: {
    email: "media_editor@test.aspiresports.com",
    password: "TestMedia123!",
    firstName: "Test",
    lastName: "MediaEditor",
  },
  adultSelf: {
    email: "adult-self@test.aspiresports.com",
    password: "TestParent123!",
    firstName: "Adult",
    lastName: "Self",
    birthDate: "1985-06-15",
    // Phone is needed so the wizard's profile-completion form stays
    // hidden and the existing Myself-card path keeps working.
    phone: "5555550199",
  },
  // Dual-persona dashboard routing accounts (added for dashboard-persona E2E spec).
  // player     — has a self family_members row (selfUserId) → hasPlay=true, hasFamily=false
  // both       — has a dependent row (parentUserId) AND a self row (selfUserId) → hasFamily=true, hasPlay=true
  // fresh      — no family_members rows at all → redirects to /dashboard/start
  // familyonly — has dependent rows only, zero self rows, zero drop-ins, zero rentals → hasFamily=true, hasPlay=false
  //              Used by dashboard-persona "parent account (family-only)" tests instead of the
  //              shared parent@ account which other specs can pollute with bookings/rentals.
  player: {
    email: "player@test.aspiresports.com",
    password: "TestPlayer123!",
    firstName: "Test",
    lastName: "Player",
    birthDate: "1992-03-10",
    // Verified + opted-in phone so SMS-first dispatch paths (payment-hold
    // reminders, waiver-link resend) have a real fixture to exercise
    // against with MESSAGING_MOCK=1. This account is otherwise narrowly
    // used (dashboard-persona E2E only), so giving it a phone is low-risk —
    // no existing spec asserts it lacks one. See the "player account" block
    // in seedE2ETests() below for the phoneVerified + phone_opt_ins rows.
    phone: "6145550175",
  },
  both: {
    email: "both@test.aspiresports.com",
    password: "TestBoth123!",
    firstName: "Test",
    lastName: "Both",
    birthDate: "1990-07-20",
  },
  fresh: {
    email: "fresh@test.aspiresports.com",
    password: "TestFresh123!",
    firstName: "Test",
    lastName: "Fresh",
  },
  familyonly: {
    email: "familyonly@test.aspiresports.com",
    password: "TestFamily123!",
    firstName: "Family",
    lastName: "Only",
  },
  // Pickup host — authorized via an ACTIVE host_profiles row (not an RBAC
  // role, see src/lib/auth/host.ts), so no userRoles assignment is needed.
  // Used by tests/e2e/host-portal.spec.ts (claim → check-in → wrap-up).
  host: {
    email: "host@test.aspiresports.com",
    password: "TestHost123!",
    firstName: "Test",
    lastName: "Host",
  },
};

/**
 * Returns the adult open soccer season slug — used by self-registration tests
 * to look up the season ID at runtime.
 */
export const ADULT_OPEN_SEASON_SLUG = "e2e-adult-open-soccer-2026";

/**
 * Season that is `open` by status but past its registration window (started
 * two weeks ago, no explicit registration_closes). Exercises the "live
 * until" enforcement: catalog hiding, detail `registrationClosed`, and the
 * createRegistration / team-registration 400s.
 */
export const CLOSED_SEASON_SLUG = "e2e-closed-window-season";

/**
 * Fixed UUID for the main e2e organization ("aspire-sports").
 * Used by field-rental API tests to construct requests scoped to the right org.
 */
export const E2E_ORG_ID = "04836321-9e38-430e-b6a1-4bf4e6ca1b62";

/**
 * Fixed invite tokens for team_registrations tenant-isolation tests.
 * Org A token: belongs to aspire-sports. Org B token: belongs to orgb.
 * Default-host middleware resolves Org A → Org A token → 200; Org B token → 404.
 */
export const E2E_TEAM_REG_TOKEN_ORG_A = "e2e-team-token-orga-fixture-0001";
export const E2E_TEAM_REG_TOKEN_ORG_B = "e2e-team-token-orgb-fixture-0001";

/**
 * Fixed UUID for the rental-enabled venue seeded for field-rental API tests.
 * The venue belongs to the main e2e org (aspire-sports) and has:
 *   rentalEnabled: true, rentalHourlyRateCents: 8000,
 *   rentalOpenMinute: 480 (8am), rentalCloseMinute: 1320 (10pm), fieldCount: 3
 */
export const E2E_RENTAL_VENUE_ID = "4b237a78-868d-4e64-8487-f3dce687b603";

/**
 * Fixed UUIDs for the host portal fixtures (Task 15 —
 * tests/e2e/host-portal.spec.ts). Fixed IDs so the spec can act on these
 * sessions directly (claim by ID, navigate straight to /host/games/:id)
 * instead of hunting for them in the dashboard's claimable list — that list
 * is capped at 25 rows ordered by soonest start, and the shared dev/CI
 * database accumulates many short-lived pickup fixtures from unrelated API
 * test runs, so a 7-day-out fixture is not reliably on the visible page.
 * See E2E_RENTAL_VENUE_ID above for the same fixed-ID-plus-upsert pattern.
 */
export const E2E_HOST_CLAIMABLE_SESSION_ID = "e981c7f2-2921-4eb5-9eee-07f75827c5b1";
export const E2E_HOST_WRAPUP_SESSION_ID = "cc5be8dc-c19c-40ec-bf09-f4ff4dcca0de";

/**
 * Phase 2 training-walkthrough fixture accounts. Kept fully separate from
 * TEST_USERS so re-running `npm run training:videos` (which writes through
 * some of these) never touches the shared coach@/admin@ accounts other
 * specs sign in as. See seedTrainingFixtures() below for what each writes.
 */
export const TRAINING_USERS = {
  referee: {
    email: "training+referee@test.aspiresports.com",
    password: "TestReferee123!",
  },
  coach: {
    email: "training+coach@test.aspiresports.com",
    password: "TestCoach123!",
  },
  applicant: {
    email: "training+applicant@test.aspiresports.com",
  },
};

/**
 * Refuse to run if DATABASE_URL looks like it's pointed at production.
 * The e2e seed inserts fixture rows (tests, sample programs) that must
 * never end up in prod. CI sets ALLOW_E2E_SEED=yes against staging; any
 * other invocation must include "staging" in DATABASE_URL or set the
 * same flag explicitly.
 */
function assertNotProduction(): void {
  const url = process.env.DATABASE_URL ?? "";
  const explicitlyAllowed = process.env.ALLOW_E2E_SEED === "yes";
  const looksLikeStaging = /staging/i.test(url);
  if (!explicitlyAllowed && !looksLikeStaging) {
    console.error(
      "❌ REFUSED: DATABASE_URL does not contain 'staging' and ALLOW_E2E_SEED is not set.\n" +
        "   The e2e seed inserts fixture rows that must never reach production.\n" +
        "   To run against a non-staging-named DB intentionally, set\n" +
        "   ALLOW_E2E_SEED=yes (CI does this for the staging Railway proxy).",
    );
    process.exit(2);
  }
}

/**
 * Post-event feedback fixtures — Task 9 (NPS promoter path E2E spec).
 * Seeds a fixed-token, always-'sent' feedback_requests row so
 * tests/e2e/feedback-nps.spec.ts can hit /feedback/e2e-feedback-nps-open
 * deterministically. The org is flipped to enableNpsSurveys + given a
 * Google review URL so the promoter CTA renders. Reset to 'sent' on every
 * seed run since the spec consumes (answers) the token.
 */
async function seedFeedbackFixtures(db: Database, orgId: string) {
  // The org must have the flag + a review URL so the promoter CTA renders.
  // Merge into existing settings/features so we never clobber other keys.
  const [org] = await db
    .select({ settings: organizations.settings, features: organizations.features })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  const mergedFeatures: OrganizationFeatures = {
    ...(org?.features ?? {}),
    enableNpsSurveys: true,
    enableRefereeRatings: true,
  };
  const mergedSettings: OrganizationSettings = {
    ...(org?.settings ?? ({} as OrganizationSettings)),
    feedback: {
      ...(org?.settings?.feedback ?? {}),
      googleReviewUrl: {
        ...(org?.settings?.feedback?.googleReviewUrl ?? {}),
        aspire: "https://example.com/e2e-review",
      },
    },
  };

  await db
    .update(organizations)
    .set({ features: mergedFeatures, settings: mergedSettings })
    .where(eq(organizations.id, orgId));

  const [parent] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, TEST_USERS.parent.email))
    .limit(1);
  if (!parent) throw new Error("e2e seed: parent test user missing");

  const tokenHash = hashFeedbackToken("e2e-feedback-nps-open");

  // Reset to a fresh 'sent' request every seed run (the spec consumes it).
  // .delete cascades to nps_responses via FK, so the request is always fresh.
  await db.delete(feedbackRequests).where(eq(feedbackRequests.tokenHash, tokenHash));
  await db.insert(feedbackRequests).values({
    organizationId: orgId,
    brand: "aspire",
    kind: "nps_drop_in",
    targetId: crypto.randomUUID(),
    recipientUserId: parent.id,
    tokenHash,
    status: "sent",
    sentAt: new Date(),
    expiresAt: new Date(Date.now() + NPS_EXPIRY_DAYS * 24 * 60 * 60 * 1000),
    metadata: { eventLabel: "E2E Pickup Soccer" },
  });
  console.log(`   ✓ Feedback fixture: NPS open token seeded for ${TEST_USERS.parent.email}`);

  // --- Referee rating fixture ---

  const [coach] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, TEST_USERS.coach.email))
    .limit(1);
  if (!coach) throw new Error("e2e seed: coach test user missing");

  // Reuse the org's oldest season (multi-tenant hazard: findFirst/limit(1)
  // needs an explicit orderBy on shared CI databases — see CLAUDE.md).
  const [season] = await db
    .select({ id: seasons.id })
    .from(seasons)
    .innerJoin(programs, eq(seasons.programId, programs.id))
    .innerJoin(locations, eq(programs.locationId, locations.id))
    .where(eq(locations.organizationId, orgId))
    .orderBy(asc(seasons.createdAt))
    .limit(1);
  if (!season) throw new Error("e2e seed: no season found to attach referee fixture game to");

  // Find-or-create the game by a deterministic marker in `notes` so re-seeds
  // reuse the same row instead of accumulating one per run (games has no
  // natural unique key to upsert on). Null teams are fine — the referee
  // rating form never reads rosters.
  const REFEREE_GAME_MARKER = "e2e-feedback-referee-game";
  let [game] = await db
    .select({ id: games.id })
    .from(games)
    .where(eq(games.notes, REFEREE_GAME_MARKER))
    .limit(1);
  if (!game) {
    [game] = await db
      .insert(games)
      .values({
        seasonId: season.id,
        scheduledAt: new Date(Date.now() - 24 * 60 * 60 * 1000), // yesterday
        status: "completed",
        notes: REFEREE_GAME_MARKER,
      })
      .returning({ id: games.id });
  }

  // gameOfficials has a real unique index on (gameId, userId) — upsert on that.
  let [official] = await db
    .select({ id: gameOfficials.id })
    .from(gameOfficials)
    .where(and(eq(gameOfficials.gameId, game.id), eq(gameOfficials.userId, coach.id)))
    .limit(1);
  if (!official) {
    [official] = await db
      .insert(gameOfficials)
      .values({
        gameId: game.id,
        userId: coach.id,
        position: "referee",
      })
      .returning({ id: gameOfficials.id });
  }

  const refereeTokenHash = hashFeedbackToken("e2e-feedback-referee-open");

  // Same reset pattern as the NPS fixture: delete-by-tokenHash, insert fresh.
  await db.delete(feedbackRequests).where(eq(feedbackRequests.tokenHash, refereeTokenHash));
  await db.insert(feedbackRequests).values({
    organizationId: orgId,
    brand: "aspire",
    kind: "referee_rating",
    targetId: game.id,
    recipientUserId: parent.id,
    gameOfficialId: official.id,
    tokenHash: refereeTokenHash,
    status: "sent",
    sentAt: new Date(),
    expiresAt: new Date(Date.now() + REFEREE_EXPIRY_DAYS * 24 * 60 * 60 * 1000),
    metadata: { eventLabel: "E2E League Game", gameType: "league", refereeName: "Coach T." },
  });
  console.log(`   ✓ Feedback fixture: referee rating open token seeded for ${TEST_USERS.parent.email}`);
}

/**
 * Curriculum development-radar fixture — Task 11 (parent radar E2E spec).
 *
 * Seeds the minimum curriculum content needed for the radar chart to render
 * (>= 3 populated axes): the 4 skill domains, the "fundamentals" development
 * stage, and one soccer skill per domain. Then assesses the seeded child
 * player (Tommy) on all four skills at levels 4/3/2/3
 * (technical/tactical/physical/psychological) in the seeded e2e season, and
 * recomputes the assessment_snapshots the radar reads from.
 *
 * Idempotent, mirroring scripts/curriculum-load.ts:
 *   - domains/stage are shared reference data — onConflictDoNothing so a
 *     re-seed never clobbers content another path may have written.
 *   - the skill rows upsert on the Task 1 unique index
 *     (skills.sport_id, skills.slug) via onConflictDoUpdate.
 *   - assessments have no natural-key unique index, so we select-then-heal:
 *     insert if missing, otherwise update the level in place so re-seeding
 *     never duplicates rows or drifts off the intended fixture levels.
 */
async function seedCurriculumRadarFixture(db: Database, orgId: string) {
  // Domains + development stage are global reference data (no orgId
  // column) — ensure existence without overwriting other content.
  for (const d of DOMAINS) {
    await db
      .insert(skillDomains)
      .values({
        name: d.name,
        displayName: d.displayName,
        description: d.description,
        color: d.color,
        icon: d.icon,
        assessmentFrequency: d.assessmentFrequency,
        weightInOverall: d.weightInOverall,
        sortOrder: d.sortOrder,
      })
      .onConflictDoNothing();
  }

  const fundamentalsStage = STAGES.find((s) => s.slug === "fundamentals");
  if (!fundamentalsStage) {
    throw new Error(
      "e2e seed: 'fundamentals' stage missing from curriculum reference content",
    );
  }
  await db
    .insert(developmentStages)
    .values({
      slug: fundamentalsStage.slug,
      name: fundamentalsStage.name,
      ageMin: fundamentalsStage.ageMin,
      ageMax: fundamentalsStage.ageMax,
      description: fundamentalsStage.description,
      philosophy: fundamentalsStage.philosophy,
      practiceToGameRatio: fundamentalsStage.practiceToGameRatio,
      maxHoursPerWeek: fundamentalsStage.maxHoursPerWeek,
      keyPrinciples: fundamentalsStage.keyPrinciples,
      coachRole: fundamentalsStage.coachRole,
      sortOrder: fundamentalsStage.sortOrder,
    })
    .onConflictDoNothing();

  const domainRows = await db.select().from(skillDomains);
  const domainIdByName = new Map(domainRows.map((d) => [d.name, d.id]));

  const [stage] = await db
    .select()
    .from(developmentStages)
    .where(eq(developmentStages.slug, "fundamentals"))
    .limit(1);
  if (!stage) {
    throw new Error("e2e seed: failed to load 'fundamentals' stage after upsert");
  }

  const [sport] = await db
    .select()
    .from(sports)
    .where(and(eq(sports.organizationId, orgId), eq(sports.slug, "soccer")))
    .limit(1);
  if (!sport) {
    throw new Error("e2e seed: soccer sport missing — curriculum fixture must run after sport setup");
  }

  const [parentUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, TEST_USERS.parent.email))
    .limit(1);
  if (!parentUser) throw new Error("e2e seed: parent test user missing");

  const [tommy] = await db
    .select({ id: familyMembers.id })
    .from(familyMembers)
    .where(
      and(
        eq(familyMembers.parentUserId, parentUser.id),
        eq(familyMembers.firstName, "Tommy"),
      ),
    )
    .orderBy(asc(familyMembers.createdAt))
    .limit(1);
  if (!tommy) throw new Error("e2e seed: Tommy family member missing");

  const [coach] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, TEST_USERS.coach.email))
    .limit(1);
  if (!coach) throw new Error("e2e seed: coach test user missing");

  const [season] = await db
    .select({ id: seasons.id })
    .from(seasons)
    .where(eq(seasons.slug, "e2e-test-spring-2026"))
    .orderBy(asc(seasons.createdAt))
    .limit(1);
  if (!season) throw new Error("e2e seed: e2e-test-spring-2026 season missing");

  // One skill per domain, assessed at these exact levels — all four axes
  // populate so the radar's >= 3-axis minimum is comfortably satisfied.
  const SKILL_LEVELS: { domain: DomainName; level: number }[] = [
    { domain: "technical", level: 4 },
    { domain: "tactical", level: 3 },
    { domain: "physical", level: 2 },
    { domain: "psychological", level: 3 },
  ];

  for (const { domain, level } of SKILL_LEVELS) {
    const domainId = domainIdByName.get(domain);
    if (!domainId) throw new Error(`e2e seed: domain "${domain}" missing after upsert`);

    const slug = `e2e-${domain}-skill`;
    const skillSet = {
      organizationId: orgId,
      domainId,
      stageId: stage.id,
      name: `E2E ${domain[0].toUpperCase()}${domain.slice(1)} Skill`,
      description: `Fixture skill for the ${domain} domain (development-radar E2E spec).`,
      isCore: true,
      updatedAt: new Date(),
    };
    const [skillRow] = await db
      .insert(curriculumSkills)
      .values({ sportId: sport.id, slug, ...skillSet })
      .onConflictDoUpdate({
        target: [curriculumSkills.sportId, curriculumSkills.slug],
        set: skillSet,
      })
      .returning({ id: curriculumSkills.id });

    // No natural-key unique index on player_assessments (Task 1 didn't add
    // one) — select-then-heal so re-seeding never duplicates rows.
    const [existingAssessment] = await db
      .select({ id: playerAssessments.id, level: playerAssessments.level })
      .from(playerAssessments)
      .where(
        and(
          eq(playerAssessments.familyMemberId, tommy.id),
          eq(playerAssessments.skillId, skillRow.id),
          eq(playerAssessments.seasonId, season.id),
        ),
      )
      .orderBy(asc(playerAssessments.createdAt))
      .limit(1);

    if (!existingAssessment) {
      await db.insert(playerAssessments).values({
        familyMemberId: tommy.id,
        skillId: skillRow.id,
        seasonId: season.id,
        coachUserId: coach.id,
        level,
        observationContext: "practice",
        assessedAt: new Date(),
      });
    } else if (existingAssessment.level !== level) {
      await db
        .update(playerAssessments)
        .set({ level, updatedAt: new Date() })
        .where(eq(playerAssessments.id, existingAssessment.id));
    }
  }

  const { domainsWritten } = await recomputePlayerSnapshots(db, tommy.id, season.id);
  console.log(
    `   ✓ Curriculum radar fixture: ${SKILL_LEVELS.length} skills assessed for Tommy, ` +
      `${domainsWritten} domain snapshot(s) recomputed`,
  );
}

/**
 * Training walkthrough fixtures (Phase 2 — training video pipeline).
 *
 * The referee portal (`/referee/**`) has had no seeded fixture before this:
 * `role_name` has included "referee" as a valid enum value since it was
 * written, but no `roles` row for it was ever inserted, so `/referee/**`
 * (gated on that role by src/middleware.ts) has been unreachable by any
 * seeded account. This inserts it for the first time, plus a dedicated
 * referee test user and a training match reset to "not yet reported" on
 * every seed run so the referee-gameday walkthrough always sees a fresh
 * score-entry screen (score-report submission is idempotent, but the
 * "before" state — an unreported match — is not, since submitting flips it
 * to completed).
 */
async function seedTrainingFixtures(
  db: Database,
  orgId: string,
  seasonId: string,
  teamId: string,
) {
  // --- Referee role + dedicated referee test user -------------------------
  await db
    .insert(roles)
    .values({
      name: "referee",
      description: "Officiates assigned matches; enters final scores and incidents",
      permissions: ["games:read_assigned", "games:write_score"],
    })
    .onConflictDoNothing();

  const [refereeRole] = await db
    .select()
    .from(roles)
    .where(eq(roles.name, "referee"))
    .limit(1);
  if (!refereeRole) throw new Error("e2e seed: failed to create/find the referee role");

  const refereePasswordHash = await hashPassword(TRAINING_USERS.referee.password);
  let [trainingReferee] = await db
    .select()
    .from(users)
    .where(eq(users.email, TRAINING_USERS.referee.email))
    .limit(1);
  if (!trainingReferee) {
    [trainingReferee] = await db
      .insert(users)
      .values({
        email: TRAINING_USERS.referee.email,
        passwordHash: refereePasswordHash,
        firstName: "Training",
        lastName: "Referee",
        emailVerified: true,
      })
      .returning();
  } else {
    await db
      .update(users)
      .set({ passwordHash: refereePasswordHash, emailVerified: true })
      .where(eq(users.id, trainingReferee.id));
  }
  await db.delete(userRoles).where(eq(userRoles.userId, trainingReferee.id));
  await db.insert(userRoles).values({
    userId: trainingReferee.id,
    roleId: refereeRole.id,
    scopeType: "organization",
    scopeId: orgId,
  });
  console.log(`   ✓ Training referee: ${TRAINING_USERS.referee.email}`);

  // Dedicated training match — find-or-create by a marker in `notes` (games
  // has no natural unique key), reset to "scheduled"/unreported every run.
  const TRAINING_GAME_MARKER = "training-referee-gameday-fixture";
  let [trainingGame] = await db
    .select({ id: games.id })
    .from(games)
    .where(eq(games.notes, TRAINING_GAME_MARKER))
    .limit(1);
  const scheduledAt = new Date(Date.now() - 60 * 60 * 1000); // 1h ago — "to report"
  if (!trainingGame) {
    [trainingGame] = await db
      .insert(games)
      .values({
        seasonId,
        homeTeamId: teamId,
        scheduledAt,
        status: "scheduled",
        notes: TRAINING_GAME_MARKER,
      })
      .returning({ id: games.id });
  } else {
    await db
      .update(games)
      .set({
        status: "scheduled",
        scheduledAt,
        homeScore: null,
        awayScore: null,
        refereeNotes: null,
      })
      .where(eq(games.id, trainingGame.id));
    // suspensions.gameIncidentId is FK RESTRICT — a walkthrough that logged
    // an ejection-with-suspension against this training fixture (e.g. via
    // the /referee UI) would otherwise make this delete fail on every
    // subsequent seed run. Clear dependent suspensions first; the training
    // fixture is meant to reset to a clean slate each run, ejections
    // included.
    const staleIncidents = await db
      .select({ id: gameIncidents.id })
      .from(gameIncidents)
      .where(eq(gameIncidents.gameId, trainingGame.id));
    if (staleIncidents.length > 0) {
      await db.delete(suspensions).where(
        inArray(
          suspensions.gameIncidentId,
          staleIncidents.map((i) => i.id),
        ),
      );
    }
    await db.delete(gameIncidents).where(eq(gameIncidents.gameId, trainingGame.id));
  }

  const [existingOfficial] = await db
    .select({ id: gameOfficials.id })
    .from(gameOfficials)
    .where(
      and(
        eq(gameOfficials.gameId, trainingGame.id),
        eq(gameOfficials.userId, trainingReferee.id),
      ),
    )
    .limit(1);
  if (!existingOfficial) {
    await db.insert(gameOfficials).values({
      gameId: trainingGame.id,
      userId: trainingReferee.id,
      position: "referee",
    });
  }
  console.log(`   ✓ Training referee-gameday fixture match reset (game ${trainingGame.id})`);

  // --- Admin hire/compliance fixtures --------------------------------------
  // Dedicated applicant, reset to un-hired on every seed run — the hire
  // endpoint 409s once hiredUserId is set, so "Mark hired" must always find
  // a fresh, un-hired row to click.
  let [trainingApplication] = await db
    .select({ id: jobApplications.id })
    .from(jobApplications)
    .where(eq(jobApplications.email, TRAINING_USERS.applicant.email))
    .limit(1);
  if (!trainingApplication) {
    [trainingApplication] = await db
      .insert(jobApplications)
      .values({
        organizationId: orgId,
        role: "coach",
        firstName: "Training",
        lastName: "Applicant",
        email: TRAINING_USERS.applicant.email,
        experience: "3 seasons coaching U10 rec soccer.",
        availability: ["weeknights", "weekends"],
        source: "training fixture",
        status: "new",
      })
      .returning({ id: jobApplications.id });
  } else {
    await db
      .update(jobApplications)
      .set({ status: "new", hiredUserId: null })
      .where(eq(jobApplications.id, trainingApplication.id));
  }
  console.log(`   ✓ Training applicant reset to un-hired: ${TRAINING_USERS.applicant.email}`);

  // Dedicated coach for the credentials-grid edit demo — kept separate from
  // coach@test.aspiresports.com so the walkthrough never writes credential
  // rows against the account other specs sign in as.
  const trainingCoachPasswordHash = await hashPassword(TRAINING_USERS.coach.password);
  let [trainingCoach] = await db
    .select()
    .from(users)
    .where(eq(users.email, TRAINING_USERS.coach.email))
    .limit(1);
  if (!trainingCoach) {
    [trainingCoach] = await db
      .insert(users)
      .values({
        email: TRAINING_USERS.coach.email,
        passwordHash: trainingCoachPasswordHash,
        firstName: "Training",
        lastName: "Coach",
        emailVerified: true,
      })
      .returning();
  } else {
    await db
      .update(users)
      .set({ passwordHash: trainingCoachPasswordHash, emailVerified: true })
      .where(eq(users.id, trainingCoach.id));
  }
  const [coachRoleRow] = await db
    .select()
    .from(roles)
    .where(eq(roles.name, "coach"))
    .limit(1);
  if (!coachRoleRow) throw new Error("e2e seed: coach role missing");
  await db.delete(userRoles).where(eq(userRoles.userId, trainingCoach.id));
  await db.insert(userRoles).values({
    userId: trainingCoach.id,
    roleId: coachRoleRow.id,
    scopeType: "organization",
    scopeId: orgId,
  });
  console.log(`   ✓ Training coach for credentials demo: ${TRAINING_USERS.coach.email}`);

  // --- Curriculum sequencing fixture ---------------------------------------
  // A training practice template + a one-entry sequence, so the
  // admin-sequencing walkthrough has a real sequence to open and a real
  // (season, coached-team) pair to attach it to. Attaching is idempotent by
  // the endpoint's own design (skips existing draft session_plans — see
  // src/pages/api/admin/curriculum/sequences/[id]/attach.ts), so no reset is
  // needed between runs — only find-or-upsert.
  const [soccerSport] = await db
    .select({ id: sports.id })
    .from(sports)
    .where(and(eq(sports.organizationId, orgId), eq(sports.slug, "soccer")))
    .limit(1);
  if (!soccerSport) throw new Error("e2e seed: soccer sport missing for training sequence fixture");

  const [fundamentalsStage] = await db
    .select({ id: developmentStages.id })
    .from(developmentStages)
    .where(eq(developmentStages.slug, "fundamentals"))
    .limit(1);
  if (!fundamentalsStage) {
    throw new Error("e2e seed: 'fundamentals' stage missing for training sequence fixture");
  }

  const templateSet = {
    organizationId: orgId,
    sportId: soccerSport.id,
    stageId: fundamentalsStage.id,
    name: "Training Fixture Practice",
    description:
      "Seeded for the admin-sequencing training walkthrough — not a real curriculum template.",
    totalDurationMinutes: 60,
    structure: [
      { name: "Warm-up", type: "warmup", durationMinutes: 10 },
      { name: "Core skill work", type: "skill", durationMinutes: 40 },
      { name: "Cool-down", type: "cooldown", durationMinutes: 10 },
    ],
    updatedAt: new Date(),
  };
  const [trainingTemplate] = await db
    .insert(practiceTemplates)
    .values(templateSet)
    .onConflictDoUpdate({
      target: [practiceTemplates.sportId, practiceTemplates.name],
      set: templateSet,
    })
    .returning({ id: practiceTemplates.id });

  const sequenceSet = {
    organizationId: orgId,
    sportId: soccerSport.id,
    developmentStageId: fundamentalsStage.id,
    programType: "league" as const,
    name: "Training Fixture Sequence",
    description:
      "Seeded for the admin-sequencing training walkthrough — not a real curriculum sequence.",
    updatedAt: new Date(),
  };
  const [trainingSequence] = await db
    .insert(curriculumSequences)
    .values(sequenceSet)
    .onConflictDoUpdate({
      target: [curriculumSequences.sportId, curriculumSequences.name],
      set: sequenceSet,
    })
    .returning({ id: curriculumSequences.id });

  const [existingEntry] = await db
    .select({ id: curriculumSequenceEntries.id })
    .from(curriculumSequenceEntries)
    .where(
      and(
        eq(curriculumSequenceEntries.sequenceId, trainingSequence.id),
        eq(curriculumSequenceEntries.position, 1),
      ),
    )
    .limit(1);
  if (!existingEntry) {
    await db.insert(curriculumSequenceEntries).values({
      sequenceId: trainingSequence.id,
      position: 1,
      templateId: trainingTemplate.id,
      objectives: ["Demonstrate the sequencing walkthrough"],
    });
  }
  console.log(`   ✓ Training curriculum sequence: "${sequenceSet.name}" (1 entry)`);
}

/**
 * Referee close-out fixture — Task 5 (tests/e2e/referee-closeout.spec.ts).
 *
 * The one-guided close-out screen at /referee/matches/[gameId] needs a game
 * that the referee test account is assigned to but has NOT yet closed out.
 * seedTrainingFixtures() already assigns the training referee to a match, but
 * that fixture is shared with the referee-gameday walkthrough and gets reset
 * to a home-team-set "scheduled" state each run; this gives the close-out spec
 * its own dedicated TBD-vs-TBD game so the two never fight over one row.
 *
 * Find-or-create by a deterministic marker in `notes` (games has no natural
 * unique key), and DON'T reset status on re-seed: once a run closes it out the
 * game stays 'completed', and the spec is written to tolerate that (edit mode
 * pre-answers None). Null teams are fine — close-out never reads rosters, and a
 * TBD team simply blocks recording a suspension (irrelevant here since the spec
 * marks every section None). Must run AFTER seedTrainingFixtures so the referee
 * user exists.
 */
async function seedRefereeCloseoutFixture(db: Database, orgId: string) {
  const [referee] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, TRAINING_USERS.referee.email))
    .limit(1);
  if (!referee) throw new Error("e2e seed: training referee missing for close-out fixture");

  // Reuse the org's oldest season (multi-tenant hazard: findFirst/limit(1)
  // needs an explicit orderBy on shared CI databases — see CLAUDE.md).
  const [season] = await db
    .select({ id: seasons.id })
    .from(seasons)
    .innerJoin(programs, eq(seasons.programId, programs.id))
    .innerJoin(locations, eq(programs.locationId, locations.id))
    .where(eq(locations.organizationId, orgId))
    .orderBy(asc(seasons.createdAt))
    .limit(1);
  if (!season) throw new Error("e2e seed: no season found to attach close-out fixture game to");

  const CLOSEOUT_GAME_MARKER = "e2e-closeout-referee-game";
  let [game] = await db
    .select({ id: games.id })
    .from(games)
    .where(eq(games.notes, CLOSEOUT_GAME_MARKER))
    .limit(1);
  if (!game) {
    [game] = await db
      .insert(games)
      .values({
        seasonId: season.id,
        scheduledAt: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2h ago — "to report"
        status: "scheduled",
        notes: CLOSEOUT_GAME_MARKER,
      })
      .returning({ id: games.id });
  }

  // gameOfficials has a real unique index on (gameId, userId) — upsert on that.
  const [existingOfficial] = await db
    .select({ id: gameOfficials.id })
    .from(gameOfficials)
    .where(and(eq(gameOfficials.gameId, game.id), eq(gameOfficials.userId, referee.id)))
    .limit(1);
  if (!existingOfficial) {
    await db.insert(gameOfficials).values({
      gameId: game.id,
      userId: referee.id,
      position: "referee",
    });
  }
  console.log(`   ✓ Referee close-out fixture match assigned (game ${game.id})`);
}

/**
 * Host portal fixtures (Task 15 — tests/e2e/host-portal.spec.ts).
 *
 * - host_profiles: ACTIVE row for host@test.aspiresports.com in the main
 *   org — idempotent on (userId, organizationId).
 * - "e2e-host-fixture": a future (7 days out), unhosted pickup session with
 *   one confirmed booking from the parent test user, so /host lists it as
 *   claimable and its roster has someone to check in once claimed. Only
 *   startsAt/endsAt are refreshed on re-seed — hostUserId is left alone so
 *   a prior test run's claim doesn't get silently undone (the spec itself
 *   tolerates either state).
 * - "e2e-host-wrapup-fixture": an already-started (30 min ago) session
 *   hosted by the host user. Fully reset on every seed run — startsAt/
 *   endsAt re-pointed and any prior host_game_reports row deleted — so the
 *   wrap-up spec can submit a fresh report every run.
 */
async function seedHostPortalFixture(
  db: Database,
  orgId: string,
  venueId: string,
  hostUserId: string,
  parentUserId: string,
) {
  // Active host profile — idempotent on (userId, organizationId).
  const [existingProfile] = await db
    .select({ id: hostProfiles.id, status: hostProfiles.status })
    .from(hostProfiles)
    .where(
      and(
        eq(hostProfiles.userId, hostUserId),
        eq(hostProfiles.organizationId, orgId),
      ),
    )
    .limit(1);
  if (!existingProfile) {
    await db.insert(hostProfiles).values({
      userId: hostUserId,
      organizationId: orgId,
      status: "active",
    });
  } else if (existingProfile.status !== "active") {
    await db
      .update(hostProfiles)
      .set({ status: "active", updatedAt: new Date() })
      .where(eq(hostProfiles.id, existingProfile.id));
  }
  console.log(`   ✓ Host profile ACTIVE for ${TEST_USERS.host.email} in org ${orgId}`);

  // Future unhosted pickup session — fixed ID (see E2E_HOST_CLAIMABLE_SESSION_ID)
  // so the spec can claim/navigate directly rather than searching for it in
  // the (capped, noisy) claimable list. startsAt/endsAt refreshed to stay 7
  // days out on re-seed; hostUserId is deliberately NOT in the update set —
  // if a prior test run already claimed it, re-seeding must not un-claim it.
  const claimableStart = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const claimableEnd = new Date(claimableStart.getTime() + 90 * 60 * 1000);
  const [claimableSession] = await db
    .insert(dropInSessions)
    .values({
      id: E2E_HOST_CLAIMABLE_SESSION_ID,
      organizationId: orgId,
      venueId,
      kind: "pickup",
      sportOrClassLabel: "soccer",
      formatLabel: "e2e-host-fixture",
      startsAt: claimableStart,
      endsAt: claimableEnd,
      capacity: 10,
    })
    .onConflictDoUpdate({
      target: dropInSessions.id,
      set: { startsAt: claimableStart, endsAt: claimableEnd },
    })
    .returning();
  console.log(
    `   ✓ Host claimable fixture session (${claimableSession.id}, hostUserId=${claimableSession.hostUserId ?? "none"})`,
  );

  // Confirmed player booking from the parent test user, so the roster has
  // someone to check in once the host claims the game.
  const [existingParentBooking] = await db
    .select({ id: dropInBookings.id })
    .from(dropInBookings)
    .where(
      and(
        eq(dropInBookings.sessionId, claimableSession.id),
        eq(dropInBookings.userId, parentUserId),
        inArray(dropInBookings.status, [
          "confirmed",
          "waitlisted",
          "pending_claim",
          "pending_payment",
        ]),
      ),
    )
    .limit(1);
  if (!existingParentBooking) {
    await db.insert(dropInBookings).values({
      sessionId: claimableSession.id,
      userId: parentUserId,
      status: "confirmed",
      source: "online_booking",
      paymentMethod: "card_online",
      amountPaidCents: 1000,
    });
  }
  console.log(`   ✓ Parent booking on host claimable fixture ensured`);

  // Already-started hosted session for the wrap-up path — fixed ID (see
  // E2E_HOST_WRAPUP_SESSION_ID), fully reset every run.
  const wrapupStart = new Date(Date.now() - 30 * 60 * 1000);
  const wrapupEnd = new Date(Date.now() + 60 * 60 * 1000);
  const [wrapupSession] = await db
    .insert(dropInSessions)
    .values({
      id: E2E_HOST_WRAPUP_SESSION_ID,
      organizationId: orgId,
      venueId,
      kind: "pickup",
      sportOrClassLabel: "soccer",
      formatLabel: "e2e-host-wrapup-fixture",
      startsAt: wrapupStart,
      endsAt: wrapupEnd,
      capacity: 10,
      hostUserId,
    })
    .onConflictDoUpdate({
      target: dropInSessions.id,
      set: {
        startsAt: wrapupStart,
        endsAt: wrapupEnd,
        hostUserId,
        status: "scheduled",
      },
    })
    .returning();

  // Reset: delete any prior wrap-up report so the spec can submit fresh.
  await db.delete(hostGameReports).where(eq(hostGameReports.sessionId, wrapupSession.id));

  // Host's own comp booking — idempotent on (sessionId, userId).
  const [existingCompBooking] = await db
    .select({ id: dropInBookings.id })
    .from(dropInBookings)
    .where(
      and(
        eq(dropInBookings.sessionId, wrapupSession.id),
        eq(dropInBookings.userId, hostUserId),
        inArray(dropInBookings.status, [
          "confirmed",
          "waitlisted",
          "pending_claim",
          "pending_payment",
        ]),
      ),
    )
    .limit(1);
  if (!existingCompBooking) {
    await db.insert(dropInBookings).values({
      sessionId: wrapupSession.id,
      userId: hostUserId,
      status: "confirmed",
      source: "online_booking",
      paymentMethod: "host_comp",
      amountPaidCents: 0,
    });
  }
  console.log(
    `   ✓ Host wrap-up fixture session reset (${wrapupSession.id}, starts 30m ago, report cleared)`,
  );
}

async function seedE2ETests() {
  assertNotProduction();
  console.log("🧪 Seeding E2E test data...\n");
  const db = getDb();

  // Get or create organization. The domain-resolver's default-org logic
  // (lib/organization/domain-resolver.ts > resolveDefaultOrganization) picks
  // the oldest active headquarters org, else the oldest active org. To keep
  // the seed and runtime in lockstep we upsert aspire-sports as an active
  // headquarters so it is unambiguously what middleware will return on
  // localhost/CI. Pre-existing rows from earlier seed versions may have
  // status='pending' or organizationType='franchise' — we fix those here.
  console.log("1. Setting up organization...");
  let [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.slug, "aspire-sports"))
    .limit(1);

  if (!org) {
    [org] = await db
      .insert(organizations)
      .values({
        id: E2E_ORG_ID,
        name: "Aspire Sports",
        slug: "aspire-sports",
        status: "active",
        organizationType: "headquarters",
      })
      .returning();
  } else if (
    org.status !== "active" ||
    org.organizationType !== "headquarters"
  ) {
    [org] = await db
      .update(organizations)
      .set({ status: "active", organizationType: "headquarters" })
      .where(eq(organizations.id, org.id))
      .returning();
  }
  console.log(`   ✓ Organization: ${org.name} (${org.id})`);

  if (org.id !== E2E_ORG_ID) {
    throw new Error(
      `E2E seed invariant violated: org "aspire-sports" exists with id ${org.id} ` +
      `but E2E_ORG_ID constant is ${E2E_ORG_ID}. ` +
      `Update E2E_ORG_ID to match, or delete the org row and re-seed.`,
    );
  }

  // Demote any OTHER headquarters/active orgs so aspire-sports is the
  // unambiguous default org on shared CI databases. Without this, prior
  // test runs that created additional HQ/active orgs (e.g., via the admin
  // organizations API) can win the resolveDefaultOrganization tiebreaker
  // and cause admin's API calls to miss seeded fixtures.
  const candidates = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(
      or(
        eq(organizations.organizationType, "headquarters"),
        eq(organizations.status, "active")
      )
    );
  let demotedCount = 0;
  for (const row of candidates) {
    if (row.id === org.id) continue;
    await db
      .update(organizations)
      .set({ organizationType: "franchise", status: "inactive" })
      .where(eq(organizations.id, row.id));
    demotedCount++;
  }
  if (demotedCount > 0) {
    console.log(`   ✓ Demoted ${demotedCount} other HQ/active org(s) to franchise/inactive`);
  }

  // Get or create location
  let [location] = await db
    .select()
    .from(locations)
    .where(eq(locations.organizationId, org.id))
    .limit(1);

  if (!location) {
    [location] = await db
      .insert(locations)
      .values({
        organizationId: org.id,
        name: "Powell",
        slug: "powell",
        city: "Powell",
        state: "OH",
        country: "US",
        timezone: "America/New_York",
      })
      .returning();
  }
  console.log(`   ✓ Location: ${location.name} (${location.id})`);

  // Create roles if they don't exist (needed for fresh CI databases)
  console.log("\n   Creating roles if needed...");
  await db
    .insert(roles)
    .values([
      {
        name: "super_admin",
        description: "Full system access, manage all organizations",
        permissions: ["*"],
      },
      {
        name: "location_admin",
        description: "Manage specific location(s), programs, and registrations",
        permissions: [
          "programs:read",
          "programs:write",
          "seasons:read",
          "seasons:write",
          "registrations:read",
          "registrations:write",
          "teams:read",
          "teams:write",
          "users:read",
        ],
      },
      {
        name: "coach",
        description: "View assigned teams, rosters, enter scores",
        permissions: [
          "teams:read",
          "rosters:read",
          "games:read",
          "games:write_score",
        ],
      },
      {
        name: "parent",
        description: "Register children, view schedules, make payments",
        permissions: [
          "programs:read",
          "seasons:read",
          "registrations:read",
          "registrations:write_own",
          "family:read",
          "family:write",
          "payments:read_own",
        ],
      },
      {
        name: "player",
        description: "View own schedule and team information",
        permissions: ["schedules:read_own", "teams:read_own"],
      },
      {
        name: "media_staff",
        description:
          "Photographer/videographer assigned to shoots; uploads assets to their sessions",
        permissions: [
          "media_jobs:read_own",
          "media_jobs:check_in",
          "media_jobs:upload",
          "rosters:read_assigned",
        ],
      },
      {
        name: "media_editor",
        description:
          "Offshore or in-house tagger; sees only assets in sessions scoped to their service locations",
        permissions: ["media_assets:read_scoped", "media_tags:write_scoped"],
      },
    ])
    .onConflictDoNothing();

  // Get roles
  const allRoles = await db.select().from(roles);
  const roleMap = Object.fromEntries(allRoles.map((r) => [r.name, r]));
  console.log(`   ✓ Roles loaded: ${allRoles.length}`);

  // Create test users
  console.log("\n2. Creating test users...");

  // Admin user - always update password to ensure it's correct
  const adminPasswordHash = await hashPassword(TEST_USERS.admin.password);
  let [adminUser] = await db
    .select()
    .from(users)
    .where(eq(users.email, TEST_USERS.admin.email))
    .limit(1);

  if (!adminUser) {
    [adminUser] = await db
      .insert(users)
      .values({
        email: TEST_USERS.admin.email,
        passwordHash: adminPasswordHash,
        firstName: TEST_USERS.admin.firstName,
        lastName: TEST_USERS.admin.lastName,
        emailVerified: true,
      })
      .returning();
  } else {
    // Update existing user's password and ensure email is verified
    await db.update(users)
      .set({ passwordHash: adminPasswordHash, emailVerified: true })
      .where(eq(users.id, adminUser.id));
  }
  // Always ensure super_admin role is assigned (delete other roles first)
  await db.delete(userRoles).where(eq(userRoles.userId, adminUser.id));
  await db.insert(userRoles).values({
    userId: adminUser.id,
    roleId: roleMap.super_admin.id,
    scopeType: "global",
  });
  console.log(`   ✓ Admin: ${adminUser.email}`);

  // Coach user - always update password to ensure it's correct
  const coachPasswordHash = await hashPassword(TEST_USERS.coach.password);
  let [coachUser] = await db
    .select()
    .from(users)
    .where(eq(users.email, TEST_USERS.coach.email))
    .limit(1);

  if (!coachUser) {
    [coachUser] = await db
      .insert(users)
      .values({
        email: TEST_USERS.coach.email,
        passwordHash: coachPasswordHash,
        firstName: TEST_USERS.coach.firstName,
        lastName: TEST_USERS.coach.lastName,
        emailVerified: true,
      })
      .returning();
  } else {
    // Update existing user's password and ensure email is verified
    await db.update(users)
      .set({ passwordHash: coachPasswordHash, emailVerified: true })
      .where(eq(users.id, coachUser.id));
  }
  // Always ensure coach role is assigned (delete other roles first)
  await db.delete(userRoles).where(eq(userRoles.userId, coachUser.id));
  await db.insert(userRoles).values({
    userId: coachUser.id,
    roleId: roleMap.coach.id,
    scopeType: "organization",
    scopeId: org.id,
  });
  console.log(`   ✓ Coach: ${coachUser.email}`);

  // Parent user - always update password to ensure it's correct
  const parentPasswordHash = await hashPassword(TEST_USERS.parent.password);
  let [parentUser] = await db
    .select()
    .from(users)
    .where(eq(users.email, TEST_USERS.parent.email))
    .limit(1);

  if (!parentUser) {
    [parentUser] = await db
      .insert(users)
      .values({
        email: TEST_USERS.parent.email,
        passwordHash: parentPasswordHash,
        firstName: TEST_USERS.parent.firstName,
        lastName: TEST_USERS.parent.lastName,
        emailVerified: true,
      })
      .returning();
  } else {
    // Update existing user's password and ensure email is verified
    await db.update(users)
      .set({ passwordHash: parentPasswordHash, emailVerified: true })
      .where(eq(users.id, parentUser.id));
  }
  // Always ensure parent role is assigned (delete other roles first)
  await db.delete(userRoles).where(eq(userRoles.userId, parentUser.id));
  await db.insert(userRoles).values({
    userId: parentUser.id,
    roleId: roleMap.parent.id,
    scopeType: "organization",
    scopeId: org.id,
  });
  console.log(`   ✓ Parent: ${parentUser.email}`);

  // Adult self-registration test user
  const adultSelfPasswordHash = await hashPassword(TEST_USERS.adultSelf.password);
  let [adultSelfUser] = await db
    .select()
    .from(users)
    .where(eq(users.email, TEST_USERS.adultSelf.email))
    .limit(1);

  if (!adultSelfUser) {
    [adultSelfUser] = await db
      .insert(users)
      .values({
        email: TEST_USERS.adultSelf.email,
        passwordHash: adultSelfPasswordHash,
        firstName: TEST_USERS.adultSelf.firstName,
        lastName: TEST_USERS.adultSelf.lastName,
        phone: TEST_USERS.adultSelf.phone,
        birthDate: TEST_USERS.adultSelf.birthDate,
        emailVerified: true,
      })
      .returning();
  } else {
    await db
      .update(users)
      .set({
        passwordHash: adultSelfPasswordHash,
        phone: TEST_USERS.adultSelf.phone,
        birthDate: TEST_USERS.adultSelf.birthDate,
        emailVerified: true,
      })
      .where(eq(users.id, adultSelfUser.id));
  }
  // Assign parent role (adults who self-register use the parent role)
  await db.delete(userRoles).where(eq(userRoles.userId, adultSelfUser.id));
  await db.insert(userRoles).values({
    userId: adultSelfUser.id,
    roleId: roleMap.parent.id,
    scopeType: "organization",
    scopeId: org.id,
  });
  console.log(`   ✓ AdultSelf: ${adultSelfUser.email}`);

  // Host user — no userRoles assignment: host authorization is an ACTIVE
  // host_profiles row (see src/lib/auth/host.ts), not RBAC. The profile row
  // itself is created below in seedHostPortalFixture(), once org/venue are
  // available.
  const hostPasswordHash = await hashPassword(TEST_USERS.host.password);
  let [hostUser] = await db
    .select()
    .from(users)
    .where(eq(users.email, TEST_USERS.host.email))
    .limit(1);

  if (!hostUser) {
    [hostUser] = await db
      .insert(users)
      .values({
        email: TEST_USERS.host.email,
        passwordHash: hostPasswordHash,
        firstName: TEST_USERS.host.firstName,
        lastName: TEST_USERS.host.lastName,
        emailVerified: true,
      })
      .returning();
  } else {
    await db
      .update(users)
      .set({ passwordHash: hostPasswordHash, emailVerified: true })
      .where(eq(users.id, hostUser.id));
  }
  console.log(`   ✓ Host: ${hostUser.email}`);

  // Get or create sport — upsert so re-seeding resets name if a test mutated it
  console.log("\n3. Setting up programs...");
  let [soccer] = await db
    .select()
    .from(sports)
    .where(and(eq(sports.organizationId, org.id), eq(sports.slug, "soccer")))
    .limit(1);

  if (!soccer) {
    [soccer] = await db
      .insert(sports)
      .values({
        organizationId: org.id,
        name: "Soccer",
        slug: "soccer",
        icon: "⚽",
        color: "#22c55e",
      })
      .returning();
  } else if (soccer.name !== "Soccer") {
    // A test may have mutated the name (e.g. cross-org PUT that slipped through).
    // Reset it so the dashboard never shows stale/hacked names.
    [soccer] = await db
      .update(sports)
      .set({ name: "Soccer" })
      .where(eq(sports.id, soccer.id))
      .returning();
  }

  // Get or create age group
  let [u8AgeGroup] = await db
    .select()
    .from(ageGroups)
    .where(and(eq(ageGroups.organizationId, org.id), eq(ageGroups.name, "U8")))
    .limit(1);

  if (!u8AgeGroup) {
    [u8AgeGroup] = await db
      .insert(ageGroups)
      .values({
        organizationId: org.id,
        name: "U8",
        minAge: 6,
        maxAge: 8,
        description: "Ages 6-8",
      })
      .returning();
  }

  // Get or create venue
  let [venue] = await db
    .select()
    .from(venues)
    .where(eq(venues.locationId, location.id))
    .limit(1);

  if (!venue) {
    [venue] = await db
      .insert(venues)
      .values({
        locationId: location.id,
        name: "Test Soccer Field",
        address: "123 Test St, Powell, OH 43065",
        fieldCount: 2,
        indoor: false,
      })
      .returning();
  }

  // Rental-enabled venue — fixed UUID so tests can import E2E_RENTAL_VENUE_ID.
  // onConflictDoUpdate ensures rental fields are refreshed on every seed run.
  await db
    .insert(venues)
    .values({
      id: E2E_RENTAL_VENUE_ID,
      locationId: location.id,
      name: "E2E Rental Field Complex",
      address: "789 Rental Ave, Powell, OH 43065",
      fieldCount: 3,
      indoor: false,
      rentalEnabled: true,
      rentalHourlyRateCents: 8000,
      rentalOpenMinute: 480,   // 8am
      rentalCloseMinute: 1320, // 10pm
    })
    .onConflictDoUpdate({
      target: venues.id,
      set: {
        rentalEnabled: true,
        rentalHourlyRateCents: 8000,
        rentalOpenMinute: 480,
        rentalCloseMinute: 1320,
        fieldCount: 3,
      },
    });

  // Field-time ledger: the rental venue's fields must exist as resources
  // so availability + conflict paths exercise the real ledger in CI (the
  // migration only seeded venues that existed at migrate time).
  await ensureVenueResources(E2E_RENTAL_VENUE_ID);
  console.log(`   ✓ Rental venue: E2E Rental Field Complex (${E2E_RENTAL_VENUE_ID})`);

  // Rate card for the main e2e org — one row per org, idempotent.
  await db
    .insert(fieldRentalRateCard)
    .values({ organizationId: org.id })
    .onConflictDoNothing();
  console.log(`   ✓ Field rental rate card seeded for org ${org.id}`);

  // Create program
  let [program] = await db
    .select()
    .from(programs)
    .where(eq(programs.slug, "e2e-test-soccer"))
    .limit(1);

  if (!program) {
    [program] = await db
      .insert(programs)
      .values({
        locationId: location.id,
        sportId: soccer.id,
        name: "E2E Test Soccer Program",
        slug: "e2e-test-soccer",
        description: "Soccer program for E2E testing",
        programType: "league",
        active: true,
      })
      .returning();
  }
  console.log(`   ✓ Program: ${program.name}`);

  // Create season (open for registration)
  const seasonStartDate = new Date();
  seasonStartDate.setMonth(seasonStartDate.getMonth() + 1);
  const seasonEndDate = new Date(seasonStartDate);
  seasonEndDate.setMonth(seasonEndDate.getMonth() + 3);
  const registrationEnd = new Date(seasonStartDate);
  registrationEnd.setDate(registrationEnd.getDate() - 7);

  // Format dates as strings for the date columns
  const formatDate = (d: Date) => d.toISOString().split('T')[0];

  let [season] = await db
    .select()
    .from(seasons)
    .where(eq(seasons.slug, "e2e-test-spring-2026"))
    .limit(1);

  if (!season) {
    [season] = await db
      .insert(seasons)
      .values({
        programId: program.id,
        ageGroupId: u8AgeGroup.id,
        name: "E2E Test Spring 2026",
        slug: "e2e-test-spring-2026",
        startDate: formatDate(seasonStartDate),
        endDate: formatDate(seasonEndDate),
        registrationOpens: new Date(), // Open now
        registrationCloses: registrationEnd,
        status: "open",
        priceCents: 15000, // $150
        depositCents: 5000, // $50 deposit
        allowDeposit: true,
        maxParticipants: 20,
      })
      .returning();
  }
  console.log(`   ✓ Season: ${season.name} (registration open)`);

  // Adult age group (18+) for self-registration tests
  let [adultAgeGroup] = await db
    .select()
    .from(ageGroups)
    .where(and(eq(ageGroups.organizationId, org.id), eq(ageGroups.name, "Adult 18+")))
    .limit(1);

  if (!adultAgeGroup) {
    [adultAgeGroup] = await db
      .insert(ageGroups)
      .values({
        organizationId: org.id,
        name: "Adult 18+",
        minAge: 18,
        maxAge: 99,
        description: "Ages 18 and up",
      })
      .returning();
  }

  // Adult Open Soccer program
  let [adultProgram] = await db
    .select()
    .from(programs)
    .where(eq(programs.slug, "e2e-adult-open-soccer"))
    .limit(1);

  if (!adultProgram) {
    [adultProgram] = await db
      .insert(programs)
      .values({
        locationId: location.id,
        sportId: soccer.id,
        name: "Adult Open Soccer",
        slug: "e2e-adult-open-soccer",
        description: "Adult open soccer league for E2E testing",
        programType: "league",
        active: true,
      })
      .returning();
  }
  console.log(`   ✓ Adult Program: ${adultProgram.name}`);

  // Adult Open Soccer season (open for registration).
  // Always reset status and maxParticipants on re-seed so the dashboard shows
  // "Register Now" rather than "Join Waitlist" after partial-fill test runs.
  let [adultSeason] = await db
    .select()
    .from(seasons)
    .where(eq(seasons.slug, ADULT_OPEN_SEASON_SLUG))
    .limit(1);

  if (!adultSeason) {
    [adultSeason] = await db
      .insert(seasons)
      .values({
        programId: adultProgram.id,
        ageGroupId: adultAgeGroup.id,
        name: "Adult Open Soccer 2026",
        slug: ADULT_OPEN_SEASON_SLUG,
        startDate: formatDate(seasonStartDate),
        endDate: formatDate(seasonEndDate),
        registrationOpens: new Date(), // Open now
        registrationCloses: registrationEnd,
        status: "open",
        priceCents: 10000, // $100
        depositCents: 3000, // $30 deposit
        allowDeposit: true,
        maxParticipants: 30,
        // Fall 2026 adult-soccer division metadata. Both brand hosts resolve
        // to this (Aspire) org post-cutover, so /adult/leagues/soccer/fall-2026
        // is driven by these Aspire-org seasons.
        termSlug: "fall-2026",
        termLabel: "Fall 2026",
        divisionGender: "coed",
        skillLevel: "c",
        dayOfWeek: "tue",
        startTime: "18:00",
        endTime: "20:00",
      })
      .returning();
  } else {
    // Reset status and capacity so the season always shows "Register Now";
    // keep the Fall 2026 division metadata in sync on re-seed.
    [adultSeason] = await db
      .update(seasons)
      .set({
        status: "open",
        maxParticipants: 30,
        termSlug: "fall-2026",
        termLabel: "Fall 2026",
        divisionGender: "coed",
        skillLevel: "c",
        dayOfWeek: "tue",
        startTime: "18:00",
        endTime: "20:00",
      })
      .where(eq(seasons.id, adultSeason.id))
      .returning();
  }
  console.log(`   ✓ Adult Season: ${adultSeason.name} (id: ${adultSeason.id}) status=${adultSeason.status}`);

  // Team-capable adult-soccer season — sibling of the solo-only
  // `e2e-adult-open-soccer-2026` above. Same program/org/location/age group so
  // localhost resolves to it. `signupModes` includes "team", which is what the
  // register page's choose-mode keys off of to show the "Bring a team" path
  // (register-experience.tsx: `signupModes.includes("team")`). The solo sibling
  // leaves signupModes at the default ['individual'], so this is the only e2e
  // season that exercises the team/choose-mode flow.
  // earlyBird (now + 14d) sits before registrationEnd (now + ~3wk), both future.
  const teamEarlyBirdDeadline = new Date();
  teamEarlyBirdDeadline.setDate(teamEarlyBirdDeadline.getDate() + 14);

  let [adultTeamSeason] = await db
    .select()
    .from(seasons)
    .where(eq(seasons.slug, "e2e-adult-team-soccer-2026"))
    .limit(1);

  if (!adultTeamSeason) {
    [adultTeamSeason] = await db
      .insert(seasons)
      .values({
        programId: adultProgram.id,
        ageGroupId: adultAgeGroup.id,
        name: "E2E Adult Team Soccer 2026",
        slug: "e2e-adult-team-soccer-2026",
        startDate: formatDate(seasonStartDate),
        endDate: formatDate(seasonEndDate),
        registrationOpens: new Date(), // Open now
        registrationCloses: registrationEnd,
        earlyBirdDeadline: teamEarlyBirdDeadline,
        status: "open",
        priceCents: 12000, // $120 per-player (free-agent / solo path)
        teamPriceCents: 100000, // $1000 team fee (team path)
        // Team-only early-bird ($900 < $1000 list), matching the real policy:
        // captains get a discount, solo players never do. NO earlyBirdPriceCents
        // here on purpose — a per-player early-bird would discount the solo path.
        earlyBirdTeamPriceCents: 90000, // $900 while earlyBirdDeadline is live
        signupModes: ["team", "individual"], // team-capable → choose-mode shows "Bring a team"
        depositCents: 3000, // $30 individual deposit (team flow uses its own $200)
        allowDeposit: true,
        maxParticipants: 30,
        termSlug: "fall-2026",
        termLabel: "Fall 2026",
        divisionGender: "coed",
        skillLevel: "c",
        dayOfWeek: "wed",
        startTime: "18:00",
        endTime: "20:00",
      })
      .returning();
  } else {
    // Reset status/capacity and keep team capability + division metadata in
    // sync on re-seed (mirrors the solo sibling's update branch).
    [adultTeamSeason] = await db
      .update(seasons)
      .set({
        status: "open",
        maxParticipants: 30,
        teamPriceCents: 100000,
        earlyBirdTeamPriceCents: 90000,
        signupModes: ["team", "individual"],
        earlyBirdDeadline: teamEarlyBirdDeadline,
        registrationCloses: registrationEnd,
        termSlug: "fall-2026",
        termLabel: "Fall 2026",
        divisionGender: "coed",
        skillLevel: "c",
        dayOfWeek: "wed",
        startTime: "18:00",
        endTime: "20:00",
      })
      .where(eq(seasons.id, adultTeamSeason.id))
      .returning();
  }
  console.log(`   ✓ Adult Season: ${adultTeamSeason.name} (id: ${adultTeamSeason.id}) signupModes=${adultTeamSeason.signupModes}`);

  // Second Aspire adult-soccer division (Men's D) so the soccer season page's
  // divisions finder has >1 row and the gender filter is exercised. Same
  // program/org as the coed season; unique slug.
  let [adultMensSeason] = await db
    .select()
    .from(seasons)
    .where(eq(seasons.slug, "e2e-adult-soccer-fall-2026-mens-d"))
    .limit(1);

  if (!adultMensSeason) {
    [adultMensSeason] = await db
      .insert(seasons)
      .values({
        programId: adultProgram.id,
        ageGroupId: adultAgeGroup.id,
        name: "Fall 2026 — Men's D",
        slug: "e2e-adult-soccer-fall-2026-mens-d",
        startDate: formatDate(seasonStartDate),
        endDate: formatDate(seasonEndDate),
        registrationOpens: new Date(),
        registrationCloses: registrationEnd,
        status: "open",
        priceCents: 10000,
        maxParticipants: 30,
        termSlug: "fall-2026",
        termLabel: "Fall 2026",
        divisionGender: "mens",
        skillLevel: "d",
        dayOfWeek: "mon",
        startTime: "20:00",
        endTime: "22:00",
      })
      .returning();
  } else {
    [adultMensSeason] = await db
      .update(seasons)
      .set({
        status: "open",
        termSlug: "fall-2026",
        termLabel: "Fall 2026",
        divisionGender: "mens",
        skillLevel: "d",
        dayOfWeek: "mon",
      })
      .where(eq(seasons.id, adultMensSeason.id))
      .returning();
  }
  console.log(`   ✓ Adult Season: ${adultMensSeason.name} (id: ${adultMensSeason.id})`);

  // Keep the OPEN test seasons registerable on re-runs. The shared CI DB
  // accumulates: rows created weeks ago would age past registration_closes /
  // start_date, and both createRegistration and the public catalog now
  // enforce the "live until" window. Mirrors the SoccerOne season refresh.
  await db
    .update(seasons)
    .set({
      startDate: formatDate(seasonStartDate),
      endDate: formatDate(seasonEndDate),
      registrationOpens: new Date(),
      registrationCloses: registrationEnd,
    })
    .where(
      inArray(seasons.slug, [
        "e2e-test-spring-2026",
        ADULT_OPEN_SEASON_SLUG,
        "e2e-adult-team-soccer-2026",
        "e2e-adult-soccer-fall-2026-mens-d",
      ]),
    );
  console.log("   ✓ Open test seasons re-dated (start +1mo, closes start−7d)");

  // Early-bird fixture: the spring season carries an always-live early-bird
  // window (deadline now + 2wk — before registrationCloses — and price $20
  // below the $150 list price) so API tests can assert the discounted charge
  // path. Asserted on every run; no other fixture gains an early-bird price.
  const springEarlyBirdDeadline = new Date();
  springEarlyBirdDeadline.setDate(springEarlyBirdDeadline.getDate() + 14);
  await db
    .update(seasons)
    .set({
      earlyBirdDeadline: springEarlyBirdDeadline,
      earlyBirdPriceCents: 13000, // $130 ($150 list − $20)
    })
    .where(eq(seasons.slug, "e2e-test-spring-2026"));
  console.log("   ✓ Early-bird window asserted on e2e-test-spring-2026 (now+14d, $130)");

  // Closed-window fixture: status stays `open` but the start day has passed
  // and registration_closes is null — the exact Founders'-Tournament shape
  // the enforcement exists for. Dates re-assert on every run.
  const closedWindowStart = new Date();
  closedWindowStart.setDate(closedWindowStart.getDate() - 14);
  const closedWindowEnd = new Date();
  closedWindowEnd.setMonth(closedWindowEnd.getMonth() + 2);
  let [closedWindowSeason] = await db
    .select()
    .from(seasons)
    .where(eq(seasons.slug, CLOSED_SEASON_SLUG))
    .limit(1);
  if (!closedWindowSeason) {
    [closedWindowSeason] = await db
      .insert(seasons)
      .values({
        programId: adultProgram.id,
        ageGroupId: adultAgeGroup.id,
        name: "E2E Closed Window Season",
        slug: CLOSED_SEASON_SLUG,
        startDate: formatDate(closedWindowStart),
        endDate: formatDate(closedWindowEnd),
        registrationOpens: null,
        registrationCloses: null,
        status: "open",
        priceCents: 10000,
      })
      .returning();
  } else {
    await db
      .update(seasons)
      .set({
        startDate: formatDate(closedWindowStart),
        endDate: formatDate(closedWindowEnd),
        registrationCloses: null,
        status: "open",
      })
      .where(eq(seasons.id, closedWindowSeason.id));
  }
  console.log(`   ✓ Closed-window season: ${CLOSED_SEASON_SLUG} (started 2wk ago, open status)`);

  // Active 'Summer 2026' soccer division with played games, so the season
  // page's Standings tab renders a live table (Fall 2026 stays 'open' → empty
  // standings). Idempotent via slug/name guards.
  let [summerSeason] = await db
    .select()
    .from(seasons)
    .where(eq(seasons.slug, "e2e-adult-soccer-summer-2026-coed-c"))
    .limit(1);

  if (!summerSeason) {
    [summerSeason] = await db
      .insert(seasons)
      .values({
        programId: adultProgram.id,
        ageGroupId: adultAgeGroup.id,
        name: "Summer 2026 — Coed C",
        slug: "e2e-adult-soccer-summer-2026-coed-c",
        startDate: formatDate(seasonStartDate),
        endDate: formatDate(seasonEndDate),
        status: "active",
        priceCents: 10000,
        maxParticipants: 30,
        termSlug: "summer-2026",
        termLabel: "Summer 2026",
        divisionGender: "coed",
        skillLevel: "c",
        dayOfWeek: "tue",
        startTime: "18:00",
        endTime: "20:00",
      })
      .returning();
  } else {
    [summerSeason] = await db
      .update(seasons)
      .set({ status: "active", termSlug: "summer-2026", termLabel: "Summer 2026" })
      .where(eq(seasons.id, summerSeason.id))
      .returning();
  }

  const summerTeamNames = ["FC Lakeview", "Powell United", "Worthington Wolves", "North End SC"];
  const summerTeamIds: Record<string, string> = {};
  for (const name of summerTeamNames) {
    let [t] = await db
      .select()
      .from(teams)
      .where(and(eq(teams.seasonId, summerSeason.id), eq(teams.name, name)))
      .limit(1);
    if (!t) {
      [t] = await db
        .insert(teams)
        .values({ seasonId: summerSeason.id, name, division: "Coed C" })
        .returning();
    }
    summerTeamIds[name] = t.id;
  }

  const existingSummerGames = await db
    .select({ id: games.id })
    .from(games)
    .where(eq(games.seasonId, summerSeason.id))
    .limit(1);
  if (existingSummerGames.length === 0) {
    const wkAgo = (n: number) => new Date(Date.now() - n * 7 * 24 * 60 * 60 * 1000);
    await db.insert(games).values([
      { seasonId: summerSeason.id, homeTeamId: summerTeamIds["FC Lakeview"], awayTeamId: summerTeamIds["North End SC"], scheduledAt: wkAgo(3), status: "completed", homeScore: 3, awayScore: 1 },
      { seasonId: summerSeason.id, homeTeamId: summerTeamIds["Powell United"], awayTeamId: summerTeamIds["Worthington Wolves"], scheduledAt: wkAgo(3), status: "completed", homeScore: 2, awayScore: 0 },
      { seasonId: summerSeason.id, homeTeamId: summerTeamIds["FC Lakeview"], awayTeamId: summerTeamIds["Powell United"], scheduledAt: wkAgo(2), status: "completed", homeScore: 2, awayScore: 2 },
      { seasonId: summerSeason.id, homeTeamId: summerTeamIds["Worthington Wolves"], awayTeamId: summerTeamIds["North End SC"], scheduledAt: wkAgo(2), status: "completed", homeScore: 1, awayScore: 0 },
      { seasonId: summerSeason.id, homeTeamId: summerTeamIds["FC Lakeview"], awayTeamId: summerTeamIds["Worthington Wolves"], scheduledAt: wkAgo(1), status: "completed", homeScore: 4, awayScore: 2 },
      { seasonId: summerSeason.id, homeTeamId: summerTeamIds["Powell United"], awayTeamId: summerTeamIds["North End SC"], scheduledAt: wkAgo(1), status: "completed", homeScore: 1, awayScore: 1 },
    ]);
  }
  console.log(`   ✓ Active soccer division seeded: ${summerSeason.name} (4 teams, 6 games)`);

  // -------------------------------------------------------------------------
  // Org B — second tenant for cross-tenant isolation tests.
  // This org has its own admin, location, sport, program and season.
  // It must remain status='inactive' + organizationType='franchise' so the
  // domain-resolver does NOT pick it up as the default org on CI.
  // Tests reach it by signing in as the adminOrgB user (location_admin scoped
  // to orgB) and sending requests with Host: orgb.localhost, which routes
  // the middleware to orgB via the subdomain slug match.
  // -------------------------------------------------------------------------
  console.log("\n3b. Setting up Org B (cross-tenant test fixture)...");

  let [orgB] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.slug, "orgb"))
    .limit(1);

  if (!orgB) {
    [orgB] = await db
      .insert(organizations)
      .values({
        name: "Org B (Test Only)",
        slug: "orgb",
        status: "active",
        organizationType: "franchise",
      })
      .returning();
  } else if (orgB.status !== "active") {
    [orgB] = await db
      .update(organizations)
      .set({ status: "active", organizationType: "franchise" })
      .where(eq(organizations.id, orgB.id))
      .returning();
  }
  console.log(`   ✓ Org B: ${orgB.name} (${orgB.id})`);

  let [orgBLocation] = await db
    .select()
    .from(locations)
    .where(eq(locations.organizationId, orgB.id))
    .limit(1);

  if (!orgBLocation) {
    [orgBLocation] = await db
      .insert(locations)
      .values({
        organizationId: orgB.id,
        name: "Org B HQ",
        slug: "orgb-hq",
        city: "Columbus",
        state: "OH",
        country: "US",
        timezone: "America/New_York",
      })
      .returning();
  }
  console.log(`   ✓ Org B Location: ${orgBLocation.name} (${orgBLocation.id})`);

  // Org B sport — upsert so re-seeding resets name if a test mutated it
  let [orgBSport] = await db
    .select()
    .from(sports)
    .where(and(eq(sports.organizationId, orgB.id), eq(sports.slug, "basketball")))
    .limit(1);

  if (!orgBSport) {
    [orgBSport] = await db
      .insert(sports)
      .values({
        organizationId: orgB.id,
        name: "Basketball",
        slug: "basketball",
        icon: "🏀",
        color: "#f97316",
      })
      .returning();
  } else if (orgBSport.name !== "Basketball") {
    // A cross-org test may have mutated this name before scoping was enforced.
    // Reset it to avoid stale names surfacing in the UI.
    [orgBSport] = await db
      .update(sports)
      .set({ name: "Basketball" })
      .where(eq(sports.id, orgBSport.id))
      .returning();
  }
  console.log(`   ✓ Org B Sport: ${orgBSport.name}`);

  // Org B program
  let [orgBProgram] = await db
    .select()
    .from(programs)
    .where(eq(programs.slug, "orgb-basketball-league"))
    .limit(1);

  if (!orgBProgram) {
    [orgBProgram] = await db
      .insert(programs)
      .values({
        locationId: orgBLocation.id,
        sportId: orgBSport.id,
        name: "Org B Basketball League",
        slug: "orgb-basketball-league",
        programType: "league",
        active: true,
      })
      .returning();
  }
  console.log(`   ✓ Org B Program: ${orgBProgram.name} (${orgBProgram.id})`);

  // Org B season
  let [orgBSeason] = await db
    .select()
    .from(seasons)
    .where(eq(seasons.slug, "orgb-basketball-fall-2026"))
    .limit(1);

  if (!orgBSeason) {
    [orgBSeason] = await db
      .insert(seasons)
      .values({
        programId: orgBProgram.id,
        name: "Org B Basketball Fall 2026",
        slug: "orgb-basketball-fall-2026",
        startDate: "2026-09-01",
        endDate: "2026-12-15",
        status: "draft",
        priceCents: 12000,
        allowDeposit: false,
      })
      .returning();
  }
  console.log(`   ✓ Org B Season: ${orgBSeason.name} (${orgBSeason.id})`);

  // Org B venue
  let [orgBVenue] = await db
    .select()
    .from(venues)
    .where(eq(venues.locationId, orgBLocation.id))
    .limit(1);

  if (!orgBVenue) {
    [orgBVenue] = await db
      .insert(venues)
      .values({
        locationId: orgBLocation.id,
        name: "Org B Arena",
        address: "456 Other St, Columbus, OH 43201",
        fieldCount: 1,
        indoor: true,
      })
      .returning();
  }
  console.log(`   ✓ Org B Venue: ${orgBVenue.name} (${orgBVenue.id})`);

  // Org B admin user (location_admin scoped to orgB)
  const adminOrgBPasswordHash = await hashPassword(TEST_USERS.adminOrgB.password);
  let [adminOrgBUser] = await db
    .select()
    .from(users)
    .where(eq(users.email, TEST_USERS.adminOrgB.email))
    .limit(1);

  if (!adminOrgBUser) {
    [adminOrgBUser] = await db
      .insert(users)
      .values({
        email: TEST_USERS.adminOrgB.email,
        passwordHash: adminOrgBPasswordHash,
        firstName: TEST_USERS.adminOrgB.firstName,
        lastName: TEST_USERS.adminOrgB.lastName,
        emailVerified: true,
      })
      .returning();
  } else {
    await db
      .update(users)
      .set({ passwordHash: adminOrgBPasswordHash, emailVerified: true })
      .where(eq(users.id, adminOrgBUser.id));
  }
  await db.delete(userRoles).where(eq(userRoles.userId, adminOrgBUser.id));
  await db.insert(userRoles).values({
    userId: adminOrgBUser.id,
    roleId: roleMap.location_admin.id,
    scopeType: "organization",
    scopeId: orgB.id,
  });
  console.log(`   ✓ Org B Admin: ${adminOrgBUser.email}`);

  // Export Org B IDs — stored in a well-known key the tests can fetch at runtime
  // via GET /api/admin/seasons?include_test=1 (filtered by slug) or
  // GET /api/admin/programs (filtered by slug). Tests should not hard-code
  // UUIDs; they should look them up by slug from the appropriate endpoint.
  console.log(`   ✓ Org B fixture summary:`);
  console.log(`       orgId=${orgB.id}  programId=${orgBProgram.id}`);
  console.log(`       seasonId=${orgBSeason.id}  venueId=${orgBVenue.id}`);
  console.log(`       sportId=${orgBSport.id}  locationId=${orgBLocation.id}`);

  // Create teams assigned to coach — need at least two so Games tests can
  // schedule home vs away.
  console.log("\n4. Setting up teams...");
  let [team] = await db
    .select()
    .from(teams)
    .where(eq(teams.name, "E2E Test Team"))
    .limit(1);

  if (!team) {
    [team] = await db
      .insert(teams)
      .values({
        seasonId: season.id,
        name: "E2E Test Team",
        coachUserId: coachUser.id,
        color: "#22c55e",
        maxRosterSize: 12,
        division: "U8",
      })
      .returning();
  }
  console.log(`   ✓ Team: ${team.name} (Coach: ${coachUser.firstName})`);

  let [team2] = await db
    .select()
    .from(teams)
    .where(eq(teams.name, "E2E Test Team 2"))
    .limit(1);

  if (!team2) {
    [team2] = await db
      .insert(teams)
      .values({
        seasonId: season.id,
        name: "E2E Test Team 2",
        coachUserId: coachUser.id,
        color: "#3b82f6",
        maxRosterSize: 12,
        division: "U8",
      })
      .returning();
  }
  console.log(`   ✓ Team: ${team2.name}`);

  // Create family members for parent
  console.log("\n5. Setting up family members...");
  let [child1] = await db
    .select()
    .from(familyMembers)
    .where(
      and(
        eq(familyMembers.parentUserId, parentUser.id),
        eq(familyMembers.firstName, "Tommy")
      )
    )
    .limit(1);

  if (!child1) {
    [child1] = await db
      .insert(familyMembers)
      .values({
        parentUserId: parentUser.id,
        firstName: "Tommy",
        lastName: "Test",
        birthDate: "2018-05-15",
        gender: "male",
      })
      .returning();
  }
  console.log(`   ✓ Child: ${child1.firstName} ${child1.lastName}`);

  let [child2] = await db
    .select()
    .from(familyMembers)
    .where(
      and(
        eq(familyMembers.parentUserId, parentUser.id),
        eq(familyMembers.firstName, "Sarah")
      )
    )
    .limit(1);

  if (!child2) {
    [child2] = await db
      .insert(familyMembers)
      .values({
        parentUserId: parentUser.id,
        firstName: "Sarah",
        lastName: "Test",
        birthDate: "2019-08-22",
        gender: "female",
      })
      .returning();
  }
  console.log(`   ✓ Child: ${child2.firstName} ${child2.lastName}`);

  // Create a confirmed registration for one child
  console.log("\n6. Setting up registrations...");
  let [existingReg] = await db
    .select()
    .from(registrations)
    .where(
      and(
        eq(registrations.familyMemberId, child1.id),
        eq(registrations.seasonId, season.id)
      )
    )
    .limit(1);

  if (!existingReg) {
    [existingReg] = await db
      .insert(registrations)
      .values({
        seasonId: season.id,
        familyMemberId: child1.id,
        registeredByUserId: parentUser.id,
        status: "confirmed",
        paymentStatus: "paid",
        registrationType: "full",
        amountDueCents: 0,
        amountPaidCents: 15000,
      })
      .returning();
  } else if (
    existingReg.paymentStatus === "paid" &&
    existingReg.amountDueCents !== 0
  ) {
    // Heal stale rows from older seed runs that left amountDueCents=15000
    // on a fully-paid registration; the detail UI reads it as "Balance".
    [existingReg] = await db
      .update(registrations)
      .set({ amountDueCents: 0 })
      .where(eq(registrations.id, existingReg.id))
      .returning();
  }

  // Heal any other fully-paid rows in this org with non-zero amountDueCents.
  // Older seeds and the pre-fix Stripe webhook left amountDueCents at the
  // full season price even after payment landed, which renders as a wrong
  // "Balance $X.XX" on the new registration-detail page.
  await db
    .update(registrations)
    .set({ amountDueCents: 0 })
    .where(
      and(
        eq(registrations.paymentStatus, "paid"),
        ne(registrations.amountDueCents, 0)
      )
    );

  console.log(`   ✓ Registration: ${child1.firstName} - ${season.name} (confirmed)`);

  // --- Media staff user ---
  const mediaStaffPasswordHash = await hashPassword(
    TEST_USERS.mediaStaff.password
  );
  let [mediaStaffUser] = await db
    .select()
    .from(users)
    .where(eq(users.email, TEST_USERS.mediaStaff.email))
    .limit(1);

  if (!mediaStaffUser) {
    [mediaStaffUser] = await db
      .insert(users)
      .values({
        email: TEST_USERS.mediaStaff.email,
        passwordHash: mediaStaffPasswordHash,
        firstName: TEST_USERS.mediaStaff.firstName,
        lastName: TEST_USERS.mediaStaff.lastName,
        emailVerified: true,
      })
      .returning();
  } else {
    await db
      .update(users)
      .set({ passwordHash: mediaStaffPasswordHash, emailVerified: true })
      .where(eq(users.id, mediaStaffUser.id));
  }
  await db.delete(userRoles).where(eq(userRoles.userId, mediaStaffUser.id));
  await db.insert(userRoles).values({
    userId: mediaStaffUser.id,
    roleId: roleMap.media_staff.id,
    scopeType: "location",
    scopeId: location.id,
  });
  console.log(`   ✓ MediaStaff: ${mediaStaffUser.email}`);

  // --- Media editor user ---
  const mediaEditorPasswordHash = await hashPassword(
    TEST_USERS.mediaEditor.password
  );
  let [mediaEditorUser] = await db
    .select()
    .from(users)
    .where(eq(users.email, TEST_USERS.mediaEditor.email))
    .limit(1);

  if (!mediaEditorUser) {
    [mediaEditorUser] = await db
      .insert(users)
      .values({
        email: TEST_USERS.mediaEditor.email,
        passwordHash: mediaEditorPasswordHash,
        firstName: TEST_USERS.mediaEditor.firstName,
        lastName: TEST_USERS.mediaEditor.lastName,
        emailVerified: true,
      })
      .returning();
  } else {
    await db
      .update(users)
      .set({ passwordHash: mediaEditorPasswordHash, emailVerified: true })
      .where(eq(users.id, mediaEditorUser.id));
  }
  await db.delete(userRoles).where(eq(userRoles.userId, mediaEditorUser.id));
  await db.insert(userRoles).values({
    userId: mediaEditorUser.id,
    roleId: roleMap.media_editor.id,
    scopeType: "location",
    scopeId: location.id,
  });
  console.log(`   ✓ MediaEditor: ${mediaEditorUser.email}`);

  await db
    .insert(mediaStaffProfiles)
    .values({
      userId: mediaStaffUser.id,
      organizationId: org.id,
      serviceLocationIds: [location.id],
      active: true,
      onboardedAt: new Date(),
    })
    .onConflictDoNothing();
  console.log(`   ✓ MediaStaffProfile seeded for ${TEST_USERS.mediaStaff.email}`);

  await db
    .insert(mediaStaffProfiles)
    .values({
      userId: mediaEditorUser.id,
      organizationId: org.id,
      serviceLocationIds: [location.id],
      active: true,
      onboardedAt: new Date(),
    })
    .onConflictDoNothing();
  console.log(`   ✓ MediaStaffProfile seeded for ${TEST_USERS.mediaEditor.email}`);

  // --- Phase 2: roster + game + uploaded shoot sessions for the tagger ---
  console.log("\n8. Setting up tagger fixtures (Phase 2)...");

  let [rosterRow] = await db
    .select()
    .from(rosters)
    .where(
      and(eq(rosters.teamId, team.id), eq(rosters.registrationId, existingReg.id))
    )
    .limit(1);
  if (!rosterRow) {
    [rosterRow] = await db
      .insert(rosters)
      .values({
        teamId: team.id,
        registrationId: existingReg.id,
        jerseyNumber: "7",
        status: "active",
      })
      .returning();
  }
  console.log(`   ✓ Roster entry: #${rosterRow.jerseyNumber} on ${team.name}`);

  let [game] = await db
    .select()
    .from(games)
    .where(
      and(eq(games.homeTeamId, team.id), eq(games.awayTeamId, team2.id))
    )
    .limit(1);
  if (!game) {
    [game] = await db
      .insert(games)
      .values({
        seasonId: season.id,
        homeTeamId: team.id,
        awayTeamId: team2.id,
        scheduledAt: new Date(),
        status: "scheduled",
      })
      .returning();
  }
  console.log(`   ✓ Game: ${team.name} vs ${team2.name}`);

  // Cleanup pass: delete leftover 'uploaded' sessions from prior seed runs
  // so we don't accumulate hundreds of rows over time. Cascades through
  // mediaAssets and mediaTags via onDelete: "cascade". Only targets the
  // exact (org, game, status) tuple this seed creates — won't touch any
  // non-seed shoot session, and won't touch sessions that current CI
  // workers have already claimed (those are status='tagging' now).
  const deleted = await db
    .delete(shootSessions)
    .where(
      and(
        eq(shootSessions.organizationId, org.id),
        eq(shootSessions.gameId, game.id),
        eq(shootSessions.status, "uploaded")
      )
    )
    .returning({ id: shootSessions.id });
  console.log(
    `   ✓ Cleared ${deleted.length} stale 'uploaded' fixtures (cascading to assets/tags)`
  );

  // API tests (test-api job) and Playwright tests (test job) run in parallel
  // against the same shared CI DB. tag-session.test.ts has 5 describe blocks
  // (each beforeAll claims queue[0]) plus inline claims, so test-api can
  // consume ~6 sessions on its own. Add 15 fresh fixtures every seed run.
  // Concurrent runs are safe: this delete only touches status='uploaded',
  // so any session another worker has already claimed (status='tagging')
  // is preserved.
  const needed = 15;
  for (let n = 0; n < needed; n++) {
    const [s] = await db
      .insert(shootSessions)
      .values({
        organizationId: org.id,
        locationId: location.id,
        gameId: game.id,
        assignedUserId: mediaStaffUser.id,
        assignedByUserId: adminUser.id,
        sessionType: "game",
        status: "uploaded",
        scheduledStart: new Date(),
        scheduledEnd: new Date(Date.now() + 60 * 60 * 1000),
        rateType: "per_game",
        rateCents: 0,
        payoutStatus: "unearned",
      })
      .returning();

    const base = Date.now();
    for (let i = 0; i < 6; i++) {
      await db.insert(mediaAssets).values({
        shootSessionId: s.id,
        organizationId: org.id,
        assetType: "photo",
        storageKey: `seed/session-${s.id}/asset-${i}.jpg`,
        thumbnailKey: `seed/session-${s.id}/thumb-${i}.jpg`,
        originalFilename: `asset-${i}.jpg`,
        fileSizeBytes: 1024,
        mimeType: "image/jpeg",
        capturedAt: new Date(base + i * 800),
        uploadedAt: new Date(),
        status: "uploaded",
      });
    }
    console.log(`   ✓ Tagger fixture session ${s.id.slice(0, 8)} with 6 assets`);
  }
  // -------------------------------------------------------------------------
  // Events — one per org for tenant-isolation tests.
  // Slugs are stable so the upsert is idempotent across seed runs.
  // -------------------------------------------------------------------------
  console.log("\n10. Setting up events (tenant-isolation fixtures)...");

  // Org A event — active, future startsAt, audience 'all'
  const orgAEventStartsAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // now + 30 days
  let [orgAEvent] = await db
    .select()
    .from(events)
    .where(eq(events.slug, "e2e-orga-event"))
    .limit(1);

  if (!orgAEvent) {
    [orgAEvent] = await db
      .insert(events)
      .values({
        organizationId: org.id,
        locationId: location.id,
        name: "E2E Org A Event",
        slug: "e2e-orga-event",
        description: "Org A event for tenant-isolation E2E tests",
        audience: "all",
        startsAt: orgAEventStartsAt,
        active: true,
      })
      .returning();
  } else {
    // Refresh startsAt so it stays in the future on repeated seed runs
    [orgAEvent] = await db
      .update(events)
      .set({ active: true, startsAt: orgAEventStartsAt })
      .where(eq(events.id, orgAEvent.id))
      .returning();
  }
  console.log(`   ✓ Org A Event: ${orgAEvent.name} (${orgAEvent.id})`);

  // Org B event — same shape, scoped to orgB
  const orgBEventStartsAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  let [orgBEvent] = await db
    .select()
    .from(events)
    .where(eq(events.slug, "e2e-orgb-event"))
    .limit(1);

  if (!orgBEvent) {
    [orgBEvent] = await db
      .insert(events)
      .values({
        organizationId: orgB.id,
        locationId: orgBLocation.id,
        name: "E2E Org B Event",
        slug: "e2e-orgb-event",
        description: "Org B event for tenant-isolation E2E tests",
        audience: "all",
        startsAt: orgBEventStartsAt,
        active: true,
      })
      .returning();
  } else {
    [orgBEvent] = await db
      .update(events)
      .set({ active: true, startsAt: orgBEventStartsAt })
      .where(eq(events.id, orgBEvent.id))
      .returning();
  }
  console.log(`   ✓ Org B Event: ${orgBEvent.name} (${orgBEvent.id})`);

  // -------------------------------------------------------------------------
  // Team registrations — one per org for cross-tenant token isolation tests.
  // Tokens are fixed strings so the test can look them up via org-fixtures.
  // -------------------------------------------------------------------------
  console.log("\n11. Setting up team_registrations (tenant-isolation fixtures)...");

  // Org A team registration
  let [orgATeamReg] = await db
    .select()
    .from(teamRegistrations)
    .where(eq(teamRegistrations.inviteToken, E2E_TEAM_REG_TOKEN_ORG_A))
    .limit(1);

  if (!orgATeamReg) {
    [orgATeamReg] = await db
      .insert(teamRegistrations)
      .values({
        organizationId: org.id,
        seasonId: season.id,
        captainEmail: "captain-orga@test.aspiresports.com",
        captainName: "Org A Captain",
        teamName: "E2E Org A Team",
        inviteToken: E2E_TEAM_REG_TOKEN_ORG_A,
        status: "forming",
      })
      .returning();
  }
  console.log(`   ✓ Org A TeamReg: ${orgATeamReg.teamName} (token: ${orgATeamReg.inviteToken})`);

  // Org B team registration
  let [orgBTeamReg] = await db
    .select()
    .from(teamRegistrations)
    .where(eq(teamRegistrations.inviteToken, E2E_TEAM_REG_TOKEN_ORG_B))
    .limit(1);

  if (!orgBTeamReg) {
    [orgBTeamReg] = await db
      .insert(teamRegistrations)
      .values({
        organizationId: orgB.id,
        seasonId: orgBSeason.id,
        captainEmail: "captain-orgb@test.aspiresports.com",
        captainName: "Org B Captain",
        teamName: "E2E Org B Team",
        inviteToken: E2E_TEAM_REG_TOKEN_ORG_B,
        status: "forming",
      })
      .returning();
  }
  console.log(`   ✓ Org B TeamReg: ${orgBTeamReg.teamName} (token: ${orgBTeamReg.inviteToken})`);

  // -------------------------------------------------------------------------
  // Dual-persona dashboard routing accounts (Task 14 — dashboard-persona E2E)
  // -------------------------------------------------------------------------
  console.log("\n9. Setting up dual-persona dashboard routing accounts...");

  // --- player account: self family_members row only → hasPlay=true, hasFamily=false ---
  const playerPasswordHash = await hashPassword(TEST_USERS.player.password);
  let [playerUser] = await db
    .select()
    .from(users)
    .where(eq(users.email, TEST_USERS.player.email))
    .limit(1);

  if (!playerUser) {
    [playerUser] = await db
      .insert(users)
      .values({
        email: TEST_USERS.player.email,
        passwordHash: playerPasswordHash,
        firstName: TEST_USERS.player.firstName,
        lastName: TEST_USERS.player.lastName,
        birthDate: TEST_USERS.player.birthDate,
        emailVerified: true,
        phone: TEST_USERS.player.phone,
        phoneVerified: true,
      })
      .returning();
  } else {
    await db.update(users)
      .set({
        passwordHash: playerPasswordHash,
        emailVerified: true,
        phone: TEST_USERS.player.phone,
        phoneVerified: true,
      })
      .where(eq(users.id, playerUser.id));
  }
  await db.delete(userRoles).where(eq(userRoles.userId, playerUser.id));
  await db.insert(userRoles).values({
    userId: playerUser.id,
    roleId: roleMap.parent.id,
    scopeType: "organization",
    scopeId: org.id,
  });

  // Opted-in phone_opt_ins row for the player's phone in the main e2e org —
  // sendSms() gates on opt-in status, so SMS-path tests (payment-hold
  // reminders, waiver-link resend) need this to actually reach the mock
  // recorder instead of failing with reason "not_opted_in".
  await db
    .insert(phoneOptIns)
    .values({
      organizationId: org.id,
      userId: playerUser.id,
      phone: TEST_USERS.player.phone!,
      status: "opted_in",
      optedInAt: new Date(),
      optInSource: "admin_added",
    })
    .onConflictDoUpdate({
      target: [phoneOptIns.organizationId, phoneOptIns.phone],
      set: { status: "opted_in", optedInAt: new Date(), optedOutAt: null },
    });

  // Ensure exactly one self family_members row for the player user.
  // selfUserId has a UNIQUE constraint — only one row per user allowed.
  const [playerSelfRow] = await db
    .select()
    .from(familyMembers)
    .where(eq(familyMembers.selfUserId, playerUser.id))
    .limit(1);

  if (!playerSelfRow) {
    await db.insert(familyMembers).values({
      selfUserId: playerUser.id,
      firstName: TEST_USERS.player.firstName,
      lastName: TEST_USERS.player.lastName,
      birthDate: TEST_USERS.player.birthDate!,
    });
  }
  // Ensure no dependent rows exist for the player user (clean slate)
  await db
    .delete(familyMembers)
    .where(eq(familyMembers.parentUserId, playerUser.id));
  console.log(`   ✓ Player: ${playerUser.email} (self family_members row)`);

  // --- both account: one dependent row + one self row → hasFamily=true, hasPlay=true ---
  const bothPasswordHash = await hashPassword(TEST_USERS.both.password);
  let [bothUser] = await db
    .select()
    .from(users)
    .where(eq(users.email, TEST_USERS.both.email))
    .limit(1);

  if (!bothUser) {
    [bothUser] = await db
      .insert(users)
      .values({
        email: TEST_USERS.both.email,
        passwordHash: bothPasswordHash,
        firstName: TEST_USERS.both.firstName,
        lastName: TEST_USERS.both.lastName,
        birthDate: TEST_USERS.both.birthDate,
        emailVerified: true,
      })
      .returning();
  } else {
    await db.update(users)
      .set({ passwordHash: bothPasswordHash, emailVerified: true })
      .where(eq(users.id, bothUser.id));
  }
  await db.delete(userRoles).where(eq(userRoles.userId, bothUser.id));
  await db.insert(userRoles).values({
    userId: bothUser.id,
    roleId: roleMap.parent.id,
    scopeType: "organization",
    scopeId: org.id,
  });

  // Self row (hasPlay)
  const [bothSelfRow] = await db
    .select()
    .from(familyMembers)
    .where(eq(familyMembers.selfUserId, bothUser.id))
    .limit(1);

  if (!bothSelfRow) {
    await db.insert(familyMembers).values({
      selfUserId: bothUser.id,
      firstName: TEST_USERS.both.firstName,
      lastName: TEST_USERS.both.lastName,
      birthDate: TEST_USERS.both.birthDate!,
    });
  }

  // Dependent row (hasFamily) — idempotent: at least one child must exist
  const [bothDepRow] = await db
    .select()
    .from(familyMembers)
    .where(
      and(
        eq(familyMembers.parentUserId, bothUser.id),
        eq(familyMembers.firstName, "BothChild"),
      )
    )
    .limit(1);

  if (!bothDepRow) {
    await db.insert(familyMembers).values({
      parentUserId: bothUser.id,
      firstName: "BothChild",
      lastName: TEST_USERS.both.lastName,
      birthDate: "2019-04-12",
      gender: "female",
    });
  }
  console.log(`   ✓ Both: ${bothUser.email} (self row + dependent row)`);

  // --- fresh account: user with no family_members rows → /dashboard/start ---
  const freshPasswordHash = await hashPassword(TEST_USERS.fresh.password);
  let [freshUser] = await db
    .select()
    .from(users)
    .where(eq(users.email, TEST_USERS.fresh.email))
    .limit(1);

  if (!freshUser) {
    [freshUser] = await db
      .insert(users)
      .values({
        email: TEST_USERS.fresh.email,
        passwordHash: freshPasswordHash,
        firstName: TEST_USERS.fresh.firstName,
        lastName: TEST_USERS.fresh.lastName,
        emailVerified: true,
      })
      .returning();
  } else {
    await db.update(users)
      .set({ passwordHash: freshPasswordHash, emailVerified: true })
      .where(eq(users.id, freshUser.id));
  }
  await db.delete(userRoles).where(eq(userRoles.userId, freshUser.id));
  await db.insert(userRoles).values({
    userId: freshUser.id,
    roleId: roleMap.parent.id,
    scopeType: "organization",
    scopeId: org.id,
  });

  // Delete any family_members rows that may have accumulated from prior runs
  // (both self and dependent). This keeps the fresh account truly fresh.
  await db.delete(familyMembers).where(eq(familyMembers.selfUserId, freshUser.id));
  await db.delete(familyMembers).where(eq(familyMembers.parentUserId, freshUser.id));
  console.log(`   ✓ Fresh: ${freshUser.email} (no family_members rows)`);

  // --- familyonly account: dependent rows only → hasFamily=true, hasPlay=false ---
  // This is the DEDICATED account for dashboard-persona "family-only" tests.
  // Never used by any other spec, so it cannot be polluted by field rental /
  // drop-in booking tests the way the shared parent@ account can be.
  const familyonlyPasswordHash = await hashPassword(TEST_USERS.familyonly.password);
  let [familyonlyUser] = await db
    .select()
    .from(users)
    .where(eq(users.email, TEST_USERS.familyonly.email))
    .limit(1);

  if (!familyonlyUser) {
    [familyonlyUser] = await db
      .insert(users)
      .values({
        email: TEST_USERS.familyonly.email,
        passwordHash: familyonlyPasswordHash,
        firstName: TEST_USERS.familyonly.firstName,
        lastName: TEST_USERS.familyonly.lastName,
        emailVerified: true,
      })
      .returning();
  } else {
    await db.update(users)
      .set({ passwordHash: familyonlyPasswordHash, emailVerified: true })
      .where(eq(users.id, familyonlyUser.id));
  }
  await db.delete(userRoles).where(eq(userRoles.userId, familyonlyUser.id));
  await db.insert(userRoles).values({
    userId: familyonlyUser.id,
    roleId: roleMap.parent.id,
    scopeType: "organization",
    scopeId: org.id,
  });

  // Defensively remove any self row — this account must never have hasPlay=true.
  await db.delete(familyMembers).where(eq(familyMembers.selfUserId, familyonlyUser.id));

  // Ensure at least one dependent row exists (hasFamily=true).
  const [familyonlyDepRow] = await db
    .select()
    .from(familyMembers)
    .where(
      and(
        eq(familyMembers.parentUserId, familyonlyUser.id),
        eq(familyMembers.firstName, "FamilyChild"),
      )
    )
    .limit(1);

  if (!familyonlyDepRow) {
    await db.insert(familyMembers).values({
      parentUserId: familyonlyUser.id,
      firstName: "FamilyChild",
      lastName: TEST_USERS.familyonly.lastName,
      birthDate: "2020-03-15",
      gender: "female",
    });
  }
  console.log(`   ✓ FamilyOnly: ${familyonlyUser.email} (dependent row only, no self row)`);

  // -------------------------------------------------------------------------
  // Stage 12 — SoccerOne booking fixtures (Phase 2).
  // Idempotent. Skipped if SoccerOne org isn't provisioned yet (run
  // scripts/seed-soccerone-org.ts first).
  // -------------------------------------------------------------------------
  console.log("\n12. Setting up SoccerOne booking fixtures...");

  const [soccerOneOrg] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.slug, "soccerone"))
    .limit(1);

  if (!soccerOneOrg) {
    console.log("   ⚠️  Skipping — SoccerOne org not provisioned. Run scripts/seed-soccerone-org.ts first.");
  } else {
    // The fixture org must be active or domain resolution rejects it and the
    // org-scoped public APIs return empty on soccerone hosts — a soft-archived
    // fixture silently blanks the SoccerOne e2e surface. Self-heal it here so
    // a stale org state can't invalidate the fixtures seeded below.
    if (soccerOneOrg.status !== "active") {
      await db
        .update(organizations)
        .set({ status: "active" })
        .where(eq(organizations.id, soccerOneOrg.id));
      console.log(`   ✓ Reactivated SoccerOne org (was ${soccerOneOrg.status})`);
    }

    // 12a. SoccerOne Downtown location (provisioned by Phase 1).
    // Slug is bare "downtown" (not "soccerone-downtown") to match prod:
    // gosoccerone.com resolves to the single Aspire org, whose real
    // location slugs are bare (see soccerone-routing.ts:5-11 and
    // rent.astro's locationSlug). scripts/seed-soccerone-org.ts still
    // provisions this fixture under the legacy "soccerone-downtown" slug on
    // a fresh DB, so rename it in place here (org-scoped lookup, so this
    // can only touch the SoccerOne org's own row) rather than inserting a
    // duplicate — keeps the FKs from the program/season/venue below pointed
    // at the same row. Mirrors the Worthington rename further down.
    let [soccerOneDowntown] = await db
      .select()
      .from(locations)
      .where(
        and(
          eq(locations.organizationId, soccerOneOrg.id),
          eq(locations.slug, "downtown"),
        ),
      )
      .limit(1);

    if (!soccerOneDowntown) {
      const [legacyDowntown] = await db
        .select()
        .from(locations)
        .where(
          and(
            eq(locations.organizationId, soccerOneOrg.id),
            eq(locations.slug, "soccerone-downtown"),
          ),
        )
        .limit(1);

      if (!legacyDowntown) {
        throw new Error("SoccerOne Downtown location missing — re-run scripts/seed-soccerone-org.ts");
      }

      [soccerOneDowntown] = await db
        .update(locations)
        .set({ slug: "downtown" })
        .where(eq(locations.id, legacyDowntown.id))
        .returning();
      console.log(`   ✓ Renamed legacy SoccerOne Downtown location slug: ${soccerOneDowntown.id}`);
    } else {
      console.log(`   ✓ SoccerOne Downtown location already exists: ${soccerOneDowntown.id}`);
    }

    // 12b. SoccerOne sport (Soccer — org-scoped row).
    let [soccerOneSport] = await db
      .select()
      .from(sports)
      .where(
        and(
          eq(sports.organizationId, soccerOneOrg.id),
          eq(sports.slug, "soccer"),
        ),
      )
      .limit(1);

    if (!soccerOneSport) {
      [soccerOneSport] = await db
        .insert(sports)
        .values({
          organizationId: soccerOneOrg.id,
          name: "Soccer",
          slug: "soccer",
          icon: "⚽",
          color: "#22c55e",
        })
        .returning();
    }
    console.log(`   ✓ SoccerOne Sport: ${soccerOneSport.name}`);

    // 12c. SoccerOne league program + open season.
    let [soccerOneProgram] = await db
      .select()
      .from(programs)
      .where(eq(programs.slug, "soccerone-adult-coed-league"))
      .limit(1);

    if (!soccerOneProgram) {
      [soccerOneProgram] = await db
        .insert(programs)
        .values({
          sportId: soccerOneSport.id,
          locationId: soccerOneDowntown.id,
          name: "Adult Coed League",
          slug: "soccerone-adult-coed-league",
          programType: "league",
          audienceType: "adults",
          active: true,
          isTest: false,
        })
        .returning();
    }
    console.log(`   ✓ SoccerOne Program: ${soccerOneProgram.name}`);

    let [soccerOneSeason] = await db
      .select()
      .from(seasons)
      .where(eq(seasons.slug, "soccerone-adult-coed-spring-2026"))
      .limit(1);

    const sixWeeksOut = new Date(Date.now() + 6 * 7 * 24 * 60 * 60 * 1000);
    const tenWeeksOut = new Date(Date.now() + 10 * 7 * 24 * 60 * 60 * 1000);

    if (!soccerOneSeason) {
      [soccerOneSeason] = await db
        .insert(seasons)
        .values({
          programId: soccerOneProgram.id,
          name: "Adult Coed — Spring 2026",
          slug: "soccerone-adult-coed-spring-2026",
          status: "open",
          isTest: false,
          startDate: sixWeeksOut.toISOString().slice(0, 10),
          endDate: tenWeeksOut.toISOString().slice(0, 10),
          priceCents: 18000,
          maxParticipants: 80,
          termSlug: "spring-2026",
          termLabel: "Spring 2026",
        })
        .returning();
    } else {
      // Keep the season future-dated on re-runs. The shared CI DB accumulates,
      // and the SoccerOne /leagues page hides past-start seasons — a stale
      // startDate would silently empty the finder and skip its e2e spec.
      [soccerOneSeason] = await db
        .update(seasons)
        .set({
          startDate: sixWeeksOut.toISOString().slice(0, 10),
          endDate: tenWeeksOut.toISOString().slice(0, 10),
          termSlug: "spring-2026",
          termLabel: "Spring 2026",
        })
        .where(eq(seasons.id, soccerOneSeason.id))
        .returning();
    }
    console.log(`   ✓ SoccerOne Season: ${soccerOneSeason.name} (status=${soccerOneSeason.status})`);

    // Sibling spring division — the earliest-starting term on staging must
    // hold 2+ open seasons so the homepage's multi-division term-aggregate
    // hero (featured-term.ts) renders against real fixture data.
    let [soccerOneSeasonB] = await db
      .select()
      .from(seasons)
      .where(and(
        eq(seasons.programId, soccerOneSeason.programId),
        eq(seasons.slug, "soccerone-adult-coed-b-spring-2026"),
      ))
      .limit(1);
    if (!soccerOneSeasonB) {
      [soccerOneSeasonB] = await db
        .insert(seasons)
        .values({
          programId: soccerOneSeason.programId,
          name: "Adult Coed B — Spring 2026",
          slug: "soccerone-adult-coed-b-spring-2026",
          status: "open",
          isTest: false,
          startDate: sixWeeksOut.toISOString().slice(0, 10),
          endDate: tenWeeksOut.toISOString().slice(0, 10),
          priceCents: 18000,
          maxParticipants: 80,
          termSlug: "spring-2026",
          termLabel: "Spring 2026",
        })
        .returning();
    } else {
      [soccerOneSeasonB] = await db
        .update(seasons)
        .set({
          status: "open",
          startDate: sixWeeksOut.toISOString().slice(0, 10),
          endDate: tenWeeksOut.toISOString().slice(0, 10),
          termSlug: "spring-2026",
          termLabel: "Spring 2026",
        })
        .where(eq(seasons.id, soccerOneSeasonB.id))
        .returning();
    }
    console.log(`   ✓ SoccerOne Season: ${soccerOneSeasonB.name} (status=${soccerOneSeasonB.status})`);

    // 12c-1b. SoccerOne Downtown fall season — dayOfWeek-scheduled so the
    // rebuilt /downtown page's live "What's Happening" fall rows (derived
    // from dayOfWeek exactly like Worthington's) have real data to render
    // instead of hiding the fall tab entirely. Hangs off the existing
    // Downtown program (soccerOneProgram, above) rather than a new one —
    // Downtown only has the one adult program, unlike Worthington which
    // got its own location + program.
    let [soccerOneDowntownFallSeason] = await db
      .select()
      .from(seasons)
      .where(eq(seasons.slug, "soccerone-downtown-fall-coed-6v6"))
      .limit(1);

    const downtownFallStart = new Date(Date.now() + 9 * 7 * 24 * 60 * 60 * 1000);
    const downtownFallEnd = new Date(Date.now() + 16 * 7 * 24 * 60 * 60 * 1000);
    const downtownRegCloses = new Date(Date.now() + 7 * 7 * 24 * 60 * 60 * 1000);

    if (!soccerOneDowntownFallSeason) {
      [soccerOneDowntownFallSeason] = await db
        .insert(seasons)
        .values({
          programId: soccerOneProgram.id,
          name: "Co-Ed 6v6 — Fall",
          slug: "soccerone-downtown-fall-coed-6v6",
          status: "open",
          isTest: false,
          startDate: downtownFallStart.toISOString().slice(0, 10),
          endDate: downtownFallEnd.toISOString().slice(0, 10),
          registrationCloses: downtownRegCloses,
          priceCents: 12000,
          teamPriceCents: 105000,
          depositCents: 20000,
          signupModes: ["individual", "team"],
          dayOfWeek: "wed",
          startTime: "18:00",
          endTime: "23:00",
        })
        .returning();
    } else {
      // Keep future-dated on re-runs — mirrors the Worthington pattern
      // below (shared CI/staging DB accumulates; a stale startDate/
      // registrationCloses would silently fall out of the "open" live-
      // until window — see the SQL twin in src/pages/api/public/seasons.ts).
      [soccerOneDowntownFallSeason] = await db
        .update(seasons)
        .set({
          status: "open",
          startDate: downtownFallStart.toISOString().slice(0, 10),
          endDate: downtownFallEnd.toISOString().slice(0, 10),
          registrationCloses: downtownRegCloses,
        })
        .where(eq(seasons.id, soccerOneDowntownFallSeason.id))
        .returning();
    }
    console.log(`   ✓ SoccerOne Downtown Fall Season: ${soccerOneDowntownFallSeason.name} (dayOfWeek=${soccerOneDowntownFallSeason.dayOfWeek})`);

    // 12c-2. SoccerOne Worthington location + adult program + fall seasons.
    // Staging has no Worthington location or seasons yet, so the rebuilt
    // /worthington page's live season bindings (hero CTA, fall pricing,
    // dayOfWeek rhythm) would be unverifiable without these fixtures.
    // Idempotent get-or-create, mirroring the Downtown program/season
    // pattern above.
    //
    // Slug is bare "worthington" (not "soccerone-worthington") to match
    // prod: gosoccerone.com resolves to the single Aspire org, whose real
    // location slugs are bare (see soccerone-routing.ts:5-11 and
    // rent.astro's locationSlug). The `locations` unique constraint is
    // per-org (organizationId, slug) — see organizations.ts:203 — so a
    // bare "worthington" row scoped to the SoccerOne fixture org cannot
    // collide with the Aspire staging org's own "worthington" row.
    let [soccerOneWorthington] = await db
      .select()
      .from(locations)
      .where(
        and(
          eq(locations.organizationId, soccerOneOrg.id),
          eq(locations.slug, "worthington"),
        ),
      )
      .limit(1);

    if (!soccerOneWorthington) {
      // One-time migration: earlier seed runs created this fixture under
      // the retired "soccerone-worthington" slug. Rename it in place
      // (org-scoped lookup, so this can only touch the SoccerOne org's own
      // row) rather than inserting a duplicate — keeps the FKs from the
      // program/seasons below pointed at the same row.
      const [legacyWorthington] = await db
        .select()
        .from(locations)
        .where(
          and(
            eq(locations.organizationId, soccerOneOrg.id),
            eq(locations.slug, "soccerone-worthington"),
          ),
        )
        .limit(1);

      if (legacyWorthington) {
        [soccerOneWorthington] = await db
          .update(locations)
          .set({ slug: "worthington" })
          .where(eq(locations.id, legacyWorthington.id))
          .returning();
        console.log(`   ✓ Renamed legacy SoccerOne Worthington location slug: ${soccerOneWorthington.id}`);
      } else {
        [soccerOneWorthington] = await db
          .insert(locations)
          .values({
            organizationId: soccerOneOrg.id,
            name: "SoccerOne Worthington",
            slug: "worthington",
            city: "Worthington",
            state: "OH",
            country: "US",
            timezone: "America/New_York",
            active: true,
            sortOrder: 2,
          })
          .returning();
        console.log(`   ✓ Created SoccerOne Worthington location: ${soccerOneWorthington.id}`);
      }
    } else {
      console.log(`   ✓ SoccerOne Worthington location already exists: ${soccerOneWorthington.id}`);
    }

    let [soccerOneWorthingtonProgram] = await db
      .select()
      .from(programs)
      .where(eq(programs.slug, "soccerone-worthington-adult-7v7"))
      .limit(1);

    if (!soccerOneWorthingtonProgram) {
      [soccerOneWorthingtonProgram] = await db
        .insert(programs)
        .values({
          sportId: soccerOneSport.id,
          locationId: soccerOneWorthington.id,
          name: "Worthington Adult 7v7",
          slug: "soccerone-worthington-adult-7v7",
          programType: "league",
          audienceType: "adults",
          active: true,
          isTest: false,
        })
        .returning();
    }
    console.log(`   ✓ SoccerOne Worthington Program: ${soccerOneWorthingtonProgram.name}`);

    // Fall fixture dates: ~9 weeks out start, ~16 weeks out end, registration
    // closes ~7 weeks out (a timestamp) — all future so the /worthington live
    // bindings (featured season, registrationCloses, price) stay verifiable
    // on re-seed. Refreshed on every run, mirroring the Downtown season above.
    const worthingtonFallStart = new Date(Date.now() + 9 * 7 * 24 * 60 * 60 * 1000);
    const worthingtonFallEnd = new Date(Date.now() + 16 * 7 * 24 * 60 * 60 * 1000);
    const worthingtonRegCloses = new Date(Date.now() + 7 * 7 * 24 * 60 * 60 * 1000);

    const worthingtonFallSeasons = [
      { slug: "soccerone-worthington-fall-coed-30", name: "Co-Ed 30+ — Fall", dayOfWeek: "sun" },
      { slug: "soccerone-worthington-fall-mens-c", name: "Men's C — Fall", dayOfWeek: "mon" },
      { slug: "soccerone-worthington-fall-womens-open", name: "Women's Open — Fall", dayOfWeek: "wed" },
      // Futsal on Tuesday + Thursday mirrors the prod catalog shape — it
      // exercises the location page's fall-row dedupe branches (no doubled
      // futsal suffix; live Thursday suppresses the static pickup row) and
      // the LEAGUES + FUTSAL tag variant, which plain sun/mon/wed can't.
      { slug: "soccerone-worthington-fall-coed-futsal", name: "Co-Ed Futsal — Fall", dayOfWeek: "tue" },
      { slug: "soccerone-worthington-fall-mens-futsal", name: "Men's Futsal — Fall", dayOfWeek: "thu" },
    ] as const;

    for (const fixture of worthingtonFallSeasons) {
      let [worthingtonSeason] = await db
        .select()
        .from(seasons)
        .where(eq(seasons.slug, fixture.slug))
        .limit(1);

      if (!worthingtonSeason) {
        [worthingtonSeason] = await db
          .insert(seasons)
          .values({
            programId: soccerOneWorthingtonProgram.id,
            name: fixture.name,
            slug: fixture.slug,
            status: "open",
            isTest: false,
            startDate: worthingtonFallStart.toISOString().slice(0, 10),
            endDate: worthingtonFallEnd.toISOString().slice(0, 10),
            registrationCloses: worthingtonRegCloses,
            priceCents: 12000,
            teamPriceCents: 105000,
            depositCents: 20000,
            signupModes: ["individual", "team"],
            dayOfWeek: fixture.dayOfWeek,
            startTime: "18:00",
            endTime: "23:00",
            // Shared term across the division fixtures — exercises the
            // multi-division term-aggregate hero (featured-term.ts).
            termSlug: "fall-2026",
            termLabel: "Fall 2026",
          })
          .returning();
      } else {
        // Keep future-dated on re-runs — the shared CI/staging DB
        // accumulates, and a stale startDate/registrationCloses would
        // silently fall out of the "open" live-until window (see the SQL
        // twin in src/pages/api/public/seasons.ts).
        [worthingtonSeason] = await db
          .update(seasons)
          .set({
            status: "open",
            startDate: worthingtonFallStart.toISOString().slice(0, 10),
            endDate: worthingtonFallEnd.toISOString().slice(0, 10),
            registrationCloses: worthingtonRegCloses,
            termSlug: "fall-2026",
            termLabel: "Fall 2026",
          })
          .where(eq(seasons.id, worthingtonSeason.id))
          .returning();
      }
      console.log(`   ✓ SoccerOne Worthington Season: ${worthingtonSeason.name} (dayOfWeek=${worthingtonSeason.dayOfWeek})`);
    }

    // 12d. SoccerOne rental-enabled venue.
    let [soccerOneVenue] = await db
      .select()
      .from(venues)
      .where(eq(venues.slug, "soccerone-downtown-field-1"))
      .limit(1);

    if (!soccerOneVenue) {
      [soccerOneVenue] = await db
        .insert(venues)
        .values({
          locationId: soccerOneDowntown.id,
          name: "Downtown — Field 1",
          slug: "soccerone-downtown-field-1",
          rentalEnabled: true,
          rentalHourlyRateCents: 9000,
          rentalOpenMinute: 7 * 60,    // 7am
          rentalCloseMinute: 23 * 60,  // 11pm
          fieldCount: 1,
        })
        .returning();
    }
    console.log(`   ✓ SoccerOne Venue: ${soccerOneVenue.name} (rentalEnabled=${soccerOneVenue.rentalEnabled})`);

    // 12e. Drop-in session — one upcoming "Evening Coed Pickup."
    // dropInSessions has no slug; use org+venue+sportOrClassLabel as the
    // idempotency key. On re-seed, refresh startsAt/endsAt so it stays future.
    const tomorrow6pm = new Date();
    tomorrow6pm.setDate(tomorrow6pm.getDate() + 1);
    tomorrow6pm.setHours(18, 0, 0, 0);
    const tomorrow730pm = new Date(tomorrow6pm);
    tomorrow730pm.setMinutes(tomorrow6pm.getMinutes() + 90);

    let [soccerOneDropIn] = await db
      .select()
      .from(dropInSessions)
      .where(
        and(
          eq(dropInSessions.organizationId, soccerOneOrg.id),
          eq(dropInSessions.venueId, soccerOneVenue.id),
          eq(dropInSessions.sportOrClassLabel, "Evening Coed Pickup"),
        ),
      )
      .limit(1);

    if (!soccerOneDropIn) {
      [soccerOneDropIn] = await db
        .insert(dropInSessions)
        .values({
          organizationId: soccerOneOrg.id,
          venueId: soccerOneVenue.id,
          kind: "pickup",
          sportOrClassLabel: "Evening Coed Pickup",
          formatLabel: "7v7 coed pickup soccer",
          startsAt: tomorrow6pm,
          endsAt: tomorrow730pm,
          capacity: 14,
          skillLevel: "intermediate",
          audience: "adults",
          sessionRateCents: 1200,
        })
        .returning();
    } else {
      // Refresh startsAt/endsAt so the session stays future on repeated seed runs.
      [soccerOneDropIn] = await db
        .update(dropInSessions)
        .set({ startsAt: tomorrow6pm, endsAt: tomorrow730pm })
        .where(eq(dropInSessions.id, soccerOneDropIn.id))
        .returning();
    }
    console.log(`   ✓ SoccerOne Drop-In: ${soccerOneDropIn.sportOrClassLabel} (capacity=${soccerOneDropIn.capacity})`);
  }

  // Stage 13 — SoccerOne membership tier + members (Phase 3).
  // Idempotent. Mirrors Stage 12 — skipped if SoccerOne org isn't provisioned.
  console.log("\n🏷  Stage 13 — SoccerOne membership tier + members…");
  const [soccerOneOrgForMembership] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.slug, "soccerone"))
    .limit(1);
  if (!soccerOneOrgForMembership) {
    console.log(
      "   ⚠️  Skipping — SoccerOne org not provisioned. Run scripts/seed-soccerone-org.ts first.",
    );
  } else {
    const soccerOneOrgId = soccerOneOrgForMembership.id;

    // Tier: "Founder" — $49/mo monthly, 25% rental discount (founding member benefit).
    let [founderTier] = await db
      .select()
      .from(membershipTiers)
      .where(
        and(
          eq(membershipTiers.organizationId, soccerOneOrgId),
          eq(membershipTiers.name, "Founder"),
        ),
      )
      .limit(1);
    if (!founderTier) {
      [founderTier] = await db
        .insert(membershipTiers)
        .values({
          organizationId: soccerOneOrgId,
          name: "Founder",
          monthlyPriceCents: 4900,
          annualPriceCents: 49000,
          benefits: { rental_discount_pct: 25 },
          stripePriceIdMonthly: "price_test_soccerone_founder_monthly",
          stripePriceIdAnnual: "price_test_soccerone_founder_annual",
          displayOrder: 1,
          isActive: true,
        })
        .returning();
      console.log(`   ✓ Created tier "Founder" (${founderTier.id})`);
    } else {
      // Idempotent: merge rental_discount_pct into existing benefits without
      // clobbering any other benefit keys already set in prod/staging.
      const merged = { ...(founderTier.benefits as Record<string, unknown>), rental_discount_pct: 25 };
      [founderTier] = await db
        .update(membershipTiers)
        .set({ benefits: merged, updatedAt: new Date() })
        .where(eq(membershipTiers.id, founderTier.id))
        .returning();
      console.log(`   ✓ Tier "Founder" already exists — rental_discount_pct ensured at 25`);
    }

    // Tier: "Member" — $29/mo monthly, 10% rental discount.
    let [memberTier] = await db
      .select()
      .from(membershipTiers)
      .where(
        and(
          eq(membershipTiers.organizationId, soccerOneOrgId),
          eq(membershipTiers.name, "Member"),
        ),
      )
      .limit(1);
    if (!memberTier) {
      [memberTier] = await db
        .insert(membershipTiers)
        .values({
          organizationId: soccerOneOrgId,
          name: "Member",
          monthlyPriceCents: 2900,
          annualPriceCents: 29000,
          benefits: { rental_discount_pct: 10 },
          stripePriceIdMonthly: "price_test_soccerone_member_monthly",
          stripePriceIdAnnual: "price_test_soccerone_member_annual",
          displayOrder: 2,
          isActive: true,
        })
        .returning();
      console.log(`   ✓ Created tier "Member" (${memberTier.id})`);
    } else {
      // Idempotent: merge rental_discount_pct into existing benefits.
      const merged = { ...(memberTier.benefits as Record<string, unknown>), rental_discount_pct: 10 };
      [memberTier] = await db
        .update(membershipTiers)
        .set({ benefits: merged, updatedAt: new Date() })
        .where(eq(membershipTiers.id, memberTier.id))
        .returning();
      console.log(`   ✓ Tier "Member" already exists — rental_discount_pct ensured at 10`);
    }

    // Member + pending user. No upsertUser helper exists in this file; mirror
    // the Stage 1 inline pattern (select-then-insert-or-update password).
    const seededUserPasswordHash = await hashPassword("TestMember123!");

    const ensureUser = async (
      email: string,
      firstName: string,
      lastName: string,
    ) => {
      let [u] = await db
        .select()
        .from(users)
        .where(eq(users.email, email))
        .limit(1);
      if (!u) {
        [u] = await db
          .insert(users)
          .values({
            email,
            passwordHash: seededUserPasswordHash,
            firstName,
            lastName,
            emailVerified: true,
          })
          .returning();
      } else {
        await db
          .update(users)
          .set({ passwordHash: seededUserPasswordHash, emailVerified: true })
          .where(eq(users.id, u.id));
      }
      return u;
    };

    const memberEmail = "member@test.soccerone.com";
    const pendingEmail = "member-pending@test.soccerone.com";
    const memberUser = await ensureUser(memberEmail, "Member", "SoccerOne");
    await ensureUser(pendingEmail, "Pending", "SoccerOne");

    const [existingMembership] = await db
      .select()
      .from(memberships)
      .where(
        and(
          eq(memberships.userId, memberUser.id),
          eq(memberships.organizationId, soccerOneOrgId),
        ),
      )
      .limit(1);
    if (!existingMembership) {
      await db.insert(memberships).values({
        userId: memberUser.id,
        organizationId: soccerOneOrgId,
        tierId: memberTier.id,
        status: "active",
        billingInterval: "month",
        startedAt: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        stripeSubscriptionId: "sub_test_seeded_member",
        stripeCustomerId: "cus_test_seeded_member",
      });
      console.log(`   ✓ Created active membership for ${memberEmail}`);
    } else {
      console.log(`   ✓ Active membership for ${memberEmail} already exists`);
    }
  }

  // Stage 14 — Post-event feedback fixtures (Task 9 — NPS promoter E2E spec).
  console.log("\n14. Setting up post-event feedback fixtures...");
  await seedFeedbackFixtures(db, org.id);

  // Stage 15 — Curriculum development-radar fixture (Task 11).
  console.log("\n15. Setting up curriculum development-radar fixture...");
  await seedCurriculumRadarFixture(db, org.id);

  // Stage 16 — Training walkthrough fixtures (Phase 2).
  console.log("\n16. Setting up training walkthrough fixtures...");
  await seedTrainingFixtures(db, org.id, season.id, team.id);

  // Stage 17 — Referee close-out fixture (Task 5). Must follow stage 16 so the
  // training referee user it assigns already exists.
  console.log("\n17. Setting up referee close-out fixture...");
  await seedRefereeCloseoutFixture(db, org.id);

  // Stage 18 — Host portal fixtures (Task 15).
  console.log("\n18. Setting up host portal fixtures...");
  await seedHostPortalFixture(db, org.id, venue.id, hostUser.id, parentUser.id);

  console.log("\n✅ E2E test data seeded successfully!");
  console.log("\n📋 Test Credentials:");
  console.log("─".repeat(50));
  console.log(`Admin:       ${TEST_USERS.admin.email} / ${TEST_USERS.admin.password}`);
  console.log(`AdminOrgB:   ${TEST_USERS.adminOrgB.email} / ${TEST_USERS.adminOrgB.password}`);
  console.log(`Coach:       ${TEST_USERS.coach.email} / ${TEST_USERS.coach.password}`);
  console.log(`Parent:      ${TEST_USERS.parent.email} / ${TEST_USERS.parent.password}`);
  console.log(`AdultSelf:   ${TEST_USERS.adultSelf.email} / ${TEST_USERS.adultSelf.password}`);
  console.log(`Player:      ${TEST_USERS.player.email} / ${TEST_USERS.player.password}`);
  console.log(`Both:        ${TEST_USERS.both.email} / ${TEST_USERS.both.password}`);
  console.log(`Fresh:       ${TEST_USERS.fresh.email} / ${TEST_USERS.fresh.password}`);
  console.log(`FamilyOnly:  ${TEST_USERS.familyonly.email} / ${TEST_USERS.familyonly.password}`);
  console.log(`MediaStaff:  ${TEST_USERS.mediaStaff.email} / ${TEST_USERS.mediaStaff.password}`);
  console.log(`MediaEditor: ${TEST_USERS.mediaEditor.email} / ${TEST_USERS.mediaEditor.password}`);
  console.log(`TrainingReferee: ${TRAINING_USERS.referee.email} / ${TRAINING_USERS.referee.password}`);
  console.log(`Host:        ${TEST_USERS.host.email} / ${TEST_USERS.host.password}`);
  console.log("─".repeat(50));
}

// Run only when executed directly (via tsx/node), not when imported as a module.
// This prevents any `import` of this file (e.g. importing E2E_RENTAL_VENUE_ID in
// a test) from triggering the full seed.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  seedE2ETests()
    .catch((error) => {
      console.error("❌ E2E seeding failed:", error);
      process.exit(1);
    })
    .finally(() => {
      process.exit(0);
    });
}
