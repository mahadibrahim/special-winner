// scripts/seed-demo-day.ts
//
// Demo-day seed for the 2026-08-07 partner demo. Branch-local; delete after
// the demo (repo convention for one-off scripts). Idempotent; re-run the
// morning of the demo to re-anchor today's game/session to demo day.
// Run: ./scripts/with-bws.sh npx tsx scripts/seed-demo-day.ts
import "dotenv/config";
import crypto from "node:crypto";
import { and, asc, eq, inArray, like } from "drizzle-orm";
import { getDb } from "../src/lib/db";
import { hashPassword } from "../src/lib/auth/password";
import {
  users, roles, userRoles,
  organizations, locations,
  sports, programs, seasons, ageGroups,
  teams, rosters, games, gameOfficials, venues, attendance, coachNotes,
  familyMembers, registrations,
  payments,
  feedbackRequests, npsResponses, refereeRatings,
  timeEntries,
} from "../src/lib/db/schema";
import { sessionPlans } from "../src/lib/db/schema/practice-planning";
import { playerAssessments } from "../src/lib/db/schema/assessments";
import { resolvePerson } from "../src/lib/registrations/resolve-person";

type Ctx = {
  db: ReturnType<typeof getDb>;
  now: Date;
  org: any;
  location: any;
  venue: any;
  roleMap: Record<string, any>;
  demo: any;
};

const STAGING_HOST = "switchyard.proxy.rlwy.net:31999"; // pinned staging Railway proxy host:port
const url = process.env.DATABASE_URL ?? "";
let host = "";
try { host = new URL(url).host; } catch { /* fallthrough to refusal */ }
if (host !== STAGING_HOST) {
  console.error(`Refusing to run: DATABASE_URL host "${host}" is not the pinned staging host.`);
  process.exit(1);
}

export const DEMO_PASSWORD = "AspireDemo2026!";
const NOW = new Date();
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86400_000);
const daysFromNow = (n: number) => new Date(NOW.getTime() + n * 86400_000);
const dstr = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const at = (d: Date, hour: number, minute = 0) => {
  const c = new Date(d); c.setHours(hour, minute, 0, 0); return c;
};

async function ensureUser(db: ReturnType<typeof getDb>, opts: {
  email: string; firstName: string; lastName: string; password?: string;
}) {
  const passwordHash = opts.password ? await hashPassword(opts.password) : null;
  let [u] = await db.select().from(users)
    .where(eq(users.email, opts.email)).orderBy(asc(users.createdAt)).limit(1);
  if (!u) {
    [u] = await db.insert(users).values({
      email: opts.email, passwordHash,
      firstName: opts.firstName, lastName: opts.lastName, emailVerified: true,
    }).returning();
  } else if (opts.password) {
    await db.update(users).set({ passwordHash, emailVerified: true }).where(eq(users.id, u.id));
  }
  return { id: u.id, email: u.email, firstName: opts.firstName, lastName: opts.lastName };
}

async function ensureRole(db: ReturnType<typeof getDb>, userId: string, roleId: string,
  scope: { scopeType: "global" } | { scopeType: "organization"; scopeId: string }) {
  await db.transaction(async (tx) => {
    await tx.delete(userRoles).where(eq(userRoles.userId, userId)); // e2e idiom: single-role demo users
    await tx.insert(userRoles).values({ userId, roleId, ...scope });
  });
}

async function upsertSeason(db: Ctx["db"], programId: string, slug: string, fields: Record<string, unknown>) {
  // e2e idiom :1739-1783 — select by (programId, slug), insert else full re-sync update.
  let [s] = await db.select().from(seasons)
    .where(and(eq(seasons.programId, programId), eq(seasons.slug, slug)))
    .orderBy(asc(seasons.createdAt)).limit(1);
  if (!s) [s] = await db.insert(seasons).values({ programId, slug, ...fields } as any).returning();
  else [s] = await db.update(seasons).set(fields as any).where(eq(seasons.id, s.id)).returning();
  return s;
}

