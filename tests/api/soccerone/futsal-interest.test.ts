import { describe, it, expect } from "vitest";
const BASE = process.env.TEST_BASE_URL ?? "http://localhost:4321";

function post(body: unknown) {
  return fetch(`${BASE}/api/soccerone/futsal-interest`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/soccerone/futsal-interest", () => {
  it("422 on invalid email", async () => {
    const res = await post({ email: "nope" });
    expect(res.status).toBe(422);
  });

  it("200 on a valid email, idempotent on duplicate", async () => {
    const email = `futsal_${Date.now()}@test.aspiresports.com`;
    const first = await post({ email });
    expect(first.status).toBe(200);
    expect((await first.json()).ok).toBe(true);
    const dup = await post({ email });
    expect(dup.status).toBe(200); // idempotent, not 409
  });
});
