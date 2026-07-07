import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Unit-level test of the publish-gate branching in
 * src/pages/api/admin/media/shoots/[id].ts (Task 5 — surfacing the
 * individual opt-out distinctly from missing-consent at the endpoint
 * level). Everything the PATCH handler touches is mocked so we can flip
 * `isMediaAuthHardBlockEnabled()` per test without needing two live dev
 * server processes (MEDIA_AUTH_HARD_BLOCK is a static env read, fixed for
 * a server's whole lifetime — this is the only way to exercise both
 * branches in one run). The real DB-backed soft-warn path is additionally
 * covered end-to-end in tests/api/admin/media-shoots-publish-gate.test.ts.
 */

const authorizedUser = { id: "actor-1" };

vi.mock("@/lib/auth", () => ({
  requireSuperAdminAccess: vi.fn(async () => ({ authorized: true, user: authorizedUser })),
  requireOrganizationContext: vi.fn(async () => ({ hasOrganization: true, organizationId: "org-1" })),
}));

let ownershipRow: { id: string; status: string; intendedScope: string } = {
  id: "session-1",
  status: "ready",
  intendedScope: "internal",
};

vi.mock("@/lib/auth/require-resource-ownership", () => ({
  requireSameOrgShootSession: vi.fn(async () => ({ ok: true, row: ownershipRow })),
  ownershipDeniedResponse: () =>
    new Response(JSON.stringify({ error: "Resource not found" }), { status: 404 }),
}));

const logMediaAction = vi.fn(async (..._args: unknown[]) => {});
vi.mock("@/lib/media/audit", () => ({
  logMediaAction: (...args: unknown[]) => logMediaAction(...args),
}));

vi.mock("@/lib/media/notifications", () => ({
  notifyAssignment: vi.fn(async () => {}),
}));

let checkResult: {
  canPublish: boolean;
  intendedScope: string;
  totalTagged: number;
  missing: Array<{ familyMemberId: string; firstName: string; lastName: string }>;
  doNotPublish: Array<{ familyMemberId: string; firstName: string; lastName: string; reason: string | null }>;
};
let hardBlockEnabled = false;

vi.mock("@/lib/consents/publish-check", () => ({
  checkSessionPublishConsent: vi.fn(async () => checkResult),
  isMediaAuthHardBlockEnabled: () => hardBlockEnabled,
}));

vi.mock("@/lib/db", () => ({
  getDb: () => ({
    update: () => ({
      set: () => ({
        where: () => ({
          returning: async () => [{ ...ownershipRow, status: "published" }],
        }),
      }),
    }),
  }),
}));

import { PATCH } from "@/pages/api/admin/media/shoots/[id]";

function makeContext(body: unknown) {
  return {
    params: { id: "session-1" },
    request: {
      json: async () => body,
    },
  } as any;
}

describe("PATCH /api/admin/media/shoots/:id — publish gate surfacing", () => {
  beforeEach(() => {
    logMediaAction.mockClear();
    hardBlockEnabled = false;
    ownershipRow = { id: "session-1", status: "ready", intendedScope: "internal" };
    checkResult = {
      canPublish: false,
      intendedScope: "internal",
      totalTagged: 2,
      missing: [{ familyMemberId: "fm-missing", firstName: "Miss", lastName: "Ing" }],
      doNotPublish: [
        { familyMemberId: "fm-optout", firstName: "Opt", lastName: "Out", reason: "Takedown requested" },
      ],
    };
  });

  it("hard-block: 422 surfaces missing and doNotPublish as distinct arrays", async () => {
    hardBlockEnabled = true;
    const res = await PATCH(makeContext({ status: "published" }));
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.missing).toEqual(checkResult.missing);
    expect(json.doNotPublish).toEqual(checkResult.doNotPublish);
    // No audit log write on the hard-block short-circuit.
    expect(logMediaAction).not.toHaveBeenCalled();
  });

  it("hard-block: 422 fires even when only doNotPublish is populated (missing empty)", async () => {
    hardBlockEnabled = true;
    checkResult = { ...checkResult, missing: [] };
    const res = await PATCH(makeContext({ status: "published" }));
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.missing).toEqual([]);
    expect(json.doNotPublish).toEqual(checkResult.doNotPublish);
  });

  it("soft-warn (hard-block disabled): publish proceeds (200) and audit log captures both arrays", async () => {
    hardBlockEnabled = false;
    const res = await PATCH(makeContext({ status: "published" }));
    expect(res.status).toBe(200);
    expect(logMediaAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "publish",
        diff: expect.objectContaining({
          softWarn: "missing_media_auth_consent_or_do_not_publish",
          missing: checkResult.missing,
          doNotPublish: checkResult.doNotPublish,
          doNotPublishCount: 1,
        }),
      }),
    );
  });

  it("canPublish=true: no warn, no block, plain update log only", async () => {
    checkResult = {
      canPublish: true,
      intendedScope: "internal",
      totalTagged: 0,
      missing: [],
      doNotPublish: [],
    };
    const res = await PATCH(makeContext({ status: "published" }));
    expect(res.status).toBe(200);
    const publishDiffCalls = logMediaAction.mock.calls.filter(
      (c: any) => c[0]?.diff?.softWarn,
    );
    expect(publishDiffCalls.length).toBe(0);
  });
});
