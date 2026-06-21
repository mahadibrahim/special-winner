/**
 * buildPersonProfile
 *
 * Aggregates all data needed for the Person 360 view into a single
 * `PersonProfile` object. Called by `GET /api/admin/person/[id]`.
 *
 * `as="family_member"` — returns a profile for a specific family_members row
 * (type child | adult), with their registrations, payments, consents,
 * membership (adult only), and empty family list.
 *
 * `as="user"` — returns a profile for a user account (type "parent"), with
 * their family members as the `family` list and aggregate payments across the
 * family's registrations.
 *
 * NOTE: `today` (rostered/checked-in sessions for today) is returned as []
 * in this v1 — the check-in roster join requires a separate task to wire up
 * cleanly. Everything else (identity, contact, registrations, payments,
 * consents, membership, family) is real.
 */
import { getDb } from "@/lib/db";
import {
  users,
  userRoles,
  familyMembers,
  registrations,
  payments,
  programs,
  seasons,
  teams,
} from "@/lib/db/schema";
import { userOrganizationAccess } from "@/lib/db/schema/organizations";
import { consents } from "@/lib/db/schema/consents";
import { memberships, membershipTiers } from "@/lib/db/schema/memberships";
import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { derivePersonType } from "./derive-person-type";
import { summarizePayments } from "./summarize-payments";
import { computeOutstandingCents } from "./compute-outstanding";
import { collectTodayForPerson } from "./collect-today";
import type { PersonProfile, PersonFamilyMember } from "./person-types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ageFromBirthDate(birthDate: string | null): number | null {
  if (!birthDate) return null;
  const today = new Date();
  const dob = new Date(birthDate);
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
  return age;
}

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface BuildPersonProfileOptions {
  id: string;
  as: "family_member" | "user";
  orgId: string;
  /** All location ids the caller may see within the org. */
  allowedLocationIds: string[];
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export async function buildPersonProfile(
  opts: BuildPersonProfileOptions,
): Promise<PersonProfile | null> {
  if (opts.as === "family_member") {
    return buildFamilyMemberProfile(opts);
  }
  return buildUserProfile(opts);
}

// ---------------------------------------------------------------------------
// family_member path
// ---------------------------------------------------------------------------

async function buildFamilyMemberProfile(
  opts: BuildPersonProfileOptions,
): Promise<PersonProfile | null> {
  const { id, orgId, allowedLocationIds } = opts;
  const db = getDb();

  // Load the family_members row.
  const [fm] = await db
    .select()
    .from(familyMembers)
    .where(eq(familyMembers.id, id));

  if (!fm) return null;

  // ----- Org-scope gate (mirror lookup.ts) ---------------------------------
  // We need the linked user to be in the caller's org.  We'll verify this by
  // confirming at least one registration belongs to the caller's location set
  // OR by checking the linked user is in the org (via userOrganizationAccess /
  // userRoles).  The simplest tenant-safe approach: require that the family
  // member has at least one registration whose location is in our allowed set,
  // OR that the linked parent/self user has org access.
  //
  // For the user side (parent_user_id / self_user_id) we do the same
  // userIdsInOrg check that lookup.ts does.  We accept the fm if its linked
  // userId appears in that set.
  const linkedUserId = fm.parentUserId ?? fm.selfUserId;
  if (!linkedUserId) return null;

  const inOrg = await isUserInOrg(linkedUserId, orgId, allowedLocationIds);
  if (!inOrg) return null;

  // ----- Contact -----------------------------------------------------------
  const [linkedUser] = await db
    .select({
      id: users.id,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
      phone: users.phone,
    })
    .from(users)
    .where(eq(users.id, linkedUserId));

  const isChild = fm.parentUserId !== null;
  const contact = {
    name: linkedUser
      ? `${linkedUser.firstName ?? ""} ${linkedUser.lastName ?? ""}`.trim()
      : `${fm.firstName} ${fm.lastName}`,
    phone: linkedUser?.phone ?? null,
    email: linkedUser?.email ?? null,
    isParentContact: isChild,
  };

  // ----- Type --------------------------------------------------------------
  const type = derivePersonType(fm, false);

  // ----- Registrations + payments ------------------------------------------
  const regRows = await db
    .select({
      registration: registrations,
      paymentStatus: registrations.paymentStatus,
      amountDueCents: registrations.amountDueCents,
      amountPaidCents: registrations.amountPaidCents,
      season: {
        id: seasons.id,
        name: seasons.name,
        startDate: seasons.startDate,
        endDate: seasons.endDate,
      },
      program: {
        id: programs.id,
        name: programs.name,
      },
    })
    .from(registrations)
    .innerJoin(seasons, eq(registrations.seasonId, seasons.id))
    .innerJoin(programs, eq(seasons.programId, programs.id))
    .where(eq(registrations.familyMemberId, id))
    .orderBy(desc(registrations.createdAt));

  const registrationIds = regRows.map((r) => r.registration.id);

  const paymentRows =
    registrationIds.length > 0
      ? await db
          .select()
          .from(payments)
          .where(inArray(payments.registrationId, registrationIds))
          .orderBy(desc(payments.createdAt))
      : [];

  const personRegistrations = regRows.map((r) => ({
    id: r.registration.id,
    label: `${r.program.name} — ${r.season.name}`,
    sublabel: `${r.season.startDate} – ${r.season.endDate}`,
    status: r.registration.status,
    paid: r.registration.paymentStatus === "paid",
  }));

  let paymentSummary = summarizePayments(
    paymentRows.map((p) => ({
      amountCents: p.amountCents,
      status: p.status,
      createdAtIso: p.createdAt.toISOString(),
      method: p.paymentType,
    })),
  );

  // Override outstanding balance with true computation from registrations
  const outstandingCents = computeOutstandingCents(
    regRows.map((r) => ({
      paymentStatus: r.paymentStatus,
      amountDueCents: r.amountDueCents,
      amountPaidCents: r.amountPaidCents,
    })),
  );
  paymentSummary = { ...paymentSummary, outstandingCents };

  // ----- Consents ----------------------------------------------------------
  // Active = most-recent row per (familyMemberId, type) with status='granted'
  // and (expiresAt IS NULL OR expiresAt > now()).
  const consentRows = await db
    .select({
      type: consents.type,
      status: consents.status,
      signedAt: consents.signedAt,
      expiresAt: consents.expiresAt,
    })
    .from(consents)
    .where(
      and(
        eq(consents.familyMemberId, id),
        eq(consents.status, "granted"),
        or(
          sql`${consents.expiresAt} IS NULL`,
          sql`${consents.expiresAt} > NOW()`,
        ),
      ),
    )
    .orderBy(desc(consents.signedAt));

  // Deduplicate by type, keeping only the most-recent row per type.
  const consentsByType = new Map<string, boolean>();
  for (const row of consentRows) {
    if (!consentsByType.has(row.type)) {
      consentsByType.set(row.type, row.status === "granted");
    }
  }
  const consentList = Array.from(consentsByType.entries()).map(
    ([kind, granted]) => ({ kind, granted }),
  );

  // ----- Membership (adults only, via selfUserId) --------------------------
  let membership: PersonProfile["membership"] = null;
  if (!isChild && fm.selfUserId) {
    const [mem] = await db
      .select({
        status: memberships.status,
        currentPeriodEnd: memberships.currentPeriodEnd,
        tierName: membershipTiers.name,
      })
      .from(memberships)
      .innerJoin(membershipTiers, eq(memberships.tierId, membershipTiers.id))
      .where(
        and(
          eq(memberships.userId, fm.selfUserId),
          eq(memberships.organizationId, orgId),
          inArray(memberships.status, ["active", "paused", "past_due"]),
        ),
      )
      .orderBy(desc(memberships.createdAt))
      .limit(1);

    if (mem) {
      membership = {
        plan: mem.tierName,
        renewsIso: mem.currentPeriodEnd
          ? mem.currentPeriodEnd.toISOString()
          : null,
      };
    }
  }

  // ----- Flags -------------------------------------------------------------
  const flags: string[] = [];
  if (fm.medicalNotes?.trim()) {
    flags.push("medical_notes");
  }
  if (membership) {
    flags.push("has_membership");
  }
  if (outstandingCents > 0) {
    flags.push("outstanding_balance");
  }

  // ----- Assemble ----------------------------------------------------------
  return {
    type,
    id: fm.id,
    name: `${fm.firstName} ${fm.lastName}`,
    age: ageFromBirthDate(fm.birthDate),
    birthDate: fm.birthDate,
    photoUrl: fm.photoUrl ?? null,
    contact,
    flags,
    today: await collectTodayForPerson(db, {
      familyMemberId: id,
      linkedUserId,
      orgId,
      allowedLocationIds,
      todayUtc: new Date(),
    }),
    registrations: personRegistrations,
    payments: paymentSummary,
    membership,
    consents: consentList,
    family: [],
  };
}

// ---------------------------------------------------------------------------
// user path
// ---------------------------------------------------------------------------

async function buildUserProfile(
  opts: BuildPersonProfileOptions,
): Promise<PersonProfile | null> {
  const { id, orgId, allowedLocationIds } = opts;
  const db = getDb();

  // Load the user row.
  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
      phone: users.phone,
      birthDate: users.birthDate,
      avatarUrl: users.avatarUrl,
    })
    .from(users)
    .where(eq(users.id, id));

  if (!user) return null;

  // ----- Org-scope gate ----------------------------------------------------
  const inOrg = await isUserInOrg(id, orgId, allowedLocationIds);
  if (!inOrg) return null;

  // ----- Contact -----------------------------------------------------------
  const contact = {
    name: `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim(),
    phone: user.phone ?? null,
    email: user.email,
    isParentContact: false,
  };

  // ----- Family members ----------------------------------------------------
  const fmRows = await db
    .select()
    .from(familyMembers)
    .where(eq(familyMembers.parentUserId, id));

  const family: PersonFamilyMember[] = fmRows.map((fm) => {
    const age = ageFromBirthDate(fm.birthDate);
    return {
      familyMemberId: fm.id,
      name: `${fm.firstName} ${fm.lastName}`,
      age,
      summary: age !== null ? `Age ${age}` : "Age unknown",
    };
  });

  // ----- Account-level billing (aggregate across all family registrations) --
  const familyMemberIds = fmRows.map((fm) => fm.id);

  let allRegistrations: {
    id: string;
    paymentStatus: string;
    amountDueCents: number;
    amountPaidCents: number;
  }[] = [];

  if (familyMemberIds.length > 0) {
    const regRows = await db
      .select({
        id: registrations.id,
        paymentStatus: registrations.paymentStatus,
        amountDueCents: registrations.amountDueCents,
        amountPaidCents: registrations.amountPaidCents,
      })
      .from(registrations)
      .where(inArray(registrations.familyMemberId, familyMemberIds));
    allRegistrations.push(...regRows);
  }

  // Also include the user's own registrations (adult self-registrant path).
  const selfRegRows = await db
    .select({
      id: registrations.id,
      paymentStatus: registrations.paymentStatus,
      amountDueCents: registrations.amountDueCents,
      amountPaidCents: registrations.amountPaidCents,
    })
    .from(registrations)
    .where(eq(registrations.registeredByUserId, id));
  allRegistrations.push(...selfRegRows);

  // Deduplicate by ID
  const uniqueRegs = Array.from(
    new Map(allRegistrations.map((r) => [r.id, r])).values(),
  );
  const allIds = uniqueRegs.map((r) => r.id);

  const paymentRows =
    allIds.length > 0
      ? await db
          .select()
          .from(payments)
          .where(inArray(payments.registrationId, allIds))
          .orderBy(desc(payments.createdAt))
      : [];

  let paymentSummary = summarizePayments(
    paymentRows.map((p) => ({
      amountCents: p.amountCents,
      status: p.status,
      createdAtIso: p.createdAt.toISOString(),
      method: p.paymentType,
    })),
  );

  // Override outstanding balance with true computation from registrations
  paymentSummary = {
    ...paymentSummary,
    outstandingCents: computeOutstandingCents(uniqueRegs),
  };

  // ----- Flags -------------------------------------------------------------
  const flags: string[] = [];
  if (paymentSummary.outstandingCents > 0) {
    flags.push("outstanding_balance");
  }

  // ----- Assemble ----------------------------------------------------------
  return {
    type: "parent",
    id: user.id,
    name: contact.name,
    age: ageFromBirthDate(user.birthDate ?? null),
    birthDate: user.birthDate ?? null,
    photoUrl: user.avatarUrl ?? null,
    contact,
    flags,
    today: [], // NOTE: best-effort v1 — deferred
    registrations: [], // for user view, registrations are on each family member
    payments: paymentSummary,
    membership: null,
    consents: [],
    family,
  };
}

// ---------------------------------------------------------------------------
// Org-scope check (mirrors lookup.ts userIdsInOrg gate)
// ---------------------------------------------------------------------------

async function isUserInOrg(
  userId: string,
  orgId: string,
  allowedLocationIds: string[],
): Promise<boolean> {
  const db = getDb();

  // Replicate the same multi-scope query as lookup.ts
  // Build the scope conditions dynamically based on available location ids.
  const programIds =
    allowedLocationIds.length > 0
      ? (
          await db
            .select({ id: programs.id })
            .from(programs)
            .where(inArray(programs.locationId, allowedLocationIds))
        ).map((p) => p.id)
      : [];

  const seasonIds =
    programIds.length > 0
      ? (
          await db
            .select({ id: seasons.id })
            .from(seasons)
            .where(inArray(seasons.programId, programIds))
        ).map((s) => s.id)
      : [];

  const teamIds =
    seasonIds.length > 0
      ? (
          await db
            .select({ id: teams.id })
            .from(teams)
            .where(inArray(teams.seasonId, seasonIds))
        ).map((t) => t.id)
      : [];

  const scopeConditions = [
    eq(userRoles.scopeType, "global"),
    and(
      eq(userRoles.scopeType, "organization"),
      eq(userRoles.scopeId, orgId),
    ),
    ...(allowedLocationIds.length > 0
      ? [
          and(
            eq(userRoles.scopeType, "location"),
            inArray(userRoles.scopeId, allowedLocationIds),
          ),
        ]
      : []),
    ...(programIds.length > 0
      ? [
          and(
            eq(userRoles.scopeType, "program"),
            inArray(userRoles.scopeId, programIds),
          ),
        ]
      : []),
    ...(teamIds.length > 0
      ? [
          and(
            eq(userRoles.scopeType, "team"),
            inArray(userRoles.scopeId, teamIds),
          ),
        ]
      : []),
  ].filter(Boolean) as Parameters<typeof or>;

  const [roleRow] = await db
    .select({ userId: userRoles.userId })
    .from(userRoles)
    .where(
      and(eq(userRoles.userId, userId), or(...scopeConditions)),
    )
    .limit(1);

  if (roleRow) return true;

  const [accessRow] = await db
    .select({ userId: userOrganizationAccess.userId })
    .from(userOrganizationAccess)
    .where(
      and(
        eq(userOrganizationAccess.userId, userId),
        eq(userOrganizationAccess.organizationId, orgId),
      ),
    )
    .limit(1);

  return !!accessRow;
}