async function seedYouthCatalog(ctx: Ctx) {
  const { db, org, location } = ctx;
  let [sport] = await db.select().from(sports)
    .where(and(eq(sports.organizationId, org.id), eq(sports.slug, "soccer")))
    .orderBy(asc(sports.createdAt)).limit(1);
  if (!sport) [sport] = await db.insert(sports).values({ organizationId: org.id, name: "Soccer", slug: "soccer" }).returning();

  let [u8] = await db.select().from(ageGroups)
    .where(and(eq(ageGroups.organizationId, org.id), eq(ageGroups.name, "U8")))
    .orderBy(asc(ageGroups.createdAt)).limit(1);
  if (!u8) [u8] = await db.insert(ageGroups).values({ organizationId: org.id, name: "U8", minAge: 6, maxAge: 8 }).returning();

  let [program] = await db.select().from(programs)
    .where(and(eq(programs.locationId, location.id), eq(programs.slug, "youth-soccer")))
    .orderBy(asc(programs.createdAt)).limit(1);
  const programFields = {
    sportId: sport.id, name: "Youth Soccer League",
    description: "Recreational youth soccer with a development-first curriculum. Weekly practice plus Saturday games.",
    programType: "league" as const, audienceType: "parents", active: true, isTest: false,
  };
  if (!program) [program] = await db.insert(programs).values({ locationId: location.id, slug: "youth-soccer", ...programFields }).returning();
  else [program] = await db.update(programs).set(programFields).where(eq(programs.id, program.id)).returning();

  const shared = { ageGroupId: u8.id, priceCents: 19500, signupModes: ["individual"], isTest: false };
  const fall25 = await upsertSeason(db, program.id, "fall-2025", { ...shared,
    name: "Fall 2025", startDate: dstr(daysAgo(330)), endDate: dstr(daysAgo(260)), status: "completed" });
  const spring26 = await upsertSeason(db, program.id, "spring-2026", { ...shared,
    name: "Spring 2026", startDate: dstr(daysAgo(150)), endDate: dstr(daysAgo(80)), status: "completed" });
  const summer26 = await upsertSeason(db, program.id, "summer-2026", { ...shared,
    name: "Summer 2026", startDate: dstr(daysAgo(35)), endDate: dstr(daysFromNow(25)), status: "active",
    registrationOpens: daysAgo(90), registrationCloses: daysAgo(40),
    scheduleNotes: "Practice Tue 5:30pm · Games Sat mornings" });
  const fall26 = await upsertSeason(db, program.id, "fall-2026", { ...shared,
    name: "Fall 2026", startDate: dstr(daysFromNow(33)), endDate: dstr(daysFromNow(100)), status: "open",
    registrationOpens: daysAgo(20), registrationCloses: daysFromNow(26),
    scheduleNotes: "Practice Tue 5:30pm · Games Sat mornings" });

  // Junk tidy: hide e2e fixtures from every public surface (isTest is filtered everywhere).
  await db.update(seasons).set({ isTest: true }).where(like(seasons.slug, "e2e-%"));
  await db.update(programs).set({ isTest: true }).where(like(programs.slug, "e2e-%"));

  console.log("✓ youth catalog", { program: program.slug });
  return { sportId: sport.id, programId: program.id, ageGroupU8Id: u8.id,
    ys: { fall25: fall25.id, spring26: spring26.id, summer26: summer26.id, fall26: fall26.id } };
}

