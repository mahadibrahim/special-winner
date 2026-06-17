import { describe, it, expect } from "vitest";
const BASE = process.env.TEST_BASE_URL ?? "http://localhost:4321";

describe("GET /api/public/seasons/:id detail", () => {
  it("includes registrationCloses + earlyBirdDeadline keys", async () => {
    const list = await (await fetch(`${BASE}/api/public/seasons?sport=soccer&audience=adult`)).json();
    const id = list.seasons?.[0]?.id;
    expect(id).toBeTruthy();
    const res = await fetch(`${BASE}/api/public/seasons/${id}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    // Detail handler wraps the season in a `season` envelope:
    // { season: { ... } }. Both the existing test and the registration
    // wizard read `body.season`, so assert the new keys there.
    const s = body.season;
    expect(s).toHaveProperty("registrationCloses");
    expect(s).toHaveProperty("earlyBirdDeadline");
  });
});
