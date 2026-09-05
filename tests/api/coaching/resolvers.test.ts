/**
 * Task 2 of the 2026-09-05-coach-classes-phase01 plan: the assignment CRUD
 * helpers (`setCoachesFor` / `getCoachesFor`), the unified group resolver
 * (`getCoachGroups`), and the class-aware reach/read predicates
 * (`canCoachReachFamilyMember` / `isOrgCoachingStaff`).
 *
 * Library-level test — inserts directly against the live DB (same pattern as
 * tests/api/coaching/assignments-schema.test.ts), no HTTP involved.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq, inArray, asc, and } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  users,
  teams,
  coachingAssignments,
  familyMembers,
  classEnrollments,
  organizations,
  locations,
  venues,
} from "@/lib/db/schema";
import { classCreditGrants, classSlotTemplates } from "@/lib/db/schema/classes";
import { dropInSessions, dropInBookings } from "@/lib/db/schema/drop-in";
import { resolveDefaultOrgForHttpTests } from "../../utils/dropin-helpers";
import { createTestChild, createTestClassTemplate, createTestCreditGrant } from "../../utils/classes-helpers";
import {
  setCoachesFor,
  getCoachesFor,
  TooManyAssistantCoachesError,
  AssignmentTargetOrgMismatchError,
} from "@/lib/coach/coaching-assignments";
import { getCoachGroups } from "@/lib/coach/get-coach-groups";
import { canCoachReachFamilyMember, isOrgCoachingStaff } from "@/lib/auth/roles";

describe("coach-classes resolvers (Task 2)", () => {
  let organizationId: string;
  let venueId: string;
  let parentUserId: string;
  let seededCoachUserId: string;
  let adminUserId: string;
  let mediaStaffUserId: string;
  let mediaEditorUserId: string;
  let hostUserId: string;
  /** "Org B (Test Only)" — the seeded second tenant (seed-e2e-tests.ts §3b),
   *  used ONLY for the F2 cross-org trust-boundary tests below. */
  let orgBId: string;
  let orgBVenueId: string;

  const createdAssignmentIds: string[] = [];
  const createdTemplateIds: string[] = [];
  const createdChildIds: string[] = [];
  const createdSessionIds: string[] = [];
  const createdBookingIds: string[] = [];
  const createdGrantIds: string[] = [];

  beforeAll(async () => {
    const db = getDb();
    ({ organizationId, venueId } = await resolveDefaultOrgForHttpTests());

    const seededEmails = [
      "coach@test.aspiresports.com",
      "admin@test.aspiresports.com",
      "parent@test.aspiresports.com",
      "media_staff@test.aspiresports.com",
      "media_editor@test.aspiresports.com",
      "host@test.aspiresports.com",
    ] as const;
    const seededUsers = await db
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(inArray(users.email, [...seededEmails]))
      .orderBy(asc(users.createdAt));
    const idByEmail = new Map(seededUsers.map((u) => [u.email, u.id]));
    for (const email of seededEmails) {
      if (!idByEmail.has(email)) {
        throw new Error(`resolvers.test: seeded ${email} not found — run npm run db:seed:e2e first`);
      }
    }
    seededCoachUserId = idByEmail.get("coach@test.aspiresports.com")!;
    adminUserId = idByEmail.get("admin@test.aspiresports.com")!;
    parentUserId = idByEmail.get("parent@test.aspiresports.com")!;
    mediaStaffUserId = idByEmail.get("media_staff@test.aspiresports.com")!;
    mediaEditorUserId = idByEmail.get("media_editor@test.aspiresports.com")!;
    hostUserId = idByEmail.get("host@test.aspiresports.com")!;

    const [orgB] = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.slug, "orgb"))
      .limit(1); // slug is unique
    if (!orgB) {
      throw new Error('resolvers.test: seeded "Org B (Test Only)" (slug "orgb") not found — run npm run db:seed:e2e first');
    }
    orgBId = orgB.id;

    const [orgBVenue] = await db
      .select({ id: venues.id })
      .from(venues)
      .innerJoin(locations, eq(locations.id, venues.locationId))
      .where(eq(locations.organizationId, orgBId))
      .orderBy(asc(venues.createdAt))
      .limit(1);
    if (!orgBVenue) {
      throw new Error("resolvers.test: seeded Org B venue not found — run npm run db:seed:e2e first");
    }
    orgBVenueId = orgBVenue.id;
  });

  afterAll(async () => {
    const db = getDb();
    if (createdBookingIds.length > 0) {
      await db.delete(dropInBookings).where(inArray(dropInBookings.id, createdBookingIds));
    }
    if (createdSessionIds.length > 0) {
      await db.delete(dropInSessions).where(inArray(dropInSessions.id, createdSessionIds));
    }
    if (createdAssignmentIds.length > 0) {
      await db.delete(coachingAssignments).where(inArray(coachingAssignments.id, createdAssignmentIds));
    }
    // class_enrollments references credit grants with onDelete restrict, so
    // enrollments must go first.
    if (createdTemplateIds.length > 0) {
      await db.delete(classEnrollments).where(inArray(classEnrollments.slotTemplateId, createdTemplateIds));
    }
    if (createdGrantIds.length > 0) {
      await db.delete(classCreditGrants).where(inArray(classCreditGrants.id, createdGrantIds));
    }
    if (createdTemplateIds.length > 0) {
      await db.delete(classSlotTemplates).where(inArray(classSlotTemplates.id, createdTemplateIds));
    }
    if (createdChildIds.length > 0) {
      await db.delete(familyMembers).where(inArray(familyMembers.id, createdChildIds));
    }
  });

  async function makeChild(name: string): Promise<string> {
    const id = await createTestChild(parentUserId, name);
    createdChildIds.push(id);
    return id;
  }

  async function activeEnrollment(slotTemplateId: string, familyMemberId: string, idSuffix: string) {
    const grantId = await createTestCreditGrant({
      organizationId,
      familyMemberId,
      sessionsGranted: 10,
      idSuffix,
    });
    createdGrantIds.push(grantId);
    const db = getDb();
    const [row] = await db
      .insert(classEnrollments)
      .values({ slotTemplateId, familyMemberId, creditGrantId: grantId, status: "active" })
      .returning();
    return row;
  }

  describe("canCoachReachFamilyMember — class enrollment branch", () => {
    let templateId: string;
    let enrolledChildId: string;
    let unenrolledChildId: string;
    let endedChildId: string;

    beforeAll(async () => {
      templateId = await createTestClassTemplate({
        organizationId,
        venueId,
        name: `Resolver-Reach-${Date.now()}`,
        capacity: 10,
      });
      createdTemplateIds.push(templateId);

      enrolledChildId = await makeChild(`ReachEnrolled-${Date.now()}`);
      unenrolledChildId = await makeChild(`ReachUnenrolled-${Date.now()}`);
      endedChildId = await makeChild(`ReachEnded-${Date.now()}`);

      await activeEnrollment(templateId, enrolledChildId, `reach-active-${Date.now()}`);

      const endedEnrollment = await activeEnrollment(templateId, endedChildId, `reach-ended-${Date.now()}`);
      await getDb()
        .update(classEnrollments)
        .set({ status: "ended", endedAt: new Date() })
        .where(eq(classEnrollments.id, endedEnrollment.id));

      const [assignment] = await getDb()
        .insert(coachingAssignments)
        .values({
          organizationId,
          coachUserId: seededCoachUserId,
          kind: "class_template",
          targetId: templateId,
          role: "lead",
        })
        .returning();
      createdAssignmentIds.push(assignment.id);
    });

    it("(a) template-lead coach reaches the enrolled child", async () => {
      const reached = await canCoachReachFamilyMember(seededCoachUserId, enrolledChildId, organizationId);
      expect(reached).toBe(true);
    });

    it("(a) template-lead coach does NOT reach an unenrolled child", async () => {
      const reached = await canCoachReachFamilyMember(seededCoachUserId, unenrolledChildId, organizationId);
      expect(reached).toBe(false);
    });

    it("(c) an ENDED enrollment does not grant reach", async () => {
      const reached = await canCoachReachFamilyMember(seededCoachUserId, endedChildId, organizationId);
      expect(reached).toBe(false);
    });
  });

  describe("canCoachReachFamilyMember + getCoachGroups — session-only substitute branch", () => {
    let templateId: string;
    let sessionId: string;
    let bookedChildId: string;
    let otherChildId: string;
    const substituteCoachUserId = () => mediaStaffUserId;

    beforeAll(async () => {
      templateId = await createTestClassTemplate({
        organizationId,
        venueId,
        name: `Resolver-Sub-${Date.now()}`,
        capacity: 10,
      });
      createdTemplateIds.push(templateId);

      const startsAt = new Date(Date.now() + 3 * 86_400_000);
      const endsAt = new Date(startsAt.getTime() + 55 * 60_000);
      const [session] = await getDb()
        .insert(dropInSessions)
        .values({
          organizationId,
          venueId,
          kind: "class",
          sportOrClassLabel: "Soccer",
          startsAt,
          endsAt,
          capacity: 10,
          classSlotTemplateId: templateId,
        })
        .returning();
      sessionId = session.id;
      createdSessionIds.push(sessionId);

      bookedChildId = await makeChild(`SubBooked-${Date.now()}`);
      otherChildId = await makeChild(`SubOther-${Date.now()}`);

      const [booking] = await getDb()
        .insert(dropInBookings)
        .values({
          sessionId,
          userId: parentUserId,
          familyMemberId: bookedChildId,
          status: "confirmed",
          source: "online_booking",
          paymentMethod: "card_online",
        })
        .returning();
      createdBookingIds.push(booking.id);

      // A cancelled booking for otherChild must NOT grant reach.
      const [cancelledBooking] = await getDb()
        .insert(dropInBookings)
        .values({
          sessionId,
          userId: parentUserId,
          familyMemberId: otherChildId,
          status: "cancelled",
          source: "online_booking",
          paymentMethod: "card_online",
        })
        .returning();
      createdBookingIds.push(cancelledBooking.id);

      const [assignment] = await getDb()
        .insert(coachingAssignments)
        .values({
          organizationId,
          coachUserId: substituteCoachUserId(),
          kind: "class_session",
          targetId: sessionId,
          role: "assistant",
        })
        .returning();
      createdAssignmentIds.push(assignment.id);
    });

    it("(b) session-only substitute reaches the booked child of that session", async () => {
      const reached = await canCoachReachFamilyMember(substituteCoachUserId(), bookedChildId, organizationId);
      expect(reached).toBe(true);
    });

    it("(b) session-only substitute does NOT reach a child with only a cancelled booking", async () => {
      const reached = await canCoachReachFamilyMember(substituteCoachUserId(), otherChildId, organizationId);
      expect(reached).toBe(false);
    });

    it("(b) getCoachGroups flags the group sessionOnly: true (no template-level assignment)", async () => {
      const { classGroups } = await getCoachGroups(substituteCoachUserId(), organizationId);
      const group = classGroups.find((g) => g.templateId === templateId);
      expect(group).toBeDefined();
      expect(group?.sessionOnly).toBe(true);
      expect(group?.role).toBe("assistant");
    });
  });

  describe("getCoachGroups — team + class group together", () => {
    let templateId: string;

    beforeAll(async () => {
      templateId = await createTestClassTemplate({
        organizationId,
        venueId,
        name: `Resolver-TeamPlusClass-${Date.now()}`,
        capacity: 10,
      });
      createdTemplateIds.push(templateId);

      const [assignment] = await getDb()
        .insert(coachingAssignments)
        .values({
          organizationId,
          coachUserId: seededCoachUserId,
          kind: "class_template",
          targetId: templateId,
          role: "lead",
        })
        .returning();
      createdAssignmentIds.push(assignment.id);
    });

    it("(e) returns both the seeded team assignment and the new class group", async () => {
      const [team] = await getDb()
        .select({ id: teams.id })
        .from(teams)
        .where(eq(teams.name, "E2E Test Team"))
        .orderBy(asc(teams.createdAt))
        .limit(1);
      expect(team, "seeded 'E2E Test Team' fixture missing — run npm run db:seed:e2e").toBeDefined();

      const { teamIds, classGroups } = await getCoachGroups(seededCoachUserId, organizationId);
      expect(teamIds).toContain(team!.id);
      const group = classGroups.find((g) => g.templateId === templateId);
      expect(group).toBeDefined();
      expect(group?.sessionOnly).toBe(false);
      expect(group?.role).toBe("lead");
    });
  });

  describe("setCoachesFor — declarative replace semantics", () => {
    let templateId: string;

    beforeAll(async () => {
      templateId = await createTestClassTemplate({
        organizationId,
        venueId,
        name: `Resolver-SetCoaches-${Date.now()}`,
        capacity: 10,
      });
      createdTemplateIds.push(templateId);
    });

    afterAll(async () => {
      const rows = await getDb()
        .select({ id: coachingAssignments.id })
        .from(coachingAssignments)
        .where(and(eq(coachingAssignments.kind, "class_template"), eq(coachingAssignments.targetId, templateId)));
      createdAssignmentIds.push(...rows.map((r) => r.id));
    });

    it("(d) initial assignment creates lead + assistants", async () => {
      await setCoachesFor({
        organizationId,
        kind: "class_template",
        targetId: templateId,
        lead: adminUserId,
        assistants: [mediaStaffUserId, mediaEditorUserId],
        createdByUserId: adminUserId,
      });

      const coaches = await getCoachesFor("class_template", templateId);
      expect(coaches).toHaveLength(3);
      const byId = new Map(coaches.map((c) => [c.coachUserId, c]));
      expect(byId.get(adminUserId)?.role).toBe("lead");
      expect(byId.get(mediaStaffUserId)?.role).toBe("assistant");
      expect(byId.get(mediaEditorUserId)?.role).toBe("assistant");
    });

    it("(d) replacing the roster deactivates dropped coaches and activates the new set", async () => {
      await setCoachesFor({
        organizationId,
        kind: "class_template",
        targetId: templateId,
        lead: mediaStaffUserId, // was an assistant — role changes
        assistants: [hostUserId], // new
        createdByUserId: adminUserId,
      });

      const coaches = await getCoachesFor("class_template", templateId);
      const byId = new Map(coaches.map((c) => [c.coachUserId, c]));
      expect(coaches).toHaveLength(2);
      expect(byId.get(mediaStaffUserId)?.role).toBe("lead");
      expect(byId.get(hostUserId)?.role).toBe("assistant");
      expect(byId.has(adminUserId)).toBe(false);
      expect(byId.has(mediaEditorUserId)).toBe(false);

      // Dropped coaches are DEACTIVATED, not deleted.
      const inactiveRows = await getDb()
        .select({ coachUserId: coachingAssignments.coachUserId, active: coachingAssignments.active })
        .from(coachingAssignments)
        .where(
          and(
            eq(coachingAssignments.kind, "class_template"),
            eq(coachingAssignments.targetId, templateId),
            inArray(coachingAssignments.coachUserId, [adminUserId, mediaEditorUserId]),
          ),
        );
      expect(inactiveRows).toHaveLength(2);
      for (const row of inactiveRows) expect(row.active).toBe(false);
    });

    it("(d) re-adding a previously-deactivated coach reactivates their row (no duplicate)", async () => {
      await setCoachesFor({
        organizationId,
        kind: "class_template",
        targetId: templateId,
        lead: mediaStaffUserId,
        assistants: [hostUserId, adminUserId],
        createdByUserId: adminUserId,
      });

      const rows = await getDb()
        .select({ id: coachingAssignments.id, active: coachingAssignments.active, role: coachingAssignments.role })
        .from(coachingAssignments)
        .where(
          and(
            eq(coachingAssignments.kind, "class_template"),
            eq(coachingAssignments.targetId, templateId),
            eq(coachingAssignments.coachUserId, adminUserId),
          ),
        );
      // Exactly one row for this (coach, kind, target) ever — the unique
      // constraint plus onConflictDoUpdate guarantees reactivation, not a
      // second insert.
      expect(rows).toHaveLength(1);
      expect(rows[0].active).toBe(true);
      expect(rows[0].role).toBe("assistant");
    });

    it("(F1) lead re-listed among assistants does not count against the assistant cap", async () => {
      // adminUserId is both `lead` and repeated in `assistants` — the real
      // assistant set is just [mediaStaffUserId, mediaEditorUserId] (2, at
      // the cap). Before the fix, the cap check ran on the raw
      // (pre-dedupe-against-lead) assistants array and rejected this.
      const freshTemplateId = await createTestClassTemplate({
        organizationId,
        venueId,
        name: `Resolver-LeadOverlap-${Date.now()}`,
        capacity: 10,
      });
      createdTemplateIds.push(freshTemplateId);

      await setCoachesFor({
        organizationId,
        kind: "class_template",
        targetId: freshTemplateId,
        lead: adminUserId,
        assistants: [adminUserId, mediaStaffUserId, mediaEditorUserId],
        createdByUserId: adminUserId,
      });

      const coaches = await getCoachesFor("class_template", freshTemplateId);
      createdAssignmentIds.push(
        ...(await getDb()
          .select({ id: coachingAssignments.id })
          .from(coachingAssignments)
          .where(
            and(
              eq(coachingAssignments.kind, "class_template"),
              eq(coachingAssignments.targetId, freshTemplateId),
            ),
          )).map((r) => r.id),
      );

      expect(coaches).toHaveLength(3);
      const byId = new Map(coaches.map((c) => [c.coachUserId, c]));
      expect(byId.get(adminUserId)?.role).toBe("lead");
      expect(byId.get(mediaStaffUserId)?.role).toBe("assistant");
      expect(byId.get(mediaEditorUserId)?.role).toBe("assistant");
    });

    it("(d) rejects more than 2 assistants with a typed error, leaving the roster unchanged", async () => {
      await expect(
        setCoachesFor({
          organizationId,
          kind: "class_template",
          targetId: templateId,
          lead: mediaStaffUserId,
          assistants: [hostUserId, adminUserId, mediaEditorUserId],
          createdByUserId: adminUserId,
        }),
      ).rejects.toBeInstanceOf(TooManyAssistantCoachesError);

      // Unchanged from the previous step.
      const coaches = await getCoachesFor("class_template", templateId);
      expect(coaches).toHaveLength(3);
    });
  });

  describe("isOrgCoachingStaff — org-scoped coach-role read gate", () => {
    it("returns true for the seeded coach in their own org", async () => {
      expect(await isOrgCoachingStaff(seededCoachUserId, organizationId)).toBe(true);
    });

    it("returns false for a non-coach user (parent role)", async () => {
      expect(await isOrgCoachingStaff(parentUserId, organizationId)).toBe(false);
    });

    it("returns false for the seeded coach against a different (bogus) org", async () => {
      expect(await isOrgCoachingStaff(seededCoachUserId, crypto.randomUUID())).toBe(false);
    });
  });

  describe("F2 — cross-org trust boundary", () => {
    describe("canCoachReachFamilyMember denies a target that actually belongs to another org", () => {
      it("class_template branch: assignment row claims orgA, but the template is orgB's", async () => {
        const orgBTemplateId = await createTestClassTemplate({
          organizationId: orgBId,
          venueId: orgBVenueId,
          name: `Resolver-CrossOrgTemplate-${Date.now()}`,
          capacity: 10,
        });
        createdTemplateIds.push(orgBTemplateId);

        const childId = await makeChild(`CrossOrgTemplateChild-${Date.now()}`);
        await activeEnrollment(orgBTemplateId, childId, `crossorg-template-${Date.now()}`);

        // Directly inserted (not via setCoachesFor, which now blocks exactly
        // this at write time — see the setCoachesFor test below) to prove
        // the READ side (canCoachReachFamilyMember) has its OWN
        // defense-in-depth and doesn't just trust the assignment row's
        // stamped organizationId.
        const [assignment] = await getDb()
          .insert(coachingAssignments)
          .values({
            organizationId, // orgA — the assignment row LIES about its org
            coachUserId: hostUserId,
            kind: "class_template",
            targetId: orgBTemplateId, // but the template actually belongs to orgB
            role: "lead",
          })
          .returning();
        createdAssignmentIds.push(assignment.id);

        const reached = await canCoachReachFamilyMember(hostUserId, childId, organizationId);
        expect(reached).toBe(false);
      });

      it("class_session branch: assignment row claims orgA, but the session is orgB's", async () => {
        const orgBTemplateId = await createTestClassTemplate({
          organizationId: orgBId,
          venueId: orgBVenueId,
          name: `Resolver-CrossOrgSession-${Date.now()}`,
          capacity: 10,
        });
        createdTemplateIds.push(orgBTemplateId);

        const startsAt = new Date(Date.now() + 4 * 86_400_000);
        const endsAt = new Date(startsAt.getTime() + 55 * 60_000);
        const [orgBSession] = await getDb()
          .insert(dropInSessions)
          .values({
            organizationId: orgBId,
            venueId: orgBVenueId,
            kind: "class",
            sportOrClassLabel: "Soccer",
            startsAt,
            endsAt,
            capacity: 10,
            classSlotTemplateId: orgBTemplateId,
          })
          .returning();
        createdSessionIds.push(orgBSession.id);

        const childId = await makeChild(`CrossOrgSessionChild-${Date.now()}`);
        const [booking] = await getDb()
          .insert(dropInBookings)
          .values({
            sessionId: orgBSession.id,
            userId: parentUserId,
            familyMemberId: childId,
            status: "confirmed",
            source: "online_booking",
            paymentMethod: "card_online",
          })
          .returning();
        createdBookingIds.push(booking.id);

        const [assignment] = await getDb()
          .insert(coachingAssignments)
          .values({
            organizationId, // orgA — lies about its org, same as above
            coachUserId: hostUserId,
            kind: "class_session",
            targetId: orgBSession.id, // but the session actually belongs to orgB
            role: "assistant",
          })
          .returning();
        createdAssignmentIds.push(assignment.id);

        const reached = await canCoachReachFamilyMember(hostUserId, childId, organizationId);
        expect(reached).toBe(false);
      });
    });

    describe("setCoachesFor rejects a target belonging to another org", () => {
      it("class_template: targetId is a template that belongs to orgB", async () => {
        const orgBTemplateId = await createTestClassTemplate({
          organizationId: orgBId,
          venueId: orgBVenueId,
          name: `Resolver-SetCoaches-CrossOrgTemplate-${Date.now()}`,
          capacity: 10,
        });
        createdTemplateIds.push(orgBTemplateId);

        await expect(
          setCoachesFor({
            organizationId, // orgA
            kind: "class_template",
            targetId: orgBTemplateId, // belongs to orgB
            lead: hostUserId,
            assistants: [],
            createdByUserId: adminUserId,
          }),
        ).rejects.toBeInstanceOf(AssignmentTargetOrgMismatchError);

        // Nothing should have been written.
        const coaches = await getCoachesFor("class_template", orgBTemplateId);
        expect(coaches).toHaveLength(0);
      });

      it("class_session: targetId is a session that belongs to orgB", async () => {
        const orgBTemplateId = await createTestClassTemplate({
          organizationId: orgBId,
          venueId: orgBVenueId,
          name: `Resolver-SetCoaches-CrossOrgSession-${Date.now()}`,
          capacity: 10,
        });
        createdTemplateIds.push(orgBTemplateId);

        const startsAt = new Date(Date.now() + 5 * 86_400_000);
        const endsAt = new Date(startsAt.getTime() + 55 * 60_000);
        const [orgBSession] = await getDb()
          .insert(dropInSessions)
          .values({
            organizationId: orgBId,
            venueId: orgBVenueId,
            kind: "class",
            sportOrClassLabel: "Soccer",
            startsAt,
            endsAt,
            capacity: 10,
            classSlotTemplateId: orgBTemplateId,
          })
          .returning();
        createdSessionIds.push(orgBSession.id);

        await expect(
          setCoachesFor({
            organizationId, // orgA
            kind: "class_session",
            targetId: orgBSession.id, // belongs to orgB
            lead: hostUserId,
            assistants: [],
            createdByUserId: adminUserId,
          }),
        ).rejects.toBeInstanceOf(AssignmentTargetOrgMismatchError);

        const coaches = await getCoachesFor("class_session", orgBSession.id);
        expect(coaches).toHaveLength(0);
      });
    });
  });

  describe("integration: deactivation and dual-assignment precedence", () => {
    it("deactivating a coach via setCoachesFor revokes canCoachReachFamilyMember end-to-end", async () => {
      const templateId = await createTestClassTemplate({
        organizationId,
        venueId,
        name: `Resolver-RevokeReach-${Date.now()}`,
        capacity: 10,
      });
      createdTemplateIds.push(templateId);

      const childId = await makeChild(`RevokeReachChild-${Date.now()}`);
      await activeEnrollment(templateId, childId, `revoke-reach-${Date.now()}`);

      await setCoachesFor({
        organizationId,
        kind: "class_template",
        targetId: templateId,
        lead: hostUserId,
        assistants: [],
        createdByUserId: adminUserId,
      });
      expect(await canCoachReachFamilyMember(hostUserId, childId, organizationId)).toBe(true);

      // Declarative replace WITHOUT hostUserId — they're deactivated, not
      // just superseded.
      await setCoachesFor({
        organizationId,
        kind: "class_template",
        targetId: templateId,
        lead: adminUserId,
        assistants: [],
        createdByUserId: adminUserId,
      });
      createdAssignmentIds.push(
        ...(await getDb()
          .select({ id: coachingAssignments.id })
          .from(coachingAssignments)
          .where(
            and(
              eq(coachingAssignments.kind, "class_template"),
              eq(coachingAssignments.targetId, templateId),
            ),
          )).map((r) => r.id),
      );

      expect(await canCoachReachFamilyMember(hostUserId, childId, organizationId)).toBe(false);
    });

    it("a coach with BOTH a template assignment and a session assignment on that template gets sessionOnly: false", async () => {
      const templateId = await createTestClassTemplate({
        organizationId,
        venueId,
        name: `Resolver-DualAssignment-${Date.now()}`,
        capacity: 10,
      });
      createdTemplateIds.push(templateId);

      const startsAt = new Date(Date.now() + 6 * 86_400_000);
      const endsAt = new Date(startsAt.getTime() + 55 * 60_000);
      const [session] = await getDb()
        .insert(dropInSessions)
        .values({
          organizationId,
          venueId,
          kind: "class",
          sportOrClassLabel: "Soccer",
          startsAt,
          endsAt,
          capacity: 10,
          classSlotTemplateId: templateId,
        })
        .returning();
      createdSessionIds.push(session.id);

      const [templateAssignment] = await getDb()
        .insert(coachingAssignments)
        .values({
          organizationId,
          coachUserId: mediaEditorUserId,
          kind: "class_template",
          targetId: templateId,
          role: "lead",
        })
        .returning();
      createdAssignmentIds.push(templateAssignment.id);

      const [sessionAssignment] = await getDb()
        .insert(coachingAssignments)
        .values({
          organizationId,
          coachUserId: mediaEditorUserId,
          kind: "class_session",
          targetId: session.id,
          role: "lead",
        })
        .returning();
      createdAssignmentIds.push(sessionAssignment.id);

      const { classGroups } = await getCoachGroups(mediaEditorUserId, organizationId);
      const group = classGroups.find((g) => g.templateId === templateId);
      expect(group).toBeDefined();
      expect(group?.sessionOnly).toBe(false);
      expect(group?.role).toBe("lead");
    });
  });
});
