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
