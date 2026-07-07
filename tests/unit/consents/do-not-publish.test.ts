import { describe, it, expect, vi } from "vitest";
import {
  setDoNotPublish,
  clearDoNotPublish,
  isDoNotPublish,
  getDoNotPublishForOrg,
  getFaceTaggedDoNotPublishForSession,
} from "@/lib/consents/do-not-publish";

/**
 * These functions take `db` as a plain parameter (not via getDb()), so we
 * can hand them a minimal fake query-builder rather than vi.mock("@/lib/db").
 * Each chain method is recorded so assertions can check the right table/
 * predicate was targeted, and the configured terminal value is what the
 * async chain resolves to (mirrors drizzle's thenable query builders).
 */
function makeFakeDb(terminalValue: unknown) {
  const calls: Record<string, any[]> = {};
  const record = (name: string, args: unknown[]) => {
    calls[name] = calls[name] ?? [];
    calls[name].push(args);
  };

  const chain: any = {
    values: (...args: unknown[]) => (record("values", args), chain),
    onConflictDoUpdate: (...args: unknown[]) => (record("onConflictDoUpdate", args), chain),
    set: (...args: unknown[]) => (record("set", args), chain),
    where: (...args: unknown[]) => (record("where", args), chain),
    from: (...args: unknown[]) => (record("from", args), chain),
    innerJoin: (...args: unknown[]) => (record("innerJoin", args), chain),
    limit: (...args: unknown[]) => (record("limit", args), Promise.resolve(terminalValue)),
    orderBy: (...args: unknown[]) => (record("orderBy", args), Promise.resolve(terminalValue)),
    returning: (...args: unknown[]) => (record("returning", args), Promise.resolve(terminalValue)),
  };

  const db: any = {
    insert: (...args: unknown[]) => (record("insert", args), chain),
    update: (...args: unknown[]) => (record("update", args), chain),
    select: (...args: unknown[]) => (record("select", args), chain),
    selectDistinct: (...args: unknown[]) => (record("selectDistinct", args), chain),
  };

  return { db, calls };
}

describe("setDoNotPublish", () => {
  it("inserts an active row and upserts via onConflictDoUpdate on the (org, fm) partial index", async () => {
    const { db, calls } = makeFakeDb([{ id: "dnp-1" }]);
    const result = await setDoNotPublish({
      db,
      organizationId: "org-1",
      familyMemberId: "fm-1",
      reason: "Parent requested takedown",
      setByUserId: "user-1",
    });
    expect(result).toEqual({ id: "dnp-1" });
    expect(calls.insert).toBeDefined();
    expect(calls.onConflictDoUpdate).toBeDefined();
    expect(calls.values[0][0]).toMatchObject({
      organizationId: "org-1",
      familyMemberId: "fm-1",
      reason: "Parent requested takedown",
      active: true,
      setByUserId: "user-1",
    });
  });

  it("defaults reason to null when omitted", async () => {
    const { db, calls } = makeFakeDb([{ id: "dnp-2" }]);
    await setDoNotPublish({
      db,
      organizationId: "org-1",
      familyMemberId: "fm-2",
      setByUserId: "user-1",
    });
    expect(calls.values[0][0]).toMatchObject({ reason: null });
  });
});

describe("clearDoNotPublish", () => {
  it("deactivates and stamps removedByUserId/removedAt", async () => {
    const { db, calls } = makeFakeDb([{ id: "dnp-1" }]);
    const cleared = await clearDoNotPublish({
      db,
      organizationId: "org-1",
      familyMemberId: "fm-1",
      removedByUserId: "admin-1",
    });
    expect(cleared).toBe(true);
    expect(calls.set[0][0]).toMatchObject({
      active: false,
      removedByUserId: "admin-1",
    });
    expect(calls.set[0][0].removedAt).toBeInstanceOf(Date);
  });

  it("returns false when nothing was active to clear", async () => {
    const { db } = makeFakeDb([]);
    const cleared = await clearDoNotPublish({
      db,
      organizationId: "org-1",
      familyMemberId: "fm-none",
      removedByUserId: "admin-1",
    });
    expect(cleared).toBe(false);
  });
});

describe("isDoNotPublish", () => {
  it("true when an active row is found", async () => {
    const { db } = makeFakeDb([{ id: "dnp-1" }]);
    expect(await isDoNotPublish(db, "org-1", "fm-1")).toBe(true);
  });

  it("false when no active row is found", async () => {
    const { db } = makeFakeDb([]);
    expect(await isDoNotPublish(db, "org-1", "fm-1")).toBe(false);
  });
});

describe("getDoNotPublishForOrg", () => {
  it("returns the org's active opt-out list", async () => {
    const rows = [
      { familyMemberId: "fm-1", firstName: "Alex", lastName: "Adams", reason: "Custody dispute" },
      { familyMemberId: "fm-2", firstName: "Bo", lastName: "Baker", reason: null },
    ];
    const { db } = makeFakeDb(rows);
    expect(await getDoNotPublishForOrg(db, "org-1")).toEqual(rows);
  });

  it("returns [] when nothing is opted out", async () => {
    const { db } = makeFakeDb([]);
    expect(await getDoNotPublishForOrg(db, "org-1")).toEqual([]);
  });
});

describe("getFaceTaggedDoNotPublishForSession", () => {
  it("returns face-tagged individuals who are on the active opt-out list", async () => {
    const rows = [
      { familyMemberId: "fm-1", firstName: "Alex", lastName: "Adams", reason: "Takedown requested" },
    ];
    const { db } = makeFakeDb(rows);
    expect(await getFaceTaggedDoNotPublishForSession(db, "session-1", "org-1")).toEqual(rows);
  });

  it("returns [] when no face-tagged individual in the session is opted out", async () => {
    const { db } = makeFakeDb([]);
    expect(await getFaceTaggedDoNotPublishForSession(db, "session-1", "org-1")).toEqual([]);
  });
});
