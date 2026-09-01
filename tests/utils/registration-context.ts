/**
 * Shared self-seed helper for API tests that need a real registration row
 * graph to exercise against (payments, refunds, account credit, checkout).
 *
 * Extracted from tests/api/webhooks/charge-refunded.test.ts's original
 * `seedPaidRegistration` (product-backlog build #1 lesson: CI's fresh
 * db:seed:e2e DB has no ambient fixtures, so every test must create its own
 * org/user/season/registration rows rather than depend on shared seed data).
 *
 * Each call creates a brand-new organization → user → sport → location →
 * program → season → familyMember → registration → payment, so tests never
 * collide and never leak into each other's balance/refund assertions.
 */
import { getDb } from "@/lib/db";
import { assertTestDatabase } from "./assert-test-database";
import {
  registrations,
  payments,
  familyMembers,
  seasons,
  programs,
  sports,
  locations,
  organizations,
  users,
  type Registration,
} from "@/lib/db/schema";

export interface SeedPaidRegistrationOverrides {
  /** Total amountDueCents on the registration. Defaults to `amountPaidCents`
   *  (i.e. a fully-paid registration, matching the original helper). Pass a
   *  larger value to seed an outstanding balance for checkout/credit tests. */
  amountDueCents?: number;
  paymentStatus?: Registration["paymentStatus"];
  status?: Registration["status"];
  /** programs.program_type on the seeded program. Defaults to "league"
   *  (matching the original helper). Pass "camp" for member-camp-discount
   *  checkout tests. */
  programType?: "league" | "camp" | "clinic" | "tournament" | "training";
}

export interface SeedPaidRegistrationResult {
  registrationId: string;
  paymentIntentId: string;
  userId: string;
  organizationId: string;
  familyMemberId: string;
  seasonId: string;
  programName: string;
  seasonName: string;
  childName: string;
}

export interface SeedWaiverReminderCandidateResult {
  organizationId: string;
  userId: string;
  familyMemberId: string;
  seasonId: string;
  registrationId: string;
}

/**
 * Seed a registration that `POST /api/cron/send-waiver-reminders` will pick up
 * in its "1" age window: paid, waiver unsigned, not cancelled, season start
 * well beyond the final-48h window, and created 2 days ago (the window is
 * [1d, 4d)).
 *
 * Its own org/season graph, like `seedPaidRegistration` — the cron runs across
 * the whole database, so a test asserting "this row was/wasn't chased" must own
 * every row it asserts on.
 */
export async function seedWaiverReminderCandidate(opts: {
  /** Days ago the registration was created. Default 2 → the "1" window. */
  createdDaysAgo?: number;
} = {}): Promise<SeedWaiverReminderCandidateResult> {
  assertTestDatabase();
  const db = getDb();
  const suffix = Math.random().toString(36).slice(2, 10);
  const createdAt = new Date(
    Date.now() - (opts.createdDaysAgo ?? 2) * 24 * 60 * 60 * 1000,
  );
  // Far outside the final-48h window, so the row lands in exactly one age
  // window and the assertions aren't split across two emails.
  const startDate = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const [org] = await db
    .insert(organizations)
    .values({
      name: `Waiver Cron Org ${suffix}`,
      slug: `waiver-cron-org-${suffix}`,
      organizationType: "headquarters",
    })
    .returning();

  const [user] = await db
    .insert(users)
    .values({
      // A password hash keeps the cron on its plain-link branch rather than
      // minting a magic link — fewer moving parts in the assertion.
      email: `waiver-cron-${suffix}@test.example`,
      passwordHash: "x",
      firstName: "Wanda",
      lastName: "Waiver",
    })
    .returning();

  const [sport] = await db
    .insert(sports)
    .values({ name: `Sport ${suffix}`, slug: `sport-${suffix}`, organizationId: org.id })
    .returning();

  const [location] = await db
    .insert(locations)
    .values({ name: `Loc ${suffix}`, slug: `loc-${suffix}`, organizationId: org.id })
    .returning();

  const [program] = await db
    .insert(programs)
    .values({
      name: `Prog ${suffix}`,
      slug: `prog-${suffix}`,
      sportId: sport.id,
      locationId: location.id,
      programType: "league",
    })
    .returning();

  const [season] = await db
    .insert(seasons)
    .values({
      name: `Season ${suffix}`,
      slug: `season-${suffix}`,
      programId: program.id,
      startDate,
      endDate: startDate,
      priceCents: 1000,
      status: "open",
    })
    .returning();

  const [member] = await db
    .insert(familyMembers)
    .values({
      parentUserId: user.id,
      firstName: "Kid",
      lastName: `Waiver${suffix}`,
      birthDate: "2015-01-01",
    })
    .returning();

  const [registration] = await db
    .insert(registrations)
    .values({
      seasonId: season.id,
      familyMemberId: member.id,
      registeredByUserId: user.id,
      status: "confirmed",
      paymentStatus: "paid",
      amountPaidCents: 1000,
      amountDueCents: 1000,
      registrationType: "full",
      waiverSigned: false,
      createdAt,
    })
    .returning();

  return {
    organizationId: org.id,
    userId: user.id,
    familyMemberId: member.id,
    seasonId: season.id,
    registrationId: registration.id,
  };
}

