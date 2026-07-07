import { describe, it, expect, vi, beforeEach } from "vitest";
import type { APIContext } from "astro";

// requireStaffAccess touches two external dependencies: validateSession
// (session.ts) and getDb (for getUserRoles's role lookup). Mocking both
// keeps this a true unit test — no DB, no server — per the repo's
// tests/unit convention. Mirrors the mocking approach used in
// tests/unit/middleware/referee-route-rule.test.ts (mock by resolved
// path, which matches even though roles.ts imports "./session" relatively).
vi.mock("@/lib/auth/session", () => ({ validateSession: vi.fn() }));
vi.mock("@/lib/db", () => ({ getDb: vi.fn() }));

import { validateSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { requireStaffAccess } from "@/lib/auth/roles";

function makeRoleRowsChain(rows: Array<{ name: string; scopeType: string; scopeId: string | null }>) {
  return {
    select: () => ({
      from: () => ({
        innerJoin: () => ({
          where: () => Promise.resolve(rows),
        }),
      }),
    }),
  };
}

function makeContext(overrides: Partial<APIContext> = {}): APIContext {
  return {
    cookies: { get: () => undefined },
    locals: { organization: { id: "org-1" } },
    ...overrides,
  } as unknown as APIContext;
}

describe("requireStaffAccess", () => {
  beforeEach(() => {
    vi.mocked(validateSession).mockReset();
    vi.mocked(getDb).mockReset();
  });

  it("returns 401 when there is no session", async () => {
    vi.mocked(validateSession).mockResolvedValue({ user: null, session: null });

    const result = await requireStaffAccess(makeContext());

    expect(result.authorized).toBe(false);
    if (!result.authorized) {
      expect(result.response.status).toBe(401);
    }
  });

  it("returns 403 when the caller only holds the parent role", async () => {
    vi.mocked(validateSession).mockResolvedValue({
      user: { id: "user-1" } as any,
      session: {} as any,
    });
    vi.mocked(getDb).mockReturnValue(
      makeRoleRowsChain([{ name: "parent", scopeType: "organization", scopeId: "org-1" }]) as any,
    );

    const result = await requireStaffAccess(makeContext());

    expect(result.authorized).toBe(false);
    if (!result.authorized) {
      expect(result.response.status).toBe(403);
    }
  });

  it("authorizes a coach and resolves organizationId", async () => {
    vi.mocked(validateSession).mockResolvedValue({
      user: { id: "user-2" } as any,
      session: {} as any,
    });
    vi.mocked(getDb).mockReturnValue(
      makeRoleRowsChain([{ name: "coach", scopeType: "team", scopeId: "team-1" }]) as any,
    );

    const result = await requireStaffAccess(makeContext());

    expect(result.authorized).toBe(true);
    if (result.authorized) {
      expect(result.organizationId).toBe("org-1");
    }
  });
});
