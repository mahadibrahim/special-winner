import { describe, it, expect, beforeAll } from "vitest";
import { apiFetch } from "../setup/test-helpers";

/**
 * Cross-tenant isolation tests for GET /api/public/team-registrations/[token].
 *
 * Node.js fetch drops the Host header (forbidden header per the Fetch spec),
 * so direct "Org B host" routing is not testable here. Instead we use the
 * following setup:
 *
 *   - Org A token (seeded with organizationId = aspire-sports):
 *       Default host → middleware resolves Org A → org matches → 200
 *
 *   - Org B token (seeded with organizationId = orgb):
 *       Default host → middleware resolves Org A → org mismatch → 404
 *
 * This verifies the safety property: a token whose organizationId does NOT
 * match the resolved tenant returns 404. 404 (not 403) hides the existence
 * of cross-tenant rows, consistent with the seasons/[id] precedent.
 */
describe("GET /api/public/team-registrations/[token] — cross-tenant isolation", () => {
  let orgAToken: string;
  let orgBToken: string;

  beforeAll(async () => {
    // Resolve Org A's seeded team_registration token
    const orgARes = await apiFetch("/api/test/org-fixtures?slug=aspire-sports");
    expect(orgARes.status).toBe(200);
    const orgAFix = await orgARes.json();
    expect(orgAFix.teamRegToken).toBeTruthy();
    orgAToken = orgAFix.teamRegToken;

    // Resolve Org B's seeded team_registration token
    const orgBRes = await apiFetch("/api/test/org-fixtures?slug=orgb");
    expect(orgBRes.status).toBe(200);
    const orgBFix = await orgBRes.json();
    expect(orgBFix.teamRegToken).toBeTruthy();
    orgBToken = orgBFix.teamRegToken;
  });

  it("Org A token on the default (Org A) host returns 200", async () => {
    const res = await apiFetch(`/api/public/team-registrations/${orgAToken}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.team).toBeDefined();
    expect(body.team.teamName).toBeDefined();
  });

  it("Org B token on the default (Org A) host returns 404 — org mismatch hidden", async () => {
    const res = await apiFetch(`/api/public/team-registrations/${orgBToken}`);
    expect(res.status).toBe(404);
  });

  it("a completely unknown token returns 404", async () => {
    const res = await apiFetch("/api/public/team-registrations/no-such-token-xyz-9999");
    expect(res.status).toBe(404);
  });
});
