import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getDb } from "@/lib/db";
import { registrations, familyMembers, payments, type Registration } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import {
  getAdminCookie,
  apiFetch,
  expectJson,
  resetCookies,
} from "../setup/test-helpers";

/**
 * Tests for the admin-direct cancel / refund / delete surface added in
 * the admin-registration-management feature. Inserts and operates on
 * throwaway rows; uses an existing seeded registration as a source of
 * valid season / family member / user FKs so we don't have to recreate
 * the whole tenant graph.
 */
describe("Admin Registration Detail API", () => {
  let adminCookie: string;
  let templateRegistration: Registration | null = null;
  const cleanupIds: string[] = [];
  const cleanupMemberIds: string[] = [];

  async function createTestRegistration(overrides: Partial<typeof registrations.$inferInsert> = {}) {
    if (!templateRegistration) {
      throw new Error("No template registration available for tests");
    }
    // Each throwaway registration gets its own family member —
    // registrations_member_season_active_uniq forbids two *active*
    // registrations sharing one (family_member, season) pair.
    const [member] = await getDb()
      .insert(familyMembers)
      .values({
        parentUserId: templateRegistration.registeredByUserId,
        firstName: "Test",
        lastName: `Registrant-${cleanupMemberIds.length + 1}`,
        birthDate: "2015-01-01",
      })
      .returning();
    cleanupMemberIds.push(member.id);

    const [row] = await getDb()
      .insert(registrations)
      .values({
        seasonId: templateRegistration.seasonId,
        familyMemberId: member.id,
        registeredByUserId: templateRegistration.registeredByUserId,
        status: "pending",
        paymentStatus: "unpaid",
        amountPaidCents: 0,
        amountDueCents: 10000,
        ...overrides,
      })
      .returning();
    cleanupIds.push(row.id);
    return row;
  }

  beforeAll(async () => {
    adminCookie = await getAdminCookie();

    // Grab any existing registration from the admin list to use as an FK template.
    const listRes = await apiFetch("/api/admin/registrations?limit=1", {
      cookie: adminCookie,
    });
    const listJson = await listRes.json();
    if (!listJson.registrations || listJson.registrations.length === 0) {
      console.warn("No seeded registrations — admin registration detail tests will skip");
      return;
    }
    const firstId = listJson.registrations[0].id;
    const [full] = await getDb()
      .select()
      .from(registrations)
      .where(eq(registrations.id, firstId));
    templateRegistration = full ?? null;
  });

  afterAll(async () => {
    // Registrations first — family_members is referenced with onDelete restrict.
    for (const id of cleanupIds) {
      await getDb().delete(registrations).where(eq(registrations.id, id)).catch(() => {});
    }
    for (const id of cleanupMemberIds) {
      await getDb().delete(familyMembers).where(eq(familyMembers.id, id)).catch(() => {});
    }
    resetCookies();
  });

  describe("GET /api/admin/registrations/[id]", () => {
    it("rejects unauthenticated (401)", async () => {
      const res = await apiFetch("/api/admin/registrations/00000000-0000-0000-0000-000000000000");
      expect(res.status).toBe(401);
    });

    it("returns 404 for unknown id", async () => {
      const res = await apiFetch(
        "/api/admin/registrations/00000000-0000-0000-0000-000000000000",
        { cookie: adminCookie },
      );
      expect(res.status).toBe(404);
    });

    it("returns full detail for an existing registration (200)", async () => {
      if (!templateRegistration) return;
      const res = await apiFetch(`/api/admin/registrations/${templateRegistration.id}`, {
        cookie: adminCookie,
      });
      const json = await expectJson(res, 200);
      expect(json.registration.id).toBe(templateRegistration.id);
      expect(json.familyMember).toBeDefined();
      expect(json.season).toBeDefined();
      expect(json.program).toBeDefined();
      expect(json.parent).toBeDefined();
      expect(Array.isArray(json.paymentHistory)).toBe(true);
    });
  });

  describe("POST /api/admin/registrations/[id]/cancel", () => {
    it("rejects unauthenticated (401)", async () => {
      const res = await apiFetch(
        "/api/admin/registrations/00000000-0000-0000-0000-000000000000/cancel",
        { method: "POST", body: JSON.stringify({}) },
      );
      expect(res.status).toBe(401);
    });

    it("cancels an active registration with a reason (200)", async () => {
      if (!templateRegistration) return;
      const reg = await createTestRegistration();
      const res = await apiFetch(`/api/admin/registrations/${reg.id}/cancel`, {
        method: "POST",
        cookie: adminCookie,
        body: JSON.stringify({ reason: "test cancel from admin endpoint" }),
      });
      const json = await expectJson(res, 200);
      expect(json.registration.status).toBe("cancelled");
      expect(json.registration.cancelledReason).toBe("test cancel from admin endpoint");
      expect(json.registration.cancelledAt).not.toBeNull();
    });

    it("returns 400 if registration is already cancelled", async () => {
      if (!templateRegistration) return;
      const reg = await createTestRegistration({ status: "cancelled" });
      const res = await apiFetch(`/api/admin/registrations/${reg.id}/cancel`, {
        method: "POST",
        cookie: adminCookie,
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
    });

    it("returns 404 for unknown id", async () => {
      const res = await apiFetch(
        "/api/admin/registrations/00000000-0000-0000-0000-000000000000/cancel",
        { method: "POST", cookie: adminCookie, body: JSON.stringify({}) },
      );
      expect(res.status).toBe(404);
    });
  });

  describe("POST /api/admin/registrations/[id]/refund", () => {
    it("rejects unauthenticated (401)", async () => {
      const res = await apiFetch(
        "/api/admin/registrations/00000000-0000-0000-0000-000000000000/refund",
        { method: "POST", body: JSON.stringify({ amountCents: 0 }) },
      );
      expect(res.status).toBe(401);
    });

    it("rejects negative amount (400)", async () => {
      if (!templateRegistration) return;
      const reg = await createTestRegistration();
      const res = await apiFetch(`/api/admin/registrations/${reg.id}/refund`, {
        method: "POST",
        cookie: adminCookie,
        body: JSON.stringify({ amountCents: -100 }),
      });
      expect(res.status).toBe(400);
    });

    it("rejects refund > amountPaid (400)", async () => {
      if (!templateRegistration) return;
      const reg = await createTestRegistration({ amountPaidCents: 1000 });
      const res = await apiFetch(`/api/admin/registrations/${reg.id}/refund`, {
        method: "POST",
        cookie: adminCookie,
        body: JSON.stringify({ amountCents: 5000 }),
      });
      expect(res.status).toBe(400);
    });

    it("processes a zero-amount no-op refund (200)", async () => {
      if (!templateRegistration) return;
      const reg = await createTestRegistration();
      const res = await apiFetch(`/api/admin/registrations/${reg.id}/refund`, {
        method: "POST",
        cookie: adminCookie,
        body: JSON.stringify({ amountCents: 0, reason: "no-op" }),
      });
      const json = await expectJson(res, 200);
      expect(json.refund.amountCents).toBe(0);
      expect(json.refund.stripeRefundId).toBeNull();
    });
  });

  describe("DELETE /api/admin/registrations/[id]", () => {
    it("rejects unauthenticated (401)", async () => {
      const res = await apiFetch(
        "/api/admin/registrations/00000000-0000-0000-0000-000000000000",
        { method: "DELETE" },
      );
      expect(res.status).toBe(401);
    });

    it("returns 409 when amountPaid > 0 and not refunded", async () => {
      if (!templateRegistration) return;
      const reg = await createTestRegistration({
        amountPaidCents: 5000,
        paymentStatus: "paid",
      });
      const res = await apiFetch(`/api/admin/registrations/${reg.id}`, {
        method: "DELETE",
        cookie: adminCookie,
      });
      expect(res.status).toBe(409);
    });

    it("succeeds with ?force=true even when paid", async () => {
      if (!templateRegistration) return;
      const reg = await createTestRegistration({
        amountPaidCents: 5000,
        paymentStatus: "paid",
      });
      const res = await apiFetch(`/api/admin/registrations/${reg.id}?force=true`, {
        method: "DELETE",
        cookie: adminCookie,
      });
      const json = await expectJson(res, 200);
      expect(json.deletedId).toBe(reg.id);
      expect(json.forced).toBe(true);

      // GET should now return 404
      const getRes = await apiFetch(`/api/admin/registrations/${reg.id}`, {
        cookie: adminCookie,
      });
      expect(getRes.status).toBe(404);
    });

    it("succeeds without force when amountPaid=0 (200)", async () => {
      if (!templateRegistration) return;
      const reg = await createTestRegistration();
      const res = await apiFetch(`/api/admin/registrations/${reg.id}`, {
        method: "DELETE",
        cookie: adminCookie,
      });
      const json = await expectJson(res, 200);
      expect(json.deletedId).toBe(reg.id);
      expect(json.forced).toBe(false);
    });

    it("force-deletes a row WITH a real payments row: 200, payment survives detached", async () => {
      // Regression: payments.registrationId is onDelete:restrict, so before
      // the transactional detach the delete threw an FK violation → 500.
      // The earlier force test never caught it because its fixture had no
      // payments row — only amountPaidCents on the registration itself.
      if (!templateRegistration) return;
      const reg = await createTestRegistration({
        amountPaidCents: 153,
        paymentStatus: "paid",
      });
      const [payment] = await getDb()
        .insert(payments)
        .values({
          registrationId: reg.id,
          userId: templateRegistration.registeredByUserId,
          amountCents: 153,
          paymentType: "full",
          status: "succeeded",
        })
        .returning();

      const res = await apiFetch(`/api/admin/registrations/${reg.id}?force=true`, {
        method: "DELETE",
        cookie: adminCookie,
      });
      const json = await expectJson(res, 200);
      expect(json.deletedId).toBe(reg.id);

      // The money record survives, detached from the deleted registration.
      const [survivor] = await getDb()
        .select({ id: payments.id, registrationId: payments.registrationId })
        .from(payments)
        .where(eq(payments.id, payment.id));
      expect(survivor).toBeTruthy();
      expect(survivor.registrationId).toBeNull();

      // Cleanup the orphaned payment row.
      await getDb().delete(payments).where(eq(payments.id, payment.id));
    });
  });
});