async function seedFlagCatalog(ctx: Ctx) {
  const { db, org, location } = ctx;
  let [sport] = await db.select().from(sports)
    .where(and(eq(sports.organizationId, org.id), eq(sports.slug, "flag-football")))
    .orderBy(asc(sports.createdAt)).limit(1);
  if (!sport) [sport] = await db.insert(sports).values({ organizationId: org.id, name: "Flag Football", slug: "flag-football" }).returning();

  let [adult] = await db.select().from(ageGroups)
    .where(and(eq(ageGroups.organizationId, org.id), eq(ageGroups.name, "Adult 18+")))
    .orderBy(asc(ageGroups.createdAt)).limit(1);
  if (!adult) [adult] = await db.insert(ageGroups).values({ organizationId: org.id, name: "Adult 18+", minAge: 18, maxAge: 99 }).returning();

  let [program] = await db.select().from(programs)
    .where(and(eq(programs.locationId, location.id), eq(programs.slug, "adult-flag-football")))
    .orderBy(asc(programs.createdAt)).limit(1);
  const pf = { sportId: sport.id, name: "Adult Flag Football",
    description: "4v4 co-ed flag football. Weeknight games, 7-game seasons.",
    programType: "league" as const, audienceType: "adults", active: true, isTest: false };
  if (!program) [program] = await db.insert(programs).values({ locationId: location.id, slug: "adult-flag-football", ...pf }).returning();
  else [program] = await db.update(programs).set(pf).where(eq(programs.id, program.id)).returning();

  const div = (skill: "b" | "c") => ({
    ageGroupId: adult.id, priceCents: 10500, teamPriceCents: 79500,
    signupModes: ["team", "individual"], divisionGender: "coed", skillLevel: skill,
    dayOfWeek: "wed", startTime: "18:30", endTime: "22:00", isTest: false,
  });
  // Past term — fully played (archive + standings history).
  const springB = await upsertSeason(db, program.id, "flag-spring-2026-coed-b", { ...div("b"),
    name: "Spring 2026 — Coed B", termSlug: "spring-2026", termLabel: "Spring 2026",
    startDate: dstr(daysAgo(140)), endDate: dstr(daysAgo(90)), status: "completed" });
  const springC = await upsertSeason(db, program.id, "flag-spring-2026-coed-c", { ...div("c"),
    name: "Spring 2026 — Coed C", termSlug: "spring-2026", termLabel: "Spring 2026",
    startDate: dstr(daysAgo(140)), endDate: dstr(daysAgo(90)), status: "completed" });
  // Current term — mid-season (late-join window open).
  const summerB = await upsertSeason(db, program.id, "flag-summer-2026-coed-b", { ...div("b"),
    name: "Summer 2026 — Coed B", termSlug: "summer-2026", termLabel: "Summer 2026",
    startDate: dstr(daysAgo(28)), endDate: dstr(daysFromNow(21)), status: "open",
    registrationOpens: daysAgo(30), registrationCloses: daysFromNow(2) });
  // Upcoming term — forming (interest phase).
  const fallB = await upsertSeason(db, program.id, "flag-fall-2026-coed-b", { ...div("b"),
    name: "Fall 2026 — Coed B", termSlug: "fall-2026", termLabel: "Fall 2026",
    startDate: dstr(daysFromNow(35)), endDate: dstr(daysFromNow(85)), status: "forming",
    registrationOpens: daysAgo(10), registrationCloses: daysFromNow(28) });
  const fallC = await upsertSeason(db, program.id, "flag-fall-2026-coed-c", { ...div("c"),
    name: "Fall 2026 — Coed C", termSlug: "fall-2026", termLabel: "Fall 2026",
    startDate: dstr(daysFromNow(35)), endDate: dstr(daysFromNow(85)), status: "forming",
    registrationOpens: daysAgo(10), registrationCloses: daysFromNow(28) });

  console.log("✓ flag catalog");
  return { sportId: sport.id, programId: program.id,
    fs: { springB: springB.id, springC: springC.id, summerB: summerB.id, fallB: fallB.id, fallC: fallC.id } };
}

