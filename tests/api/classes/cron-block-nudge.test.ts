/**
 * Block-abandon nudge cron sweep — POST /api/cron/block-nudge-emails.
 *
 * Uses the messaging mock (MESSAGING_MOCK=1 on the dev server; see
 * src/pages/api/test/messaging-mock.ts and tests/api/cron/fill-alerts.test.ts
 * for the same pattern applied to SMS) to assert the actual email fired
 * rather than only DB side effects. This is the one messaging mode
 * reachable without restarting the dev server (forbidden mid-task), so
 * "MESSAGING gating respected" is exercised via the mock path — the same
 * scope every other cron test in this repo covers (fill-alerts.test.ts
 * never drives the "not configured" branch either).
 *
 * Isolation: every test builds its own class-slot template (via
 * createTestClassTemplate, cleaned up in afterAll) and a dedicated child
 * under the shared class-test parent account, so the base predicate (active
 * credit-backed enrollment, no waiver, no booking on the template) only
 * ever matches fixtures this file created. The shared staging DB can carry
 * other candidates for the SAME parent email from other suites' state, so
 * inbox assertions filter by subject containing the fixture's unique child
 * name rather than asserting exact inbox length — the grant's own
 * `nudgeSentAt` stamp (looked up by exact id) is the unambiguous check.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { classCreditGrants, classEnrollments } from "@/lib/db/schema/classes";
import { dropInSessions, dropInBookings } from "@/lib/db/schema/drop-in";
import { recordLiabilityWaiver } from "@/lib/consents/liability";
import { apiFetch } from "../setup/test-helpers";
import { createTestDropInSession } from "../../utils/dropin-helpers";
import {
  resolveClassTestFixtures,
  createTestChild,
  createTestChildMembership,
  createTestClassTemplate,
  createTestCreditGrant,
  cleanupTestClassFixtures,
} from "../../utils/classes-helpers";

const CRON_SECRET = process.env.CRON_SECRET ?? "";

interface MockInspectResult {
  enabled: boolean;
  messages: Array<{ to: string; subject: string | null; body: string }>;
}

let organizationId: string;
let venueId: string;
let parentUserId: string;
let parentEmail: string;
let tierId: string;

const createdTemplateIds: string[] = [];
const createdEnrollmentIds: string[] = [];

beforeAll(async () => {
  ({ organizationId, venueId, parentUserId, tierId } = await resolveClassTestFixtures());
  // The shared class-test parent's own email — messages land here regardless
  // of which fixture child triggered them.
  parentEmail = "parent@test.aspiresports.com";
});

afterAll(async () => {
  await cleanupTestClassFixtures(createdTemplateIds, createdEnrollmentIds);
});

async function triggerSweep() {
  const res = await apiFetch("/api/cron/block-nudge-emails", {
    method: "POST",
    headers: { "x-cron-secret": CRON_SECRET },
  });
  expect(res.status).toBe(200);
  return res.json();
}

async function clearInbox(): Promise<boolean> {
  const del = await apiFetch("/api/test/messaging-mock", { method: "DELETE" });
  if (del.status !== 200) return false;
  const probe = await apiFetch(
    `/api/test/messaging-mock?to=${encodeURIComponent("probe@example.test")}`,
  );
  if (probe.status !== 200) return false;
  const json = (await probe.json()) as MockInspectResult;
  return json.enabled === true;
}

/** Messages sent to the shared class-test parent whose SUBJECT names this
 *  fixture's specific child — narrows past any other candidate in the
 *  shared DB sharing the same recipient address. */
async function messagesForChild(childFirstName: string) {
  const res = await apiFetch(
    `/api/test/messaging-mock?to=${encodeURIComponent(parentEmail)}&channel=email`,
  );
  expect(res.status).toBe(200);
  const json = (await res.json()) as MockInspectResult;
  return json.messages.filter((m) => (m.subject ?? "").includes(childFirstName));
}

async function grantRow(grantId: string) {
  const db = getDb();
  const [row] = await db
    .select({ nudgeSentAt: classCreditGrants.nudgeSentAt })
    .from(classCreditGrants)
    .where(eq(classCreditGrants.id, grantId));
  return row;
}

/** A fresh template + child + credit grant + active credit-backed
 *  enrollment — the base "skippedNoWaiver" shape the nudge targets, before
 *  any test-specific twist (a booking, a waiver, a membership swap, an
 *  expired grant). */
async function makeCreditBackedFixture(suffix: string, opts: { expiresAt?: Date } = {}) {
  const templateId = await createTestClassTemplate({
    organizationId,
    venueId,
    name: `BlockNudge-Template-${suffix}`,
    capacity: 20,
  });
  createdTemplateIds.push(templateId);

  const childFirstName = `BlockNudge-${suffix}`;
  const childId = await createTestChild(parentUserId, childFirstName);

  const grantId = await createTestCreditGrant({
    organizationId,
    familyMemberId: childId,
    sessionsGranted: 4,
    idSuffix: suffix,
    source: "block",
    slotTemplateId: templateId,
    expiresAt: opts.expiresAt,
  });

  const [enrollment] = await getDb()
    .insert(classEnrollments)
    .values({ slotTemplateId: templateId, familyMemberId: childId, creditGrantId: grantId })
    .returning();
  createdEnrollmentIds.push(enrollment.id);

  return { templateId, childId, childFirstName, grantId, enrollmentId: enrollment.id };
}

