/**
 * The two PARENT-FACING waiver probes must agree with the canonical predicate
 * and with each other.
 *
 * `GET /api/family-members?includeWaiver=1` (the class booking modals' probe)
 * and `GET /api/classes/summary` (the dashboard cards) both answer "is this
 * child covered by the org's annual liability waiver?", and both used to do it
 * with their own serial fan-out of `hasValidLiabilityWaiver`. They now share
 * one batched call. This suite pins the parity: for the same seeded matrix,
 * both endpoints must return exactly what `hasValidLiabilityWaiverBatch` says,
 * flag for flag.
 *
 * It also pins the shape the probes are supposed to have: `includeWaiver` is
 * OPT-IN, so a plain list must not carry the flag at all.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { consents } from "@/lib/db/schema/consents";
import { familyMembers } from "@/lib/db/schema/registrations";
import {
  WAIVER_VALID_DAYS,
  hasValidLiabilityWaiverBatch,
} from "@/lib/consents/liability";
import { getAuthCookie, apiFetch, resetCookies } from "./setup/test-helpers";
import { resolveClassTestFixtures, createTestChild } from "../utils/classes-helpers";

const DAY_MS = 24 * 60 * 60 * 1000;
const suffix = Math.random().toString(36).slice(2, 10);

let organizationId: string;
let parentUserId: string;
let parentCookie: string;

let coveredChildId: string;
let expiredChildId: string;
let bareChildId: string;
const childIds: string[] = [];

async function insertConsent(
  familyMemberId: string,
  signedDaysAgo: number,
): Promise<void> {
  const signedAt = new Date(Date.now() - signedDaysAgo * DAY_MS);
  await getDb()
    .insert(consents)
    .values({
      familyMemberId,
      organizationId,
      type: "liability",
      status: "granted",
      signedByUserId: parentUserId,
      signedByName: "Parent Test",
      signedAt,
      expiresAt: new Date(signedAt.getTime() + WAIVER_VALID_DAYS * DAY_MS),
    });
}

beforeAll(async () => {
  ({ organizationId, parentUserId } = await resolveClassTestFixtures());
  parentCookie = await getAuthCookie("parent@test.aspiresports.com", "TestParent123!");

  // Newest-first / newest-last caps on both endpoints keep the most recently
  // created children — so these three are always in both payloads.
  coveredChildId = await createTestChild(parentUserId, `ProbeCovered${suffix}`);
  expiredChildId = await createTestChild(parentUserId, `ProbeExpired${suffix}`);
  bareChildId = await createTestChild(parentUserId, `ProbeBare${suffix}`);
  childIds.push(coveredChildId, expiredChildId, bareChildId);

  await insertConsent(coveredChildId, 1);
  await insertConsent(expiredChildId, WAIVER_VALID_DAYS + 10);
});

afterAll(async () => {
  const db = getDb();
  if (childIds.length) {
    await db.delete(consents).where(inArray(consents.familyMemberId, childIds));
    await db.delete(familyMembers).where(inArray(familyMembers.id, childIds));
  }
  resetCookies();
});

describe("annual-waiver probes agree with the canonical batch predicate", () => {
  it("GET /api/family-members?includeWaiver=1 matches the predicate per person", async () => {
    const expected = await hasValidLiabilityWaiverBatch(childIds, organizationId);

    const res = await apiFetch("/api/family-members?includeWaiver=1", {
      cookie: parentCookie,
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    const byId = new Map<string, boolean>(
      (body.familyMembers as { id: string; waiverOnFile: boolean }[]).map((m) => [
        m.id,
        m.waiverOnFile,
      ]),
    );

    for (const id of childIds) {
      expect(byId.get(id), `person ${id}`).toBe(expected.get(id));
    }
    // …and the matrix is not degenerate.
    expect(byId.get(coveredChildId)).toBe(true);
    expect(byId.get(expiredChildId)).toBe(false);
    expect(byId.get(bareChildId)).toBe(false);
  });

  it("omits the flag entirely without ?includeWaiver=1", async () => {
    const res = await apiFetch("/api/family-members", { cookie: parentCookie });
    expect(res.status).toBe(200);
    const body = await res.json();
    const row = (body.familyMembers as { id: string }[]).find(
      (m) => m.id === coveredChildId,
    );
    expect(row).toBeDefined();
    expect(row).not.toHaveProperty("waiverOnFile");
  });

  it("GET /api/classes/summary reports the same verdicts as the probe", async () => {
    const expected = await hasValidLiabilityWaiverBatch(childIds, organizationId);

    const res = await apiFetch("/api/classes/summary", { cookie: parentCookie });
    expect(res.status).toBe(200);
    const body = await res.json();
    const byId = new Map<string, boolean>(
      (body.children as { familyMemberId: string; hasWaiverOnFile: boolean }[]).map(
        (c) => [c.familyMemberId, c.hasWaiverOnFile],
      ),
    );

    for (const id of childIds) {
      expect(byId.get(id), `person ${id}`).toBe(expected.get(id));
    }
    expect(byId.get(coveredChildId)).toBe(true);
    expect(byId.get(bareChildId)).toBe(false);
  });
});