const FAMILIES = [
  // Maya belongs to demo.parent (Sarah Mitchell) — parentEmail null means "use ctx.demo.parent".
  { kid: "Maya",   kidLast: "Mitchell",  dob: "2018-04-12", parentEmail: null,                          pFirst: "Sarah",  pLast: "Mitchell" },
  { kid: "Leo",    kidLast: "Tran",      dob: "2018-07-03", parentEmail: "minh.tran@example.com",       pFirst: "Minh",   pLast: "Tran" },
  { kid: "Ava",    kidLast: "Rossi",     dob: "2018-01-22", parentEmail: "elena.rossi@example.com",     pFirst: "Elena",  pLast: "Rossi" },
  { kid: "Noah",   kidLast: "Whitfield", dob: "2017-11-09", parentEmail: "james.whitfield@example.com", pFirst: "James",  pLast: "Whitfield" },
  { kid: "Zoe",    kidLast: "Okonkwo",   dob: "2018-03-30", parentEmail: "ada.okonkwo@example.com",     pFirst: "Ada",    pLast: "Okonkwo" },
  { kid: "Eli",    kidLast: "Garcia",    dob: "2018-09-15", parentEmail: "rosa.garcia@example.com",     pFirst: "Rosa",   pLast: "Garcia" },
  { kid: "Ruby",   kidLast: "Chen",      dob: "2018-06-08", parentEmail: "wei.chen@example.com",        pFirst: "Wei",    pLast: "Chen" },
  { kid: "Owen",   kidLast: "Novak",     dob: "2017-12-27", parentEmail: "petra.novak@example.com",     pFirst: "Petra",  pLast: "Novak" },
  { kid: "Isla",   kidLast: "Haddad",    dob: "2018-02-14", parentEmail: "sami.haddad@example.com",     pFirst: "Sami",   pLast: "Haddad" },
  { kid: "Jonas",  kidLast: "Berg",      dob: "2018-08-19", parentEmail: "anna.berg@example.com",       pFirst: "Anna",   pLast: "Berg" },
];

async function ensureRegistration(db: Ctx["db"], opts: {
  seasonId: string; familyMemberId: string; registeredByUserId: string;
  status: "confirmed" | "pending"; paid: boolean; amountCents: number; createdAt: Date;
}) {
  let [reg] = await db.select().from(registrations)
    .where(and(eq(registrations.familyMemberId, opts.familyMemberId), eq(registrations.seasonId, opts.seasonId)))
    .orderBy(asc(registrations.createdAt)).limit(1);
  if (!reg) {
    [reg] = await db.insert(registrations).values({
      seasonId: opts.seasonId, familyMemberId: opts.familyMemberId,
      registeredByUserId: opts.registeredByUserId, status: opts.status,
      paymentStatus: opts.paid ? "paid" : "unpaid", registrationType: "full",
      amountDueCents: opts.amountCents, amountPaidCents: opts.paid ? opts.amountCents : 0,
      waiverSigned: true, createdAt: opts.createdAt,
    }).returning();
  }
  if (opts.paid) {
    const [existingPay] = await db.select({ id: payments.id }).from(payments)
      .where(and(eq(payments.registrationId, reg.id), eq(payments.paymentType, "full")))
      .orderBy(asc(payments.createdAt)).limit(1);
    if (!existingPay) {
      await db.insert(payments).values({
        userId: opts.registeredByUserId, registrationId: reg.id,
        amountCents: opts.amountCents, paymentType: "full", status: "succeeded",
        createdAt: new Date(opts.createdAt.getTime() + 2 * 60_000),
      });
    }
  }
  return reg;
}