describe("POST /api/cron/block-nudge-emails", () => {
  let mockReady = true;

  beforeEach(async () => {
    mockReady = await clearInbox();
    if (!mockReady) {
      console.warn(
        "[block-nudge] MESSAGING_MOCK/E2E_TEST_ENDPOINTS not enabled on dev server — skipping strict assertions",
      );
    }
  });

  it("rejects a wrong cron secret (401)", async (ctx) => {
    if (!CRON_SECRET) return ctx.skip();
    const res = await apiFetch("/api/cron/block-nudge-emails", {
      method: "POST",
      headers: { "x-cron-secret": "definitely-not-the-secret" },
    });
    expect(res.status).toBe(401);
  });

  it("emails an eligible family exactly once across two runs, stamping the grant", async () => {
    if (!CRON_SECRET || !mockReady) return;
    const suffix = `elig-${Date.now()}`;
    const fixture = await makeCreditBackedFixture(suffix);

    // ---- Run 1 ----
    const result1 = await triggerSweep();
    for (const key of ["scanned", "sent", "skipped"]) {
      expect(typeof result1[key]).toBe("number");
    }

    const grantAfterRun1 = await grantRow(fixture.grantId);
    expect(grantAfterRun1.nudgeSentAt).not.toBeNull();

    const messagesRun1 = await messagesForChild(fixture.childFirstName);
    expect(messagesRun1.length).toBe(1);
    expect(messagesRun1[0].body).toContain(
      `/dashboard/family/choose-slot?child=${fixture.childId}&block=success&slot=${fixture.templateId}`,
    );

    const stampAfterRun1 = grantAfterRun1.nudgeSentAt!.getTime();

    // ---- Run 2 — idempotent: no second send, stamp unchanged ----
    await clearInbox();
    await triggerSweep();

    const messagesRun2 = await messagesForChild(fixture.childFirstName);
    expect(messagesRun2.length).toBe(0);

    const grantAfterRun2 = await grantRow(fixture.grantId);
    expect(grantAfterRun2.nudgeSentAt!.getTime()).toBe(stampAfterRun1);
  });

  it("excludes a family that already has a booking on the enrollment's template", async () => {
    if (!CRON_SECRET || !mockReady) return;
    const suffix = `booked-${Date.now()}`;
    const fixture = await makeCreditBackedFixture(suffix);

    // A session materialized against the SAME template, with a booking row
    // for this child — even a cancelled one proves a waiver was captured
    // at some point (see book-child.ts's waiver gate), so the nudge must
    // never fire regardless of the booking's current status.
    const sessionCtx = await createTestDropInSession({
      organizationId,
      venueId,
      kind: "class",
    });
    await getDb()
      .update(dropInSessions)
      .set({ classSlotTemplateId: fixture.templateId })
      .where(eq(dropInSessions.id, sessionCtx.sessionId));
    await getDb().insert(dropInBookings).values({
      sessionId: sessionCtx.sessionId,
      userId: parentUserId,
      familyMemberId: fixture.childId,
      status: "cancelled",
      source: "online_booking",
      paymentMethod: "trial",
      amountPaidCents: 0,
      waiverSigned: true,
      waiverSignedAt: new Date(),
      waiverSignedBy: "Parent Test",
    });

    await triggerSweep();

    const messages = await messagesForChild(fixture.childFirstName);
    expect(messages.length).toBe(0);

    const grant = await grantRow(fixture.grantId);
    expect(grant.nudgeSentAt).toBeNull();
  });

  it("excludes a family whose credit grant has already expired", async () => {
    if (!CRON_SECRET || !mockReady) return;
    const suffix = `expired-${Date.now()}`;
    // Already expired 1 day ago — no weeks left for "pick up your booked
    // weeks" to promise.
    const fixture = await makeCreditBackedFixture(suffix, {
      expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
    });

    await triggerSweep();

    const messages = await messagesForChild(fixture.childFirstName);
    expect(messages.length).toBe(0);

    const grant = await grantRow(fixture.grantId);
    expect(grant.nudgeSentAt).toBeNull();
  });

  it("excludes a family whose child already has a valid waiver on file", async () => {
    if (!CRON_SECRET || !mockReady) return;
    const suffix = `covered-${Date.now()}`;
    const fixture = await makeCreditBackedFixture(suffix);

    await recordLiabilityWaiver({
      familyMemberId: fixture.childId,
      organizationId,
      signedByUserId: parentUserId,
      signedByName: "Parent Test",
      consentVariant: "guardian",
      consentText: "I agree to the guardian waiver on behalf of my child.",
    });

    await triggerSweep();

    const messages = await messagesForChild(fixture.childFirstName);
    expect(messages.length).toBe(0);

    const grant = await grantRow(fixture.grantId);
    expect(grant.nudgeSentAt).toBeNull();
  });

  it("excludes a membership-backed enrollment (no credit grant to nudge)", async () => {
    if (!CRON_SECRET || !mockReady) return;
    const suffix = `member-${Date.now()}`;

    const templateId = await createTestClassTemplate({
      organizationId,
      venueId,
      name: `BlockNudge-Template-${suffix}`,
      capacity: 20,
    });
    createdTemplateIds.push(templateId);

    const childFirstName = `BlockNudge-${suffix}`;
    const childId = await createTestChild(parentUserId, childFirstName);
    const membershipId = await createTestChildMembership({
      userId: parentUserId,
      familyMemberId: childId,
      organizationId,
      tierId,
      idSuffix: suffix,
    });
    const [enrollment] = await getDb()
      .insert(classEnrollments)
      .values({ slotTemplateId: templateId, familyMemberId: childId, membershipId })
      .returning();
    createdEnrollmentIds.push(enrollment.id);

    await triggerSweep();

    const messages = await messagesForChild(childFirstName);
    expect(messages.length).toBe(0);
  });
});
