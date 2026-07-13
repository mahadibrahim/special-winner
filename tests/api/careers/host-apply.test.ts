import { describe, it, expect } from "vitest";
import { apiFetch } from "../setup/test-helpers";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:4321";

// Turnstile note: verifyTurnstile fails OPEN when no secret is configured
// (dev/CI), so no token is needed here — same assumption as
// tests/api/careers/apply.test.ts.
//
// FormData note: use plain `fetch` (not `apiFetch`) for the multipart POSTs,
// matching tests/api/careers/apply.test.ts exactly. apiFetch always injects
// `Content-Type: application/json` by default (and passing `headers: {}`
// does not clear it — the default is spread first, so an empty override
// object leaves it in place), which stomps the multipart boundary fetch
// needs when the body is a FormData instance and makes the server 400 with
// "Expected multipart form data". Verified against a running dev server.
function hostForm(overrides: Record<string, string> = {}) {
  const form = new FormData();
  const base: Record<string, string> = {
    role: "host",
    firstName: "Hope",
    lastName: "Hoster",
    email: `host-apply-${Date.now()}@t.example`,
    phone: "6145550100",
    preferredLocation: "worthington",
    experience: "I bring the energy. Four sentences of bio.",
    dateOfBirth: "1998-04-02",
    gamesPlayed: "5+",
    weeklyCommitment: "yes",
    photoKey: "careers/hosts/test-photo.jpg",
    motivationVideoKey: "careers/hosts/test-motivation.mp4",
    demoVideoKey: "careers/hosts/test-demo.mp4",
    ...overrides,
  };
  for (const [k, v] of Object.entries(base)) form.set(k, v);
  return form;
}

describe("POST /api/public/careers/apply — host role", () => {
  it("accepts a complete host application", async () => {
    const res = await fetch(`${BASE}/api/public/careers/apply`, {
      method: "POST",
      body: hostForm(),
    });
    expect(res.status).toBe(200);
  });

  it("rejects a host application missing host-required fields", async () => {
    const form = hostForm();
    form.delete("motivationVideoKey");
    const res = await fetch(`${BASE}/api/public/careers/apply`, {
      method: "POST",
      body: form,
    });
    expect(res.status).toBe(400);
  });

  it("rejects media keys outside the careers/hosts/ prefix", async () => {
    const res = await fetch(`${BASE}/api/public/careers/apply`, {
      method: "POST",
      body: hostForm({ photoKey: "../../etc/passwd" }),
    });
    expect(res.status).toBe(400);
  });

  it("referee applications still work without host fields", async () => {
    const form = new FormData();
    form.set("role", "referee");
    form.set("firstName", "Ref");
    form.set("lastName", "Eree");
    form.set("email", `ref-${Date.now()}@t.example`);
    form.set("experience", "USSF grade 8, two seasons.");
    const res = await fetch(`${BASE}/api/public/careers/apply`, {
      method: "POST",
      body: form,
    });
    expect(res.status).toBe(200);
  });
});

describe("POST /api/public/careers/upload-url", () => {
  it("issues a key + url for a valid video request (R2_MOCK)", async () => {
    const res = await apiFetch("/api/public/careers/upload-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "motivation_video",
        contentType: "video/mp4",
        sizeBytes: 50 * 1024 * 1024,
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.key).toMatch(/^careers\/hosts\/[0-9a-f-]+\.mp4$/);
    expect(typeof body.url).toBe("string");
  });

  it("rejects oversize and wrong-type uploads", async () => {
    const over = await apiFetch("/api/public/careers/upload-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "photo", contentType: "image/jpeg", sizeBytes: 6 * 1024 * 1024 }),
    });
    expect(over.status).toBe(400);
    const wrongType = await apiFetch("/api/public/careers/upload-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "demo_video", contentType: "application/x-msdownload", sizeBytes: 1024 }),
    });
    expect(wrongType.status).toBe(400);
  });
});