async function seedYouthPeople(ctx: Ctx, youth: { ys: { fall25: string; spring26: string; summer26: string; fall26: string } }) {
  const { db, org, demo } = ctx;
  const rostersByKid: Record<string, { rosterId: string; familyMemberId: string; parentUserId: string; regId: string }> = {};

  // Opponent teams for the current season (no rosters needed — games/standings only).
  const YOUTH_TEAMS = ["Thunder", "Comets", "Red Dragons", "Wolves", "Falcons", "Tigers"];
  const teamIds: Record<string, string> = {};
  for (const name of YOUTH_TEAMS) {
    let [t] = await db.select().from(teams)
      .where(and(eq(teams.seasonId, youth.ys.summer26), eq(teams.name, name)))
      .orderBy(asc(teams.createdAt)).limit(1);
    if (!t) [t] = await db.insert(teams).values({
      seasonId: youth.ys.summer26, name, division: "U8",
      coachUserId: name === "Thunder" ? demo.coach.id : null,
    }).returning();
    else if (name === "Thunder" && t.coachUserId !== demo.coach.id) {
      await db.update(teams).set({ coachUserId: demo.coach.id }).where(eq(teams.id, t.id));
    }
    teamIds[name] = t.id;
  }
  // Past-season Thunder so the coach has multi-season history.
  let [pastThunder] = await db.select().from(teams)
    .where(and(eq(teams.seasonId, youth.ys.spring26), eq(teams.name, "Thunder")))
    .orderBy(asc(teams.createdAt)).limit(1);
  if (!pastThunder) [pastThunder] = await db.insert(teams).values({
    seasonId: youth.ys.spring26, name: "Thunder", division: "U8", coachUserId: demo.coach.id,
  }).returning();

  let jersey = 2;
  for (const fam of FAMILIES) {
    const parent = fam.parentEmail
      ? await ensureUser(db, { email: fam.parentEmail, firstName: fam.pFirst, lastName: fam.pLast }) // no password — cannot log in
      : demo.parent;
    const kid = await resolvePerson(db, {
      kind: "dependent", parentUserId: parent.id,
      firstName: fam.kid, lastName: fam.kidLast, birthDate: fam.dob,
    });
    // Current season: everyone confirmed + paid, createdAt staggered 55..46 days ago.
    const idx = FAMILIES.indexOf(fam);
    const reg = await ensureRegistration(db, {
      seasonId: youth.ys.summer26, familyMemberId: kid.id, registeredByUserId: parent.id,
      status: "confirmed", paid: true, amountCents: 19500, createdAt: daysAgo(55 - idx),
    });
    // Upcoming season: first 6 kids re-registered in the last 10 days (4 paid, 2 pending).
    if (idx < 6) {
      await ensureRegistration(db, {
        seasonId: youth.ys.fall26, familyMemberId: kid.id, registeredByUserId: parent.id,
        status: idx < 4 ? "confirmed" : "pending", paid: idx < 4, amountCents: 19500,
        createdAt: daysAgo(10 - idx),
      });
    }
    // History: first 4 kids played the two past seasons too.
    if (idx < 4) {
      const s26 = await ensureRegistration(db, {
        seasonId: youth.ys.spring26, familyMemberId: kid.id, registeredByUserId: parent.id,
        status: "confirmed", paid: true, amountCents: 19500, createdAt: daysAgo(170 - idx),
      });
      await ensureRegistration(db, {
        seasonId: youth.ys.fall25, familyMemberId: kid.id, registeredByUserId: parent.id,
        status: "confirmed", paid: true, amountCents: 19500, createdAt: daysAgo(350 - idx),
      });
      // Past-season roster for coach history.
      await db.insert(rosters).values({ teamId: pastThunder.id, registrationId: s26.id, status: "active" })
        .onConflictDoNothing();
    }
    // Current roster on Thunder.
    let [rosterRow] = await db.select().from(rosters)
      .where(and(eq(rosters.teamId, teamIds.Thunder), eq(rosters.registrationId, reg.id)))
      .orderBy(asc(rosters.createdAt)).limit(1);
    if (!rosterRow) [rosterRow] = await db.insert(rosters).values({
      teamId: teamIds.Thunder, registrationId: reg.id, jerseyNumber: String(jersey), status: "active",
    }).returning();
    jersey += 1;
    rostersByKid[fam.kid] = { rosterId: rosterRow.id, familyMemberId: kid.id, parentUserId: parent.id, regId: reg.id };
  }
  // One refund for realism in the revenue report.
  const zoe = rostersByKid["Zoe"];
  const [refundExists] = await db.select({ id: payments.id }).from(payments)
    .where(and(eq(payments.registrationId, zoe.regId), eq(payments.paymentType, "refund")))
    .orderBy(asc(payments.createdAt)).limit(1);
  if (!refundExists) {
    await db.insert(payments).values({
      userId: zoe.parentUserId, registrationId: zoe.regId, amountCents: 5000,
      paymentType: "refund", status: "succeeded", refundReason: "Missed two weeks — goodwill credit",
      createdAt: daysAgo(12),
    });
  }
  console.log("✓ youth families, registrations, payments, rosters");
  return { thunderTeamId: teamIds.Thunder, youthTeamIds: teamIds, rostersByKid };
}