/**
 * Seed the minimum row graph needed to exercise payment/refund/credit logic.
 * Creates org → user → sport → location → program → season → familyMember
 * → registration → payment (with stripePaymentIntentId).
 */
export async function seedPaidRegistration(
  amountPaidCents: number,
  overrides: SeedPaidRegistrationOverrides = {},
): Promise<SeedPaidRegistrationResult> {
  // Defense-in-depth: never let these raw fixture INSERTs hit prod. This is
  // the helper whose `Loc ${suffix}` locations leaked into prod on 2026-07-08.
  assertTestDatabase();
  const db = getDb();
  const suffix = Math.random().toString(36).slice(2, 10);
  const paymentIntentId = `pi_test_${suffix}`;
  const amountDueCents = overrides.amountDueCents ?? amountPaidCents;
  const paymentStatus = overrides.paymentStatus ?? "paid";
  const status = overrides.status ?? "confirmed";

  const [org] = await db
    .insert(organizations)
    .values({
      name: `Org ${suffix}`,
      slug: `org-${suffix}`,
      organizationType: "headquarters",
    })
    .returning();

  const [user] = await db
    .insert(users)
    .values({
      email: `parent-${suffix}@test.example`,
      passwordHash: "x",
      firstName: "Pat",
      lastName: "Parent",
    })
    .returning();

  const [sport] = await db
    .insert(sports)
    .values({
      name: `Sport ${suffix}`,
      slug: `sport-${suffix}`,
      organizationId: org.id,
    })
    .returning();

  const [location] = await db
    .insert(locations)
    .values({
      name: `Loc ${suffix}`,
      slug: `loc-${suffix}`,
      organizationId: org.id,
    })
    .returning();

  const [program] = await db
    .insert(programs)
    .values({
      name: `Prog ${suffix}`,
      slug: `prog-${suffix}`,
      sportId: sport.id,
      locationId: location.id,
      programType: overrides.programType ?? "league",
    })
    .returning();

  const [season] = await db
    .insert(seasons)
    .values({
      name: `Season ${suffix}`,
      slug: `season-${suffix}`,
      programId: program.id,
      startDate: "2026-09-01",
      endDate: "2026-12-01",
      priceCents: amountDueCents,
      status: "open",
    })
    .returning();

  const [member] = await db
    .insert(familyMembers)
    .values({
      parentUserId: user.id,
      firstName: "Kid",
      lastName: "Player",
      birthDate: "2015-01-01",
    })
    .returning();

  const [registration] = await db
    .insert(registrations)
    .values({
      seasonId: season.id,
      familyMemberId: member.id,
      registeredByUserId: user.id,
      status,
      paymentStatus,
      amountPaidCents,
      amountDueCents,
      registrationType: "full",
      waiverSigned: true,
      waiverSignedAt: new Date(),
      waiverSignedBy: "Pat Parent",
    })
    .returning();

  if (amountPaidCents > 0) {
    await db.insert(payments).values({
      registrationId: registration.id,
      userId: user.id,
      amountCents: amountPaidCents,
      paymentType: "full",
      status: "succeeded",
      stripePaymentIntentId: paymentIntentId,
    });
  }

  return {
    registrationId: registration.id,
    paymentIntentId,
    userId: user.id,
    organizationId: org.id,
    familyMemberId: member.id,
    seasonId: season.id,
    programName: program.name,
    seasonName: season.name,
    childName: `${member.firstName} ${member.lastName}`,
  };
}
