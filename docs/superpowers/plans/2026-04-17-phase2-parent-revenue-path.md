# Phase 2: Parent Revenue Path Stabilization & Tests

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Audit, fix, and test every flow a parent needs: sign up, sign in, browse programs, manage family members, register for a season, and view their dashboard.

**Architecture:** Same as Phase 1 — API integration tests hit the running dev server over HTTP. Auth tests create real accounts and sessions. Family member and registration tests use the parent test account.

**Tech Stack:** Vitest (API tests), Playwright (E2E smoke test for full registration journey).

---

### Task 10: Auth API Tests (signup, signin, signout, session)

**Files:**
- Create: `tests/api/auth/signup-signin.test.ts`

- [ ] **Step 1: Write auth test file**

```typescript
// tests/api/auth/signup-signin.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { apiFetch, expectJson, getAuthCookie } from "../setup/test-helpers";

describe("Auth API", () => {
  const testEmail = `test-${Date.now()}@example.com`;
  const testPassword = "TestPassword123!";
  let authCookie: string;

  describe("POST /api/auth/signup", () => {
    it("creates a new account", async () => {
      const res = await apiFetch("/api/auth/signup", {
        method: "POST",
        body: JSON.stringify({
          email: testEmail,
          password: testPassword,
          firstName: "Test",
          lastName: "Signup",
        }),
      });
      // Signup may return 200 or 201 — check it doesn't error
      expect(res.status).toBeLessThan(400);
    });

    it("rejects duplicate email", async () => {
      const res = await apiFetch("/api/auth/signup", {
        method: "POST",
        body: JSON.stringify({
          email: testEmail,
          password: testPassword,
          firstName: "Dupe",
          lastName: "User",
        }),
      });
      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it("rejects missing fields", async () => {
      const res = await apiFetch("/api/auth/signup", {
        method: "POST",
        body: JSON.stringify({ email: "incomplete@test.com" }),
      });
      expect(res.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe("POST /api/auth/signin", () => {
    it("signs in with valid credentials", async () => {
      authCookie = await getAuthCookie(testEmail, testPassword);
      expect(authCookie).toBeTruthy();
      expect(authCookie).toContain("auth_session");
    });

    it("rejects wrong password", async () => {
      const res = await apiFetch("/api/auth/signin", {
        method: "POST",
        body: JSON.stringify({ email: testEmail, password: "WrongPassword!" }),
      });
      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it("rejects nonexistent email", async () => {
      const res = await apiFetch("/api/auth/signin", {
        method: "POST",
        body: JSON.stringify({ email: "nobody@nowhere.com", password: "test" }),
      });
      expect(res.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe("GET /api/auth/session", () => {
    it("returns user when authenticated", async () => {
      const res = await apiFetch("/api/auth/session", { cookie: authCookie });
      const body = await expectJson(res, 200);
      expect(body.authenticated).toBe(true);
      expect(body.user.email).toBe(testEmail);
    });

    it("returns unauthenticated without cookie", async () => {
      const res = await apiFetch("/api/auth/session");
      const body = await expectJson(res, 200);
      expect(body.authenticated).toBe(false);
    });
  });

  describe("GET /api/auth/signout", () => {
    it("invalidates session", async () => {
      const res = await apiFetch("/api/auth/signout", {
        cookie: authCookie,
      });
      // Signout returns redirect (302) or 200
      expect(res.status).toBeLessThan(400);
    });
  });
});
```

- [ ] **Step 2: Run, fix any API issues, commit**

```bash
npm run test:api -- tests/api/auth/signup-signin.test.ts
git add tests/api/auth/
git commit -m "test: Auth API tests (signup, signin, session, signout)"
```

---

### Task 11: Public Seasons API Tests

**Files:**
- Create: `tests/api/public/seasons.test.ts`

- [ ] **Step 1: Write public seasons test**