async function main() {
  const db = getDb();

  const [org] = await db.select().from(organizations)
    .where(eq(organizations.slug, "aspire-sports"))
    .orderBy(asc(organizations.createdAt)).limit(1);
  if (!org) throw new Error("aspire-sports org not found on staging");

  const [location] = await db.select().from(locations)
    .where(eq(locations.organizationId, org.id))
    .orderBy(asc(locations.createdAt)).limit(1);
  if (!location) throw new Error("no location for aspire-sports org");

  let [venue] = await db.select().from(venues)
    .where(and(eq(venues.locationId, location.id), eq(venues.name, "Aspire Sports Park")))
    .orderBy(asc(venues.createdAt)).limit(1);
  if (!venue) {
    [venue] = await db.insert(venues).values({
      locationId: location.id, name: "Aspire Sports Park", fieldCount: 4, active: true,
    }).returning();
  }

  // Referee role is NOT in the main role bootstrap — ensure it (e2e idiom :682-697).
  await db.insert(roles).values({
    name: "referee",
    description: "Officiates assigned matches; enters final scores and incidents",
    permissions: ["games:read_assigned", "games:write_score"],
  }).onConflictDoNothing();
  const allRoles = await db.select().from(roles);
  const roleMap = Object.fromEntries(allRoles.map((r) => [r.name, r]));
  for (const need of ["super_admin", "coach", "parent", "referee"]) {
    if (!roleMap[need]) throw new Error(`role ${need} missing on staging — run db:seed:e2e once first? STOP and check.`);
  }

  const demo = {
    admin:  await ensureUser(db, { email: "demo.admin@aspiresportsohio.com",  firstName: "Dana",   lastName: "Okafor",  password: DEMO_PASSWORD }),
    coach:  await ensureUser(db, { email: "demo.coach@aspiresportsohio.com",  firstName: "Marcus", lastName: "Bell",    password: DEMO_PASSWORD }),
    parent: await ensureUser(db, { email: "demo.parent@aspiresportsohio.com", firstName: "Sarah",  lastName: "Mitchell",password: DEMO_PASSWORD }),
    ref:    await ensureUser(db, { email: "demo.ref@aspiresportsohio.com",    firstName: "Jordan", lastName: "Avery",   password: DEMO_PASSWORD }),
  };
  await ensureRole(db, demo.admin.id,  roleMap.super_admin.id, { scopeType: "global" });
  await ensureRole(db, demo.coach.id,  roleMap.coach.id,   { scopeType: "organization", scopeId: org.id });
  await ensureRole(db, demo.parent.id, roleMap.parent.id,  { scopeType: "organization", scopeId: org.id });
  await ensureRole(db, demo.ref.id,    roleMap.referee.id, { scopeType: "organization", scopeId: org.id });
  console.log("✓ context + demo accounts", Object.fromEntries(Object.entries(demo).map(([k, v]) => [k, v.email])));

  const ctx = { db, now: NOW, org, location, venue, roleMap, demo };
  const youth = await seedYouthCatalog(ctx);
  const flag = await seedFlagCatalog(ctx);
  const people = await seedYouthPeople(ctx, youth);
  console.log("✓ demo seed complete", { youth, flag, thunderTeamId: people.thunderTeamId });
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
