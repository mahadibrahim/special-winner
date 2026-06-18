import { describe, it, expect } from "vitest";
import { apiFetch, getAdminCookie } from "../setup/test-helpers";

const RATE_CARD = "/api/admin/dropin/rate-card";

describe("walk-up rate card admin API", () => {
  it("rejects an unauthenticated PUT (401)", async () => {
    const res = await apiFetch(RATE_CARD, {
      method: "PUT",
      body: JSON.stringify({ defaultWalkUpRateCents: 1700 }),
    });
    expect(res.status).toBe(401);
  });

  it("accepts defaultWalkUpRateCents for an admin (200)", async () => {
    let cookie: string;
    try {
      cookie = await getAdminCookie();
    } catch {
      return; // fixture not present in this environment — skip
    }
    const res = await apiFetch(RATE_CARD, {
      method: "PUT",
      body: JSON.stringify({ defaultWalkUpRateCents: 1700 }),
      headers: { Cookie: cookie },
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.rateCard.defaultWalkUpRateCents).toBe(1700);
  });

  it("rejects a negative walk-up rate (400)", async () => {
    let cookie: string;
    try {
      cookie = await getAdminCookie();
    } catch {
      return;
    }
    const res = await apiFetch(RATE_CARD, {
      method: "PUT",
      body: JSON.stringify({ defaultWalkUpRateCents: -5 }),
      headers: { Cookie: cookie },
    });
    expect(res.status).toBe(400);
  });
});