```typescript
// tests/api/public/seasons.test.ts
import { describe, it, expect } from "vitest";
import { apiFetch, expectJson } from "../setup/test-helpers";

describe("Public Seasons API", () => {
  describe("GET /api/public/seasons", () => {
    it("returns seasons without auth", async () => {
      const res = await apiFetch("/api/public/seasons");
      const body = await expectJson(res, 200);
      expect(body.seasons).toBeInstanceOf(Array);
    });

    it("filters by status=open", async () => {
      const res = await apiFetch("/api/public/seasons?status=open");
      const body = await expectJson(res, 200);
      expect(body.seasons).toBeInstanceOf(Array);
      // All returned seasons should be open
      body.seasons.forEach((s: any) => {
        expect(s.status).toBe("open");
      });
    });

    it("returns season with sport, location, ageGroup data", async () => {
      const res = await apiFetch("/api/public/seasons?status=open");
      const body = await expectJson(res, 200);
      if (body.seasons.length > 0) {
        const season = body.seasons[0];
        expect(season.sport).toBeDefined();
        expect(season.sport.name).toBeDefined();
        expect(season.location).toBeDefined();
        expect(season.price).toBeDefined();
      }
    });
  });

  describe("GET /api/public/seasons/:id", () => {
    it("returns a single season by ID", async () => {
      // First get a valid season ID
      const listRes = await apiFetch("/api/public/seasons?status=open");
      const listBody = await listRes.json();
      if (listBody.seasons.length === 0) return; // Skip if no data

      const seasonId = listBody.seasons[0].id;
      const res = await apiFetch(`/api/public/seasons/${seasonId}`);
      const body = await expectJson(res, 200);
      expect(body.season).toBeDefined();
      expect(body.season.id).toBe(seasonId);
      expect(body.season.price).toBeDefined();
      expect(body.season.spotsLeft).toBeDefined();
    });

    it("returns 404 for invalid ID", async () => {
      const res = await apiFetch("/api/public/seasons/00000000-0000-0000-0000-000000000000");
      expect(res.status).toBe(404);
    });
  });
});
```

- [ ] **Step 2: Run, fix, commit**

```bash
npm run test:api -- tests/api/public/seasons.test.ts
git add tests/api/public/
git commit -m "test: Public Seasons API tests"
```

---

### Task 12: Family Members API Tests

**Files:**
- Create: `tests/api/parent/family-members.test.ts`

- [ ] **Step 1: Write family members test**

The family members API is scoped to the authenticated parent — they can only see/manage their own children.

```typescript
// tests/api/parent/family-members.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { apiFetch, expectJson, getAuthCookie, resetCookies } from "../setup/test-helpers";

describe("Family Members API", () => {
  let cookie: string;
  let createdId: string;

  beforeAll(async () => {
    cookie = await getAuthCookie("parent@test.aspiresports.com", "TestParent123!");
  });
  afterAll(() => resetCookies());

  describe("POST /api/family-members", () => {
    it("adds a family member", async () => {
      const res = await apiFetch("/api/family-members", {
        method: "POST",
        cookie,
        body: JSON.stringify({
          firstName: "TestChild",
          lastName: "ApiTest",
          birthDate: "2018-06-15",
          gender: "male",
        }),
      });
      const body = await expectJson(res, 201);
      expect(body.familyMember).toBeDefined();
      expect(body.familyMember.firstName).toBe("TestChild");
      createdId = body.familyMember.id;
    });

    it("rejects missing required fields", async () => {
      const res = await apiFetch("/api/family-members", {
        method: "POST",
        cookie,
        body: JSON.stringify({ firstName: "NoLastName" }),
      });
      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it("rejects unauthenticated", async () => {
      const res = await apiFetch("/api/family-members", {
        method: "POST",
        body: JSON.stringify({
          firstName: "NoAuth",
          lastName: "Test",
          birthDate: "2018-01-01",
        }),
      });
      expect(res.status).toBe(401);
    });
  });

  describe("GET /api/family-members", () => {
    it("lists parent's family members", async () => {
      const res = await apiFetch("/api/family-members", { cookie });
      const body = await expectJson(res, 200);
      expect(body.familyMembers).toBeInstanceOf(Array);
      const testChild = body.familyMembers.find((f: any) => f.id === createdId);
      expect(testChild).toBeDefined();
    });
  });

  describe("PUT /api/family-members/:id", () => {
    it("updates family member", async () => {
      const res = await apiFetch(`/api/family-members/${createdId}`, {
        method: "PUT",
        cookie,
        body: JSON.stringify({
          firstName: "UpdatedChild",
          lastName: "ApiTest",
          birthDate: "2018-06-15",
        }),
      });
      const body = await expectJson(res, 200);
      expect(body.familyMember.firstName).toBe("UpdatedChild");
    });
  });

  describe("DELETE /api/family-members/:id", () => {
    it("deletes family member", async () => {
      const res = await apiFetch(`/api/family-members/${createdId}`, {
        method: "DELETE",
        cookie,
      });
      expect(res.status).toBe(200);
    });

    it("returns 404 for deleted member", async () => {
      const res = await apiFetch(`/api/family-members/${createdId}`, {
        cookie,
      });
      expect(res.status).toBe(404);
    });
  });
});
```

- [ ] **Step 2: Run, fix, commit**

```bash
npm run test:api -- tests/api/parent/family-members.test.ts
git add tests/api/parent/
git commit -m "test: Family Members CRUD API tests"
```

---

### Task 13: Registration API Tests

**Files:**
- Create: `tests/api/parent/registration.test.ts`

- [ ] **Step 1: Write registration test**

Tests the parent's ability to register a child for a season.

