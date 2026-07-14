import { describe, it, expect } from "vitest";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { dropInSessions, dropInBookings } from "@/lib/db/schema/drop-in";
import { assignHostToSession, removeHostFromSession } from "@/lib/dropin/host-assignment";
import { createTestDropInSession, resolveDefaultOrgForHttpTests } from "../../utils/dropin-helpers";
import { createTestHost } from "../../utils/host-helpers";
import { getAuthCookie, apiFetch } from "../setup/test-helpers";

describe("assignHostToSession", () => {
  it("sets hostUserId and creates a confirmed $0 host_comp booking", async () => {
    const ctx = await createTestDropInSession({ capacity: 10 });
    const host = await createTestHost({ organizationId: ctx.organizationId });

    const result = await assignHostToSession({
      sessionId: ctx.sessionId,
      hostUserId: host.userId,
    });
    expect(result.ok).toBe(true);

    const [session] = await getDb()
      .select()
      .from(dropInSessions)
      .where(eq(dropInSessions.id, ctx.sessionId));
    expect(session.hostUserId).toBe(host.userId);

    const [comp] = await getDb()
      .select()
      .from(dropInBookings)
      .where(
        and(
          eq(dropInBookings.sessionId, ctx.sessionId),
          eq(dropInBookings.userId, host.userId),
        ),
      );
    expect(comp.status).toBe("confirmed");
    expect(comp.paymentMethod).toBe("host_comp");
    expect(comp.amountPaidCents).toBe(0);
  });

  it("assigns even when the session is full (comp booking bypasses capacity)", async () => {
    const ctx = await createTestDropInSession({ capacity: 0 });
    const host = await createTestHost({ organizationId: ctx.organizationId });
    const result = await assignHostToSession({
      sessionId: ctx.sessionId,
      hostUserId: host.userId,
    });
    expect(result.ok).toBe(true);
  });

  it("rejects a non-active host profile", async () => {
    const ctx = await createTestDropInSession({});
    const host = await createTestHost({
      organizationId: ctx.organizationId,
      status: "paused",
    });
    const result = await assignHostToSession({
      sessionId: ctx.sessionId,
      hostUserId: host.userId,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("not_active_host");
  });

  it("rejects when already hosted (without allowReplace) and replaces with it", async () => {
    const ctx = await createTestDropInSession({});
    const hostA = await createTestHost({ organizationId: ctx.organizationId });
    const hostB = await createTestHost({ organizationId: ctx.organizationId });

    expect((await assignHostToSession({ sessionId: ctx.sessionId, hostUserId: hostA.userId })).ok).toBe(true);

    const conflict = await assignHostToSession({ sessionId: ctx.sessionId, hostUserId: hostB.userId });
    expect(conflict.ok).toBe(false);
    if (!conflict.ok) expect(conflict.code).toBe("already_hosted");

    const replaced = await assignHostToSession({
      sessionId: ctx.sessionId,
      hostUserId: hostB.userId,
      allowReplace: true,
    });
    expect(replaced.ok).toBe(true);

    // Host A's comp booking is cancelled by the replacement.
    const [aComp] = await getDb()
      .select()
      .from(dropInBookings)
      .where(
        and(
          eq(dropInBookings.sessionId, ctx.sessionId),
          eq(dropInBookings.userId, hostA.userId),
        ),
      );
    expect(aComp.status).toBe("cancelled");
  });

  it("cross-org host is rejected", async () => {
    const ctx = await createTestDropInSession({});
    const otherOrg = await createTestDropInSession({});
    const foreignHost = await createTestHost({ organizationId: otherOrg.organizationId });
    const result = await assignHostToSession({
      sessionId: ctx.sessionId,
      hostUserId: foreignHost.userId,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("not_active_host");
  });
});

describe("removeHostFromSession", () => {
  it("clears hostUserId and cancels the comp booking", async () => {
    const ctx = await createTestDropInSession({});
    const host = await createTestHost({ organizationId: ctx.organizationId });
    await assignHostToSession({ sessionId: ctx.sessionId, hostUserId: host.userId });

    const removed = await removeHostFromSession({
      sessionId: ctx.sessionId,
      reason: "admin_removed",
    });
    expect(removed.removedHostUserId).toBe(host.userId);

    const [session] = await getDb()
      .select()
      .from(dropInSessions)
      .where(eq(dropInSessions.id, ctx.sessionId));
    expect(session.hostUserId).toBeNull();

    const [comp] = await getDb()
      .select()
      .from(dropInBookings)
      .where(
        and(
          eq(dropInBookings.sessionId, ctx.sessionId),
          eq(dropInBookings.userId, host.userId),
        ),
      );
    expect(comp.status).toBe("cancelled");
    expect(comp.cancellationReason).toBe("admin_override");
  });
});

describe("PUT/DELETE /api/admin/dropin/sessions/:id/host", () => {
  it("admin assigns and removes a host over HTTP; cross-org session 404s", async () => {
    const cookie = await getAuthCookie("admin@test.aspiresports.com", "TestAdmin123!");
    const { organizationId, venueId } = await resolveDefaultOrgForHttpTests();
    const ctx = await createTestDropInSession({ organizationId, venueId });
    const host = await createTestHost({ organizationId });

    const put = await apiFetch(`/api/admin/dropin/sessions/${ctx.sessionId}/host`, {
      method: "PUT",
      cookie,
      body: JSON.stringify({ hostUserId: host.userId }),
      headers: { "Content-Type": "application/json" },
    });
    expect(put.status).toBe(200);

    const del = await apiFetch(`/api/admin/dropin/sessions/${ctx.sessionId}/host`, {
      method: "DELETE",
      cookie,
    });
    expect(del.status).toBe(200);

    // Cross-org: a session in a fresh (non-HQ) org must 404 for this admin.
    const foreign = await createTestDropInSession({});
    const crossOrg = await apiFetch(`/api/admin/dropin/sessions/${foreign.sessionId}/host`, {
      method: "PUT",
      cookie,
      body: JSON.stringify({ hostUserId: host.userId }),
      headers: { "Content-Type": "application/json" },
    });
    expect(crossOrg.status).toBe(404);
  });
});
