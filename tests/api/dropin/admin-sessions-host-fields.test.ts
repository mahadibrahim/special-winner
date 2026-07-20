import { describe, it, expect, beforeAll } from "vitest";
import { apiFetch, getAdminCookie } from "../setup/test-helpers";
import { assignHostToSession } from "@/lib/dropin/host-assignment";
import {
  createTestDropInSession,
  resolveDefaultOrgForHttpTests,
} from "../../utils/dropin-helpers";
import { createTestHost } from "../../utils/host-helpers";

const ENDPOINT_BASE = "/api/admin/dropin/sessions";

describe("GET /api/admin/dropin/sessions host fields", () => {
  let cookie: string;
  beforeAll(async () => {
    cookie = await getAdminCookie();
  });

  it("every row carries hostUserId and hostName keys (null when unhosted)", async () => {
    const res = await apiFetch(`${ENDPOINT_BASE}`, {
      headers: { Cookie: cookie },
    });
    expect(res.status).toBe(200);
    const { sessions } = await res.json();
    expect(Array.isArray(sessions)).toBe(true);
    for (const s of sessions) {
      expect(s).toHaveProperty("hostUserId");
      expect(s).toHaveProperty("hostName");
    }
  });

  it("returns a non-empty hostName and matching hostUserId for a hosted session", async () => {
    const { organizationId, venueId } = await resolveDefaultOrgForHttpTests();
    const ctx = await createTestDropInSession({ organizationId, venueId });
    const host = await createTestHost({ organizationId });
    const assigned = await assignHostToSession({
      sessionId: ctx.sessionId,
      hostUserId: host.userId,
    });
    expect(assigned.ok).toBe(true);

    const res = await apiFetch(`${ENDPOINT_BASE}`, {
      headers: { Cookie: cookie },
    });
    expect(res.status).toBe(200);
    const { sessions } = await res.json();
    const row = sessions.find((s: { id: string }) => s.id === ctx.sessionId);
    expect(row).toBeDefined();
    expect(row.hostUserId).toBe(host.userId);
    expect(typeof row.hostName).toBe("string");
    expect(row.hostName.length).toBeGreaterThan(0);
  });
});