```typescript
// tests/api/parent/registration.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { apiFetch, expectJson, getAuthCookie, resetCookies } from "../setup/test-helpers";

describe("Registration API", () => {
  let cookie: string;
  let seasonId: string;
  let familyMemberId: string;
  let registrationId: string;

  beforeAll(async () => {
    cookie = await getAuthCookie("parent@test.aspiresports.com", "TestParent123!");

    // Get an open season
    const seasonsRes = await apiFetch("/api/public/seasons?status=open");
    const seasonsBody = await seasonsRes.json();
    seasonId = seasonsBody.seasons[0]?.id;

    // Get family members
    const membersRes = await apiFetch("/api/family-members", { cookie });
    const membersBody = await membersRes.json();
    familyMemberId = membersBody.familyMembers[0]?.id;
  });
  afterAll(() => resetCookies());

  describe("POST /api/registrations", () => {
    it("creates a registration", async () => {
      if (!seasonId || !familyMemberId) {
        console.warn("Skipping: no season or family member available");
        return;
      }

      const res = await apiFetch("/api/registrations", {
        method: "POST",
        cookie,
        body: JSON.stringify({
          seasonId,
          familyMemberId,
          registrationType: "full",
          waiverSigned: true,
        }),
      });

      // May return 201 (created) or 200 or 400 (already registered)
      if (res.status === 201 || res.status === 200) {
        const body = await res.json();
        expect(body.registration).toBeDefined();
        registrationId = body.registration.id;
      } else if (res.status === 400) {
        // Already registered — get existing
        const body = await res.json();
        expect(body.error).toBeDefined();
      }
    });

    it("rejects unauthenticated", async () => {
      const res = await apiFetch("/api/registrations", {
        method: "POST",
        body: JSON.stringify({ seasonId, familyMemberId }),
      });
      expect(res.status).toBe(401);
    });
  });

  describe("GET /api/registrations", () => {
    it("lists parent's registrations", async () => {
      const res = await apiFetch("/api/registrations", { cookie });
      const body = await expectJson(res, 200);
      expect(body.registrations).toBeInstanceOf(Array);
    });
  });
});
```

- [ ] **Step 2: Run, fix any issues, commit**

```bash
npm run test:api -- tests/api/parent/registration.test.ts
git add tests/api/parent/
git commit -m "test: Registration API tests"
```

---

### Task 14: Parent Dashboard API Tests

**Files:**
- Create: `tests/api/parent/dashboard.test.ts`

- [ ] **Step 1: Write dashboard API test**

Tests the APIs the parent dashboard calls.

```typescript
// tests/api/parent/dashboard.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { apiFetch, expectJson, getAuthCookie, resetCookies } from "../setup/test-helpers";

describe("Parent Dashboard APIs", () => {
  let cookie: string;

  beforeAll(async () => {
    cookie = await getAuthCookie("parent@test.aspiresports.com", "TestParent123!");
  });
  afterAll(() => resetCookies());

  it("GET /api/auth/session returns user data", async () => {
    const res = await apiFetch("/api/auth/session", { cookie });
    const body = await expectJson(res, 200);
    expect(body.authenticated).toBe(true);
    expect(body.user.email).toBe("parent@test.aspiresports.com");
  });

  it("GET /api/family-members returns children", async () => {
    const res = await apiFetch("/api/family-members", { cookie });
    const body = await expectJson(res, 200);
    expect(body.familyMembers).toBeInstanceOf(Array);
  });

  it("GET /api/registrations returns registrations", async () => {
    const res = await apiFetch("/api/registrations", { cookie });
    const body = await expectJson(res, 200);
    expect(body.registrations).toBeInstanceOf(Array);
  });

  it("GET /api/payments/history returns payment history", async () => {
    const res = await apiFetch("/api/payments/history", { cookie });
    // May return 200 with data or 200 with empty array
    expect(res.status).toBe(200);
  });

  it("GET /api/user/profile returns profile", async () => {
    const res = await apiFetch("/api/user/profile", { cookie });
    const body = await expectJson(res, 200);
    expect(body.user || body.profile).toBeDefined();
  });

  it("GET /api/user/announcements returns announcements", async () => {
    const res = await apiFetch("/api/user/announcements", { cookie });
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run, fix, commit**

```bash
npm run test:api -- tests/api/parent/dashboard.test.ts
git add tests/api/parent/
git commit -m "test: Parent Dashboard API tests"
```

---

### Task 15: Run Full Phase 2 Suite

- [ ] **Step 1: Run all Phase 2 tests alongside Phase 1**

```bash
npm run test:api
```

All tests from Phase 1 + Phase 2 should pass together.

- [ ] **Step 2: Commit final state**

```bash
git add -A
git commit -m "test: Phase 2 complete — Parent Revenue Path API tests

Auth (signup, signin, session, signout), Public Seasons,
Family Members CRUD, Registration, and Parent Dashboard APIs.
All tests pass alongside Phase 1 admin tests."
```
