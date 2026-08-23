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
  teamRegistrations,
} from "@/lib/db/schema";
import { getTableColumns } from "drizzle-orm";
import { userOrganizationAccess } from "@/lib/db/schema/organizations";
import { consents } from "@/lib/db/schema/consents";
import { memberships, membershipTiers } from "@/lib/db/schema/memberships";
import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { derivePersonType } from "./derive-person-type";
import { summarizePayments } from "./summarize-payments";
import { computeOutstandingCents } from "./compute-outstanding";
import { collectTodayForPerson } from "./collect-today";
import { isKnownDob } from "./dob";
import { buildOrgScopeCascade } from "@/lib/admin/org-scope-cascade";
import type { PersonProfile, PersonFamilyMember } from "./person-types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ageFromBirthDate(birthDate: string | null): number | null {
  if (!isKnownDob(birthDate)) return null;
  const today = new Date();
  const dob = new Date(birthDate!);
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

  const isChild = fm.parentUserId !== null;

  // ----- Type --------------------------------------------------------------
  const type = derivePersonType(fm, false);

  // ----- Everything below only depends on `fm`/`id`/`linkedUserId`, not on
  // each other — run in one wave. `today` runs its own internal waves (see
  // collect-today.ts) inside this same outer wave.
  const [linkedUser, regRows, consentRows, mem, todayItems] = await Promise.all([
    db
      .select({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        phone: users.phone,
      })
      .from(users)
      .where(eq(users.id, linkedUserId))
      .then((rows) => rows[0]),

    // ----- Registrations ---------------------------------------------------
    db
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
      .orderBy(desc(registrations.createdAt)),

    // ----- Consents ----------------------------------------------------------
    // Active = most-recent row per (familyMemberId, type) with status='granted'
    // and (expiresAt IS NULL OR expiresAt > now()).
    db
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
      .orderBy(desc(consents.signedAt)),

    // ----- Membership (adults only, via selfUserId) --------------------------
    !isChild && fm.selfUserId
      ? db
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
              // Self-memberships only: child memberships are billed to the
              // parent's userId but carry familyMemberId, so without this
              // the parent's profile shows their child's tier as their own.
              isNull(memberships.familyMemberId),
              eq(memberships.organizationId, orgId),
              inArray(memberships.status, ["active", "paused", "past_due"]),
            ),
          )
          .orderBy(desc(memberships.createdAt))
          .limit(1)
          .then((rows) => rows[0])
      : Promise.resolve(undefined),

    collectTodayForPerson(db, {
      familyMemberId: id,
      linkedUserId,
      allowedLocationIds,
      todayUtc: new Date(),
      // Adult-self: fm.selfUserId is set. Child (COPPA): fm.parentUserId is set.
      // Only adult-self should have drop-in / field-rental items (those are
      // keyed by userId and belong to the account holder, not a child).
      isSelf: fm.selfUserId !== null,
      personPhotoUrl: fm.photoUrl ?? null,
    }),
  ]);

  const contact = {
    name: linkedUser
      ? `${linkedUser.firstName ?? ""} ${linkedUser.lastName ?? ""}`.trim()
      : `${fm.firstName} ${fm.lastName}`,
    phone: linkedUser?.phone ?? null,
    email: linkedUser?.email ?? null,
    isParentContact: isChild,
  };

  // ----- Payments (depends on regRows -> registrationIds) -------------------
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

  const membership: PersonProfile["membership"] = mem
    ? {
        plan: mem.tierName,
        renewsIso: mem.currentPeriodEnd
          ? mem.currentPeriodEnd.toISOString()
          : null,
      }
    : null;

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
    today: todayItems,
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

  // Family-member registrations and the user's own (adult self-registrant
  // path) registrations are independent of each other — run in parallel.
  const [familyRegRows, selfRegRows] = await Promise.all([
    familyMemberIds.length > 0
      ? db
          .select({
            id: registrations.id,
            paymentStatus: registrations.paymentStatus,
            amountDueCents: registrations.amountDueCents,
            amountPaidCents: registrations.amountPaidCents,
          })
          .from(registrations)
          .where(inArray(registrations.familyMemberId, familyMemberIds))
      : Promise.resolve([]),
    db
      .select({
        id: registrations.id,
        paymentStatus: registrations.paymentStatus,
        amountDueCents: registrations.amountDueCents,
        amountPaidCents: registrations.amountPaidCents,
      })
      .from(registrations)
      .where(eq(registrations.registeredByUserId, id)),
  ]);

  const allRegistrations: {
    id: string;
    paymentStatus: string;
    amountDueCents: number;
    amountPaidCents: number;
  }[] = [...familyRegRows, ...selfRegRows];

  // Deduplicate by ID
  const uniqueRegs = Array.from(
    new Map(allRegistrations.map((r) => [r.id, r])).values(),
  );
  const allIds = uniqueRegs.map((r) => r.id);

  // Registration-linked payments plus the account's team-level payments
  // (captain deposit / backstop balance — registration_id NULL, #525).
  // Team payments are scoped to THIS org via team_registrations, so a
  // captain's teams in another org never leak into this admin view.
  const [regPaymentRows, teamPaymentRows] = await Promise.all([
    allIds.length > 0
      ? db
          .select()
          .from(payments)
          .where(inArray(payments.registrationId, allIds))
          .orderBy(desc(payments.createdAt))
      : Promise.resolve([]),
    db
      .select(getTableColumns(payments))
      .from(payments)
      .innerJoin(
        teamRegistrations,
        eq(payments.teamRegistrationId, teamRegistrations.id),
      )
      .where(
        and(
          eq(payments.userId, id),
          eq(teamRegistrations.organizationId, orgId),
        ),
      )
      .orderBy(desc(payments.createdAt)),
  ]);
  const paymentRows = [...regPaymentRows, ...teamPaymentRows];

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

export async function isUserInOrg(
  userId: string,
  orgId: string,
  allowedLocationIds: string[],
): Promise<boolean> {
  const db = getDb();

  // Cascade (locations -> programs -> teams) as nested subqueries, not
  // separately-awaited round trips — see org-scope-cascade.ts. Shared with
  // lookup.ts's identical scope check.
  const { programIds, teamIds } = buildOrgScopeCascade(allowedLocationIds);

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
    ...(programIds
      ? [
          and(
            eq(userRoles.scopeType, "program"),
            inArray(userRoles.scopeId, programIds),
          ),
        ]
      : []),
    ...(teamIds
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

  // Genuine dependency: only worth checking user_organization_access when
  // the role-scope check above came back empty.
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
