import { describe, it, expect, beforeAll } from "vitest";
import { apiFetch } from "../setup/test-helpers";

/**
 * Tenant-isolation tests for GET /api/public/events.
 *
 * Node.js fetch silently drops the Host header (it is a "forbidden header"
 * per the Fetch spec) so tenant switching by header is not testable in
 * integration tests. Instead we verify isolation by checking that Org A's
 * default-host response contains none of Org B's organizationId, which is
 * the meaningful cross-tenant leak assertion.
 *
 * Org A ("aspire-sports") — resolved as the default org on localhost.
 * Org B ("orgb")          — seeded for multi-tenant scoping tests.
 */
describe("GET /api/public/events — tenant scoping", () => {
  let orgAId: string;
  let orgBId: string;

  beforeAll(async () => {
    // Fetch Org B's id
    const orgBRes = await apiFetch("/api/test/org-fixtures?slug=orgb");
    expect(orgBRes.status).toBe(200);
    const orgBFix = await orgBRes.json();
    expect(orgBFix.org?.id).toBeTruthy();
    orgBId = orgBFix.org.id;

    // Fetch Org A's id
    const orgARes = await apiFetch("/api/test/org-fixtures?slug=aspire-sports");
    expect(orgARes.status).toBe(200);
    const orgAFix = await orgARes.json();
    expect(orgAFix.org?.id).toBeTruthy();
    orgAId = orgAFix.org.id;
  });

  it("on the default (Org A) host, every returned event belongs to Org A; no Org B leak", async () => {
    const res = await apiFetch("/api/public/events");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.events)).toBe(true);

    // Requires at least one event so the for-loops below are non-vacuous.
    expect(body.events.length).toBeGreaterThan(0);

    // Defensive leak assertion: no event with Org B's org id should be returned.
    for (const ev of body.events) {
      expect(ev.organizationId).not.toBe(orgBId);
    }

    // Positive ownership: every returned event must belong to Org A.
    for (const ev of body.events) {
      expect(ev.organizationId).toBe(orgAId);
    }
  });
});
