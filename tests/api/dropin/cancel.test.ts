import { describe, it, expect } from "vitest";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { dropInSessions, dropInBookings } from "@/lib/db/schema/drop-in";
import { assignHostToSession } from "@/lib/dropin/host-assignment";
import { apiFetch, getAuthCookie } from "../setup/test-helpers";
import {
  createTestDropInSession,
  resolveDefaultOrgForHttpTests,
} from "../../utils/dropin-helpers";
import { createTestHost } from "../../utils/host-helpers";

describe("POST /api/dropin/bookings/:id/cancel", () => {
  it("rejects unauthenticated requests (401)", async () => {
    const res = await apiFetch(
      "/api/dropin/bookings/00000000-0000-0000-0000-000000000000/cancel",
      { method: "POST" },
    );
    expect(res.status).toBe(401);
  });
});

describe("POST /api/admin/dropin/sessions/:id/cancel — hosted session", () => {
  it("cancelling a hosted session clears hostUserId and cancels the comp booking without error", async () => {
    const { organizationId, venueId } = await resolveDefaultOrgForHttpTests();
    const ctx = await createTestDropInSession({ organizationId, venueId });
    const host = await createTestHost({ organizationId });
    expect(
      (await assignHostToSession({ sessionId: ctx.sessionId, hostUserId: host.userId })).ok,
    ).toBe(true);

    const cookie = await getAuthCookie("admin@test.aspiresports.com", "TestAdmin123!");
    const res = await apiFetch(`/api/admin/dropin/sessions/${ctx.sessionId}/cancel`, {
      method: "POST",
      cookie,
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);

    const db = getDb();
    const [session] = await db
      .select()
      .from(dropInSessions)
      .where(eq(dropInSessions.id, ctx.sessionId));
    expect(session.hostUserId).toBeNull();
    expect(session.status).toBe("cancelled");

    const [comp] = await db
      .select()
      .from(dropInBookings)
      .where(
        and(
          eq(dropInBookings.sessionId, ctx.sessionId),
          eq(dropInBookings.userId, host.userId),
          eq(dropInBookings.paymentMethod, "host_comp"),
        ),
      );
    expect(comp.status).toBe("cancelled");
  });
});

describe("POST /api/admin/dropin/bookings/:id/refund", () => {
  it("rejects unauthenticated requests (401)", async () => {
    const res = await apiFetch(
      "/api/admin/dropin/bookings/00000000-0000-0000-0000-000000000000/refund",
      { method: "POST" },
    );
    expect(res.status).toBe(401);
  });

  it("rejects non-admin users (403)", async () => {
    const { getParentCookie } = await import("../setup/test-helpers");
    const cookie = await getParentCookie();
    const res = await apiFetch(
      "/api/admin/dropin/bookings/00000000-0000-0000-0000-000000000000/refund",
      { method: "POST", cookie },
    );
    expect(res.status).toBe(403);
  });
});
