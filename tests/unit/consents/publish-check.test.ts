import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * checkSessionPublishConsent() composes two independent lookups:
 *   1. tagged + latest-consent rows, read straight off `db` (faked below —
 *      the query chains end at `.where()`, no `.orderBy()`, matching the
 *      real shape in src/lib/consents/publish-check.ts).
 *   2. getFaceTaggedDoNotPublishForSession() from the sibling
 *      do-not-publish module — mocked directly so each test can control
 *      the opt-out list independently of the fake `db`.
 */
let taggedRows: Array<{ familyMemberId: string; firstName: string; lastName: string }> = [];
let latestConsentRows: Array<{
  family_member_id: string;
  status: "granted" | "revoked";
  expires_at: Date | null;
}> = [];

function makeFakeDb() {
  const chain: any = {
    from: () => chain,
    innerJoin: () => chain,
    where: async () => taggedRows,
  };
  return {
    selectDistinct: () => chain,
    execute: async () => latestConsentRows,
  };
}

const getFaceTaggedDoNotPublishForSession = vi.fn();
vi.mock("@/lib/consents/do-not-publish", () => ({
  getFaceTaggedDoNotPublishForSession: (...args: unknown[]) =>
    getFaceTaggedDoNotPublishForSession(...args),
}));

import { checkSessionPublishConsent } from "@/lib/consents/publish-check";

const SESSION_ID = "session-1";
const ORG_ID = "org-1";

describe("checkSessionPublishConsent", () => {
  beforeEach(() => {
    taggedRows = [];
    latestConsentRows = [];
    getFaceTaggedDoNotPublishForSession.mockReset();
    getFaceTaggedDoNotPublishForSession.mockResolvedValue([]);
  });

  it("team-tag only (no face tags) publishes regardless of any roster member's opt-out — proves no roster blocking", async () => {
    taggedRows = []; // team/wide session: no familyMemberId tags at all
    // Even if the do-not-publish lookup were configured to return matches,
    // the early-return path for zero face tags must never consult it.
    getFaceTaggedDoNotPublishForSession.mockResolvedValue([
      { familyMemberId: "fm-on-roster", firstName: "Roster", lastName: "Kid", reason: null },
    ]);

    const result = await checkSessionPublishConsent(
      makeFakeDb() as any,
      SESSION_ID,
      "public",
      ORG_ID,
    );

    expect(result).toEqual({
      canPublish: true,
      intendedScope: "public",
      totalTagged: 0,
      missing: [],
      doNotPublish: [],
    });
    expect(getFaceTaggedDoNotPublishForSession).not.toHaveBeenCalled();
  });

  it("face-tagged + granted consent + NOT opted-out → publishes", async () => {
    taggedRows = [{ familyMemberId: "fm-1", firstName: "Alex", lastName: "Adams" }];
    latestConsentRows = [
      { family_member_id: "fm-1", status: "granted", expires_at: null },
    ];
    getFaceTaggedDoNotPublishForSession.mockResolvedValue([]);

    const result = await checkSessionPublishConsent(
      makeFakeDb() as any,
      SESSION_ID,
      "public",
      ORG_ID,
    );

    expect(result.canPublish).toBe(true);
    expect(result.missing).toEqual([]);
    expect(result.doNotPublish).toEqual([]);
    expect(getFaceTaggedDoNotPublishForSession).toHaveBeenCalledWith(
      expect.anything(),
      SESSION_ID,
      ORG_ID,
    );
  });

  it("face-tagged + opted-out (no consent) → blocked, surfaced in doNotPublish", async () => {
    taggedRows = [{ familyMemberId: "fm-2", firstName: "Bo", lastName: "Baker" }];
    latestConsentRows = []; // no consent at all — also in `missing`
    getFaceTaggedDoNotPublishForSession.mockResolvedValue([
      { familyMemberId: "fm-2", firstName: "Bo", lastName: "Baker", reason: "Takedown requested" },
    ]);

    const result = await checkSessionPublishConsent(
      makeFakeDb() as any,
      SESSION_ID,
      "public",
      ORG_ID,
    );

    expect(result.canPublish).toBe(false);
    expect(result.missing).toEqual([
      { familyMemberId: "fm-2", firstName: "Bo", lastName: "Baker" },
    ]);
    expect(result.doNotPublish).toEqual([
      { familyMemberId: "fm-2", firstName: "Bo", lastName: "Baker", reason: "Takedown requested" },
    ]);
  });

  it("face-tag consent present but individual opted-out → still blocked (opt-out wins over a stale consent)", async () => {
    taggedRows = [{ familyMemberId: "fm-3", firstName: "Cam", lastName: "Cole" }];
    latestConsentRows = [
      { family_member_id: "fm-3", status: "granted", expires_at: null },
    ];
    getFaceTaggedDoNotPublishForSession.mockResolvedValue([
      { familyMemberId: "fm-3", firstName: "Cam", lastName: "Cole", reason: "Parent revoked, opted out" },
    ]);

    const result = await checkSessionPublishConsent(
      makeFakeDb() as any,
      SESSION_ID,
      "public",
      ORG_ID,
    );

    // Not in `missing` — they DO have a granted consent row.
    expect(result.missing).toEqual([]);
    // But opt-out wins: still blocked.
    expect(result.doNotPublish).toEqual([
      { familyMemberId: "fm-3", firstName: "Cam", lastName: "Cole", reason: "Parent revoked, opted out" },
    ]);
    expect(result.canPublish).toBe(false);
  });
});
