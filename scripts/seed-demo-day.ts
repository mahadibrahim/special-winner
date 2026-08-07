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
  // Later tasks append section calls here, threading ctx and returned ids.
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
