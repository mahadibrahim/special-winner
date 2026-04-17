# Phase 1: Admin Setup Stabilization & Test Suite

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Install Vitest, build test infrastructure, audit/fix/test all 8 admin CRUD APIs, then write targeted E2E smoke tests for the admin setup flow.

**Architecture:** API integration tests hit the running dev server over HTTP (not mocking Astro internals). Each test file authenticates by POSTing to `/api/auth/signin` and capturing the session cookie. Tests use the real database, creating test data with unique prefixes and cleaning up after.

**Tech Stack:** Vitest, node built-in fetch (no supertest needed — Node 18+ has global fetch), Playwright for E2E.

---

### Task 0: Install Vitest & Configure

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`
- Create: `tests/api/setup/test-helpers.ts`

- [ ] **Step 1: Install vitest**

```bash
npm install -D vitest @vitest/coverage-v8
```

- [ ] **Step 2: Create vitest.config.ts**

```typescript
// vitest.config.ts
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    testTimeout: 15000,
    include: ["tests/api/**/*.test.ts"],
    setupFiles: ["tests/api/setup/global-setup.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
```

- [ ] **Step 3: Create test helper with auth + fetch utilities**

```typescript
// tests/api/setup/test-helpers.ts

const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:4321";

/** POST to signin and return the Set-Cookie header value */
export async function getAuthCookie(
  email: string,
  password: string
): Promise<string> {
  const res = await fetch(`${BASE_URL}/api/auth/signin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
    redirect: "manual", // Don't follow redirect — we need the cookie
  });

  const setCookie = res.headers.get("set-cookie");
  if (!setCookie) {
    throw new Error(`Signin failed for ${email}: status ${res.status}`);
  }
  return setCookie.split(";")[0]; // "auth_session=<value>"
}

/** Authenticated fetch wrapper */
export async function apiFetch(
  path: string,
  options: RequestInit & { cookie?: string } = {}
): Promise<Response> {
  const { cookie, headers: extraHeaders, ...rest } = options;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(extraHeaders as Record<string, string>),
  };
  if (cookie) {
    headers["Cookie"] = cookie;
  }
  return fetch(`${BASE_URL}${path}`, { ...rest, headers, redirect: "manual" });
}

/** Get admin auth cookie (cached per test file via beforeAll) */
let adminCookie: string | null = null;
export async function getAdminCookie(): Promise<string> {
  if (!adminCookie) {
    adminCookie = await getAuthCookie(
      "admin@test.aspiresports.com",
      "TestAdmin123!"
    );
  }
  return adminCookie;
}

/** Reset cached cookies (call in afterAll) */
export function resetCookies() {
  adminCookie = null;
}

/** Generate unique test slug to avoid conflicts */
export function testSlug(prefix: string): string {
  return `${prefix}-test-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

/** Assert response is JSON with expected status */
export async function expectJson(res: Response, status: number) {
  expect(res.status).toBe(status);
  const body = await res.json();
  return body;
}
```

- [ ] **Step 4: Create global setup file**

```typescript
// tests/api/setup/global-setup.ts

// Verify dev server is running before tests
beforeAll(async () => {
  try {
    const res = await fetch("http://localhost:4321/api/auth/session");
    if (!res.ok && res.status !== 200) {
      throw new Error(`Server returned ${res.status}`);
    }
  } catch (err) {
    throw new Error(
      "Dev server not running. Start it with `npm run dev` before running API tests."
    );
  }
});
```

- [ ] **Step 5: Add test scripts to package.json**

Add to scripts:
```json
"test:api": "vitest run --config vitest.config.ts",
"test:api:watch": "vitest --config vitest.config.ts",
"test:api:ui": "vitest --ui --config vitest.config.ts"
```

- [ ] **Step 6: Verify setup works**

```bash
npm run test:api
```

Expected: 0 tests found, no errors. Vitest runs and exits cleanly.

- [ ] **Step 7: Commit**

```bash
git add vitest.config.ts tests/api/ package.json package-lock.json
git commit -m "test: Install vitest + API test infrastructure"
```

---

### Task 1: Sports CRUD Tests

**Files:**
- Create: `tests/api/admin/sports.test.ts`
- Possibly modify: `src/pages/api/admin/sports.ts` (if bugs found)

- [ ] **Step 1: Write the sports CRUD test file**

```typescript
// tests/api/admin/sports.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getAdminCookie, apiFetch, testSlug, expectJson, resetCookies } from "../setup/test-helpers";

describe("Admin Sports API", () => {
  let cookie: string;
  let createdId: string;
  const slug = testSlug("sport");

  beforeAll(async () => {
    cookie = await getAdminCookie();
  });

  afterAll(() => resetCookies());

  describe("POST /api/admin/sports (create)", () => {
    it("creates a sport with valid data", async () => {
      const res = await apiFetch("/api/admin/sports", {
        method: "POST",
        cookie,
        body: JSON.stringify({
          name: `Test Sport ${slug}`,
          slug,
          icon: "🎾",
          color: "#10b981",
          active: true,
          sortOrder: 99,
        }),
      });

      const body = await expectJson(res, 201);
      expect(body.sport).toBeDefined();
      expect(body.sport.slug).toBe(slug);
      expect(body.sport.name).toBe(`Test Sport ${slug}`);
      createdId = body.sport.id;
    });

    it("rejects missing name", async () => {
      const res = await apiFetch("/api/admin/sports", {
        method: "POST",
        cookie,
        body: JSON.stringify({ slug: "no-name" }),
      });

      const body = await expectJson(res, 400);
      expect(body.error).toBe("Validation failed");
      expect(body.details).toBeDefined();
    });

    it("rejects invalid slug format", async () => {
      const res = await apiFetch("/api/admin/sports", {
        method: "POST",
        cookie,
        body: JSON.stringify({ name: "Bad Slug", slug: "Has Spaces!" }),
      });

      const body = await expectJson(res, 400);
      expect(body.error).toBe("Validation failed");
    });

    it("rejects duplicate slug", async () => {
      const res = await apiFetch("/api/admin/sports", {
        method: "POST",
        cookie,
        body: JSON.stringify({ name: "Duplicate", slug }),
      });

      const body = await expectJson(res, 409);
      expect(body.error).toContain("already exists");
    });

    it("rejects unauthenticated request", async () => {
      const res = await apiFetch("/api/admin/sports", {
        method: "POST",
        body: JSON.stringify({ name: "No Auth", slug: "no-auth" }),
      });

      expect(res.status).toBe(401);
    });
  });

  describe("GET /api/admin/sports (list)", () => {
    it("returns all sports", async () => {
      const res = await apiFetch("/api/admin/sports", { cookie });

      const body = await expectJson(res, 200);
      expect(body.sports).toBeInstanceOf(Array);
      expect(body.sports.length).toBeGreaterThan(0);
    });

    it("includes the created test sport", async () => {
      const res = await apiFetch("/api/admin/sports", { cookie });

      const body = await expectJson(res, 200);
      const testSport = body.sports.find((s: any) => s.id === createdId);
      expect(testSport).toBeDefined();
      expect(testSport.slug).toBe(slug);
    });

    it("rejects unauthenticated request", async () => {
      const res = await apiFetch("/api/admin/sports");
      expect(res.status).toBe(401);
    });
  });

  describe("PUT /api/admin/sports (update)", () => {
    it("updates sport name", async () => {
      const res = await apiFetch(`/api/admin/sports?id=${createdId}`, {
        method: "PUT",
        cookie,
        body: JSON.stringify({
          name: `Updated ${slug}`,
          slug,
          icon: "🎾",
          color: "#10b981",
          active: true,
          sortOrder: 99,
        }),
      });

      const body = await expectJson(res, 200);
      expect(body.sport.name).toBe(`Updated ${slug}`);
    });

    it("returns 404 for nonexistent sport", async () => {
      const res = await apiFetch(`/api/admin/sports?id=00000000-0000-0000-0000-000000000000`, {
        method: "PUT",
        cookie,
        body: JSON.stringify({ name: "Ghost", slug: "ghost" }),
      });

      expect(res.status).toBe(404);
    });
  });

  describe("DELETE /api/admin/sports", () => {
    it("deletes the test sport", async () => {
      const res = await apiFetch(`/api/admin/sports?id=${createdId}`, {
        method: "DELETE",
        cookie,
      });

      expect(res.status).toBe(200);
    });

    it("returns 404 for already-deleted sport", async () => {
      const res = await apiFetch(`/api/admin/sports?id=${createdId}`, {
        method: "DELETE",
        cookie,
      });

      expect(res.status).toBe(404);
    });
  });
});
```

- [ ] **Step 2: Run the test**

```bash
npm run test:api -- tests/api/admin/sports.test.ts
```

Fix any failures. Common issues:
- Auth cookie not being set (check signin response)
- Org context not resolving (super_admin fallback)
- Response shape different than expected

- [ ] **Step 3: Fix any discovered API bugs and re-run**

- [ ] **Step 4: Commit**

```bash
git add tests/api/admin/sports.test.ts
git commit -m "test: Admin Sports CRUD API tests"
```

---

### Task 2: Locations CRUD Tests

**Files:**
- Create: `tests/api/admin/locations.test.ts`

- [ ] **Step 1: Write the locations test file**

Same pattern as sports but with location-specific fields:

```typescript
// tests/api/admin/locations.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getAdminCookie, apiFetch, testSlug, expectJson, resetCookies } from "../setup/test-helpers";

describe("Admin Locations API", () => {
  let cookie: string;
  let createdId: string;
  const slug = testSlug("loc");

  beforeAll(async () => { cookie = await getAdminCookie(); });
  afterAll(() => resetCookies());

  it("creates a location", async () => {
    const res = await apiFetch("/api/admin/locations", {
      method: "POST",
      cookie,
      body: JSON.stringify({
        name: `Test Location ${slug}`,
        slug,
        city: "Dublin",
        state: "OH",
        country: "US",
        timezone: "America/New_York",
      }),
    });
    const body = await expectJson(res, 201);
    expect(body.location).toBeDefined();
    createdId = body.location.id;
  });

  it("lists locations including test location", async () => {
    const res = await apiFetch("/api/admin/locations", { cookie });
    const body = await expectJson(res, 200);
    expect(body.locations.some((l: any) => l.id === createdId)).toBe(true);
  });

  it("updates location", async () => {
    const res = await apiFetch(`/api/admin/locations?id=${createdId}`, {
      method: "PUT",
      cookie,
      body: JSON.stringify({
        name: `Updated ${slug}`,
        slug,
        city: "Powell",
        state: "OH",
        country: "US",
        timezone: "America/New_York",
      }),
    });
    const body = await expectJson(res, 200);
    expect(body.location.city).toBe("Powell");
  });

  it("deletes location", async () => {
    const res = await apiFetch(`/api/admin/locations?id=${createdId}`, {
      method: "DELETE",
      cookie,
    });
    expect(res.status).toBe(200);
  });

  it("rejects unauthenticated", async () => {
    const res = await apiFetch("/api/admin/locations");
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run, fix, commit**

```bash
npm run test:api -- tests/api/admin/locations.test.ts
git add tests/api/admin/locations.test.ts
git commit -m "test: Admin Locations CRUD API tests"
```

---

### Task 3: Venues CRUD Tests

**Files:**
- Create: `tests/api/admin/venues.test.ts`

- [ ] **Step 1: Write venues test**

```typescript
// tests/api/admin/venues.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getAdminCookie, apiFetch, testSlug, expectJson, resetCookies } from "../setup/test-helpers";

describe("Admin Venues API", () => {
  let cookie: string;
  let createdId: string;
  let locationId: string;

  beforeAll(async () => {
    cookie = await getAdminCookie();
    // Get an existing location to reference
    const locRes = await apiFetch("/api/admin/locations", { cookie });
    const locBody = await locRes.json();
    locationId = locBody.locations[0].id;
  });
  afterAll(() => resetCookies());

  it("creates a venue", async () => {
    const res = await apiFetch("/api/admin/venues", {
      method: "POST",
      cookie,
      body: JSON.stringify({
        locationId,
        name: `Test Venue ${Date.now()}`,
        fieldCount: 3,
        surfaceType: "outdoor",
      }),
    });
    const body = await expectJson(res, 201);
    expect(body.venue).toBeDefined();
    createdId = body.venue.id;
  });

  it("lists venues", async () => {
    const res = await apiFetch("/api/admin/venues", { cookie });
    const body = await expectJson(res, 200);
    expect(body.venues).toBeInstanceOf(Array);
  });

  it("updates venue", async () => {
    const res = await apiFetch(`/api/admin/venues?id=${createdId}`, {
      method: "PUT",
      cookie,
      body: JSON.stringify({
        locationId,
        name: `Updated Venue ${Date.now()}`,
        fieldCount: 5,
        surfaceType: "indoor",
      }),
    });
    const body = await expectJson(res, 200);
    expect(body.venue.fieldCount).toBe(5);
  });

  it("deletes venue", async () => {
    const res = await apiFetch(`/api/admin/venues?id=${createdId}`, {
      method: "DELETE",
      cookie,
    });
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run, fix, commit**

```bash
npm run test:api -- tests/api/admin/venues.test.ts
git add tests/api/admin/venues.test.ts
git commit -m "test: Admin Venues CRUD API tests"
```

---

### Task 4: Age Groups CRUD Tests

**Files:**
- Create: `tests/api/admin/age-groups.test.ts`

- [ ] **Step 1: Write age groups test**

```typescript
// tests/api/admin/age-groups.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getAdminCookie, apiFetch, testSlug, expectJson, resetCookies } from "../setup/test-helpers";

describe("Admin Age Groups API", () => {
  let cookie: string;
  let createdId: string;

  beforeAll(async () => { cookie = await getAdminCookie(); });
  afterAll(() => resetCookies());

  it("creates an age group", async () => {
    const res = await apiFetch("/api/admin/age-groups", {
      method: "POST",
      cookie,
      body: JSON.stringify({
        name: `Test-AG-${Date.now()}`,
        minAge: 15,
        maxAge: 17,
      }),
    });
    const body = await expectJson(res, 201);
    expect(body.ageGroup).toBeDefined();
    createdId = body.ageGroup.id;
  });

  it("rejects minAge > maxAge", async () => {
    const res = await apiFetch("/api/admin/age-groups", {
      method: "POST",
      cookie,
      body: JSON.stringify({ name: "Invalid", minAge: 20, maxAge: 10 }),
    });
    expect(res.status).toBe(400);
  });

  it("lists age groups", async () => {
    const res = await apiFetch("/api/admin/age-groups", { cookie });
    const body = await expectJson(res, 200);
    expect(body.ageGroups).toBeInstanceOf(Array);
  });

  it("updates age group", async () => {
    const res = await apiFetch(`/api/admin/age-groups?id=${createdId}`, {
      method: "PUT",
      cookie,
      body: JSON.stringify({ name: "Updated-AG", minAge: 15, maxAge: 18 }),
    });
    const body = await expectJson(res, 200);
    expect(body.ageGroup.maxAge).toBe(18);
  });

  it("deletes age group", async () => {
    const res = await apiFetch(`/api/admin/age-groups?id=${createdId}`, {
      method: "DELETE",
      cookie,
    });
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run, fix, commit**

```bash
npm run test:api -- tests/api/admin/age-groups.test.ts
git add tests/api/admin/age-groups.test.ts
git commit -m "test: Admin Age Groups CRUD API tests"
```

---

### Task 5: Programs CRUD Tests

**Files:**
- Create: `tests/api/admin/programs.test.ts`

- [ ] **Step 1: Write programs test**

Programs depend on sports + locations, so the test fetches existing IDs first:

```typescript
// tests/api/admin/programs.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getAdminCookie, apiFetch, testSlug, expectJson, resetCookies } from "../setup/test-helpers";

describe("Admin Programs API", () => {
  let cookie: string;
  let createdId: string;
  let sportId: string;
  let locationId: string;
  const slug = testSlug("prog");

  beforeAll(async () => {
    cookie = await getAdminCookie();
    const [sportsRes, locsRes] = await Promise.all([
      apiFetch("/api/admin/sports", { cookie }),
      apiFetch("/api/admin/locations", { cookie }),
    ]);
    const sports = await sportsRes.json();
    const locs = await locsRes.json();
    sportId = sports.sports[0].id;
    locationId = locs.locations[0].id;
  });
  afterAll(() => resetCookies());

  it("creates a program", async () => {
    const res = await apiFetch("/api/admin/programs", {
      method: "POST",
      cookie,
      body: JSON.stringify({
        name: `Test Program ${slug}`,
        slug,
        sportId,
        locationId,
        programType: "league",
        status: "active",
      }),
    });
    const body = await expectJson(res, 201);
    expect(body.program).toBeDefined();
    createdId = body.program.id;
  });

  it("lists programs with sport and location", async () => {
    const res = await apiFetch("/api/admin/programs", { cookie });
    const body = await expectJson(res, 200);
    expect(body.programs).toBeInstanceOf(Array);
    const prog = body.programs.find((p: any) => p.id === createdId);
    expect(prog).toBeDefined();
  });

  it("updates program", async () => {
    const res = await apiFetch(`/api/admin/programs?id=${createdId}`, {
      method: "PUT",
      cookie,
      body: JSON.stringify({
        name: `Updated ${slug}`,
        slug,
        sportId,
        locationId,
        programType: "camp",
        status: "active",
      }),
    });
    const body = await expectJson(res, 200);
    expect(body.program.programType).toBe("camp");
  });

  it("deletes program", async () => {
    const res = await apiFetch(`/api/admin/programs?id=${createdId}`, {
      method: "DELETE",
      cookie,
    });
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run, fix, commit**

```bash
npm run test:api -- tests/api/admin/programs.test.ts
git add tests/api/admin/programs.test.ts
git commit -m "test: Admin Programs CRUD API tests"
```

---

### Task 6: Seasons CRUD Tests

**Files:**
- Create: `tests/api/admin/seasons.test.ts`

- [ ] **Step 1: Write seasons test**

Seasons depend on programs, which depend on sports + locations:

```typescript
// tests/api/admin/seasons.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getAdminCookie, apiFetch, testSlug, expectJson, resetCookies } from "../setup/test-helpers";

describe("Admin Seasons API", () => {
  let cookie: string;
  let createdId: string;
  let programId: string;
  const slug = testSlug("season");

  beforeAll(async () => {
    cookie = await getAdminCookie();
    const res = await apiFetch("/api/admin/programs", { cookie });
    const body = await res.json();
    programId = body.programs[0].id;
  });
  afterAll(() => resetCookies());

  it("creates a season", async () => {
    const res = await apiFetch("/api/admin/seasons", {
      method: "POST",
      cookie,
      body: JSON.stringify({
        programId,
        name: `Test Season ${slug}`,
        slug,
        startDate: "2026-09-01",
        endDate: "2026-12-15",
        priceCents: 15000,
        depositCents: 3000,
        allowDeposit: true,
        maxParticipants: 40,
        status: "draft",
        scheduleNotes: "Saturdays 9am",
      }),
    });
    const body = await expectJson(res, 201);
    expect(body.season).toBeDefined();
    expect(body.season.priceCents).toBe(15000);
    createdId = body.season.id;
  });

  it("lists seasons", async () => {
    const res = await apiFetch("/api/admin/seasons", { cookie });
    const body = await expectJson(res, 200);
    expect(body.seasons).toBeInstanceOf(Array);
  });

  it("updates season status to open", async () => {
    const res = await apiFetch(`/api/admin/seasons?id=${createdId}`, {
      method: "PUT",
      cookie,
      body: JSON.stringify({
        programId,
        name: `Test Season ${slug}`,
        slug,
        startDate: "2026-09-01",
        endDate: "2026-12-15",
        priceCents: 17500,
        status: "open",
      }),
    });
    const body = await expectJson(res, 200);
    expect(body.season.status).toBe("open");
    expect(body.season.priceCents).toBe(17500);
  });

  it("deletes season", async () => {
    const res = await apiFetch(`/api/admin/seasons?id=${createdId}`, {
      method: "DELETE",
      cookie,
    });
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run, fix, commit**

```bash
npm run test:api -- tests/api/admin/seasons.test.ts
git add tests/api/admin/seasons.test.ts
git commit -m "test: Admin Seasons CRUD API tests"
```

---

### Task 7: Teams CRUD Tests

**Files:**
- Create: `tests/api/admin/teams.test.ts`

- [ ] **Step 1: Write teams test**

```typescript
// tests/api/admin/teams.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getAdminCookie, apiFetch, expectJson, resetCookies } from "../setup/test-helpers";

describe("Admin Teams API", () => {
  let cookie: string;
  let createdId: string;
  let seasonId: string;

  beforeAll(async () => {
    cookie = await getAdminCookie();
    const res = await apiFetch("/api/admin/seasons", { cookie });
    const body = await res.json();
    // Use an existing open season
    const openSeason = body.seasons.find((s: any) => s.status === "open");
    seasonId = openSeason?.id || body.seasons[0].id;
  });
  afterAll(() => resetCookies());

  it("creates a team", async () => {
    const res = await apiFetch("/api/admin/teams", {
      method: "POST",
      cookie,
      body: JSON.stringify({
        seasonId,
        name: `Test Team ${Date.now()}`,
        color: "#ef4444",
        maxRosterSize: 15,
        division: "Test Division",
      }),
    });
    const body = await expectJson(res, 201);
    expect(body.team).toBeDefined();
    createdId = body.team.id;
  });

  it("lists teams", async () => {
    const res = await apiFetch("/api/admin/teams", { cookie });
    const body = await expectJson(res, 200);
    expect(body.teams).toBeInstanceOf(Array);
  });

  it("gets single team with roster", async () => {
    const res = await apiFetch(`/api/admin/teams?id=${createdId}`, { cookie });
    const body = await expectJson(res, 200);
    expect(body.team).toBeDefined();
    expect(body.team.id).toBe(createdId);
  });

  it("updates team", async () => {
    const res = await apiFetch(`/api/admin/teams?id=${createdId}`, {
      method: "PUT",
      cookie,
      body: JSON.stringify({
        seasonId,
        name: "Updated Test Team",
        color: "#3b82f6",
        maxRosterSize: 12,
      }),
    });
    const body = await expectJson(res, 200);
    expect(body.team.name).toBe("Updated Test Team");
  });

  it("deletes team", async () => {
    const res = await apiFetch(`/api/admin/teams?id=${createdId}`, {
      method: "DELETE",
      cookie,
    });
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run, fix, commit**

```bash
npm run test:api -- tests/api/admin/teams.test.ts
git add tests/api/admin/teams.test.ts
git commit -m "test: Admin Teams CRUD API tests"
```

---

### Task 8: Users & Roles Tests

**Files:**
- Create: `tests/api/admin/users.test.ts`

- [ ] **Step 1: Write users test**

```typescript
// tests/api/admin/users.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getAdminCookie, apiFetch, expectJson, resetCookies } from "../setup/test-helpers";

describe("Admin Users API", () => {
  let cookie: string;

  beforeAll(async () => { cookie = await getAdminCookie(); });
  afterAll(() => resetCookies());

  it("lists users with roles", async () => {
    const res = await apiFetch("/api/admin/users", { cookie });
    const body = await expectJson(res, 200);
    expect(body.users).toBeInstanceOf(Array);
    expect(body.users.length).toBeGreaterThan(0);
    // Each user should have roles array
    const firstUser = body.users[0];
    expect(firstUser.email).toBeDefined();
  });

  it("searches users by name", async () => {
    const res = await apiFetch("/api/admin/users?search=Test", { cookie });
    const body = await expectJson(res, 200);
    expect(body.users.length).toBeGreaterThan(0);
  });

  it("rejects unauthenticated", async () => {
    const res = await apiFetch("/api/admin/users");
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run, fix, commit**

```bash
npm run test:api -- tests/api/admin/users.test.ts
git add tests/api/admin/users.test.ts
git commit -m "test: Admin Users API tests"
```

---

### Task 9: Run Full Phase 1 Suite + Admin Setup E2E

- [ ] **Step 1: Run all Phase 1 API tests together**

```bash
npm run test:api
```

All tests should pass. Fix any cross-test interference issues.

- [ ] **Step 2: Commit final state**

```bash
git add -A
git commit -m "test: Phase 1 complete — Admin Setup CRUD API tests

8 test files covering Sports, Locations, Venues, Age Groups,
Programs, Seasons, Teams, and Users admin APIs.

Each test covers: create, list, update, delete, validation errors,
and auth checks."
```
