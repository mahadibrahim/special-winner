import { describe, it, expect } from "vitest";
import { getDb } from "@/lib/db";
import { jobApplications } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:4321";

// Turnstile note: verifyTurnstile fails OPEN when no secret is configured
// (dev/CI), so no token is needed here. The fail-closed prod path is
// covered by tests/unit on the existing helper.
function formFor(overrides: Record<string, string | string[]> = {}): FormData {
  const fd = new FormData();
  const fields: Record<string, string | string[]> = {
    role: "referee",
    firstName: "Api",
    lastName: "Applicant",
    email: `careers-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
    experience: "Two seasons officiating.",
    availability: ["weeknights"],
    ...overrides,
  };
  for (const [k, v] of Object.entries(fields)) {
    if (Array.isArray(v)) v.forEach((item) => fd.append(k, item));
    else fd.append(k, v);
  }
  return fd;
}

describe("POST /api/public/careers/apply", () => {
  it("stores a valid application and returns its id", async () => {
    const email = `careers-ok-${Date.now()}@example.com`;
    const res = await fetch(`${BASE}/api/public/careers/apply`, {
      method: "POST",
      body: formFor({ email }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);

    const [row] = await getDb()
      .select()
      .from(jobApplications)
      .where(eq(jobApplications.id, body.id));
    expect(row.email).toBe(email);
    expect(row.role).toBe("referee");
    expect(row.status).toBe("new");
    // Notion env is absent in CI/dev → row stored unsynced, request still 200.
    expect(row.notionSyncedAt).toBeNull();
  });

  it("rejects an invalid application with field details", async () => {
    const res = await fetch(`${BASE}/api/public/careers/apply`, {
      method: "POST",
      body: formFor({ role: "janitor" }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("rejects a non-PDF resume", async () => {
    const fd = formFor();
    fd.append("resume", new File([new Uint8Array([1, 2, 3])], "resume.exe", { type: "application/octet-stream" }));
    const res = await fetch(`${BASE}/api/public/careers/apply`, { method: "POST", body: fd });
    expect(res.status).toBe(400);
  });

  it("rate limits after 5 submissions per minute", async () => {
    let last = 0;
    for (let i = 0; i < 7; i++) {
      const res = await fetch(`${BASE}/api/public/careers/apply`, {
        method: "POST",
        body: formFor(),
      });
      last = res.status;
      if (last === 429) break;
    }
    expect(last).toBe(429);
  });
});
