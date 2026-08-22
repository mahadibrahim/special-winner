/**
 * START keyword org scoping (#402).
 *
 * The bug: `processStartKeyword` updated phone_opt_ins by phone alone — one
 * START text flipped EVERY org's row for that phone to opted_in, promoting
 * `pending` rows in orgs that never contacted the person. Over-applying an
 * opt-OUT (STOP) is safe; over-applying an opt-IN manufactures consent,
 * which is precisely what TCPA — and a 10DLC carrier reviewer — exists to
 * catch (this project's first 10DLC registration was declined over an
 * opt-in defect).
 *
 * The issue's acceptance test, verbatim: a START arriving on Org A's
 * conversation, with pending rows in Org A and Org B, opts in Org A ONLY.
 * Plus the bare-START restore semantics: opted_out rows come back, pending
 * rows never move, provenance survives.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { asc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { organizations } from "@/lib/db/schema/organizations";
import { phoneOptIns } from "@/lib/db/schema/phone-verifications";
import { processStartKeyword } from "@/lib/sms/compliance";

const SUFFIX = `${Date.now()}`.slice(-7);
// E.164-ish uniques so parallel suites and reruns can't collide.
const WELCOME_PHONE = `+1574${SUFFIX}`;
const RESTORE_PHONE = `+1575${SUFFIX}`;
const ALL_PHONES = [WELCOME_PHONE, RESTORE_PHONE];

let ORG_A = "";
let ORG_B = "";

describe("processStartKeyword — org scoping (#402)", () => {
  beforeAll(async () => {
    const db = getDb();
    // Deterministic pick on the shared staging/CI DB (multi-tenant hazard):
    // oldest two orgs. The tenant-scoping suites already require ≥2 orgs.
    const orgs = await db
      .select({ id: organizations.id })
      .from(organizations)
      .orderBy(asc(organizations.createdAt))
      .limit(2);
    expect(orgs.length, "needs the two seeded orgs").toBe(2);
    ORG_A = orgs[0].id;
    ORG_B = orgs[1].id;
  });

  afterAll(async () => {
    await getDb().delete(phoneOptIns).where(inArray(phoneOptIns.phone, ALL_PHONES));
  });

  it("a welcome-reply START opts in the welcoming org ONLY — the other org's pending row stays pending", async () => {
    const db = getDb();
    await db.insert(phoneOptIns).values([
      { organizationId: ORG_A, phone: WELCOME_PHONE, channel: "sms", status: "pending" },
      { organizationId: ORG_B, phone: WELCOME_PHONE, channel: "sms", status: "pending" },
    ]);

    const updated = await processStartKeyword(WELCOME_PHONE, "YES", {
      organizationId: ORG_A,
    });
    expect(updated).toBe(1);

    const rows = await db
      .select({
        organizationId: phoneOptIns.organizationId,
        status: phoneOptIns.status,
        optInSource: phoneOptIns.optInSource,
      })
      .from(phoneOptIns)
      .where(eq(phoneOptIns.phone, WELCOME_PHONE));

    const orgA = rows.find((r) => r.organizationId === ORG_A);
    const orgB = rows.find((r) => r.organizationId === ORG_B);
    expect(orgA?.status).toBe("opted_in");
    expect(orgA?.optInSource).toBe("welcome_reply_yes");
    // The whole bug: this row used to flip too. Org B never contacted this
    // person — its pending row must not become consent.
    expect(orgB?.status, "a START aimed at Org A must not opt in Org B").toBe("pending");
    expect(orgB?.optInSource).toBeNull();
  });

  it("a bare START restores opted_out rows, never pending ones, and keeps provenance", async () => {
    const db = getDb();
    await db.insert(phoneOptIns).values([
      {
        organizationId: ORG_A,
        phone: RESTORE_PHONE,
        channel: "sms",
        status: "opted_out",
        optInSource: "checkout_sms_recapture",
        optedOutAt: new Date("2026-05-01T00:00:00Z"),
        stopKeywordTriggered: "STOP",
      },
      { organizationId: ORG_B, phone: RESTORE_PHONE, channel: "sms", status: "pending" },
    ]);

    const updated = await processStartKeyword(RESTORE_PHONE, "START");
    expect(updated).toBe(1);

    const rows = await db
      .select({
        organizationId: phoneOptIns.organizationId,
        status: phoneOptIns.status,
        optInSource: phoneOptIns.optInSource,
        stopKeywordTriggered: phoneOptIns.stopKeywordTriggered,
      })
      .from(phoneOptIns)
      .where(eq(phoneOptIns.phone, RESTORE_PHONE));

    const restored = rows.find((r) => r.organizationId === ORG_A);
    const untouched = rows.find((r) => r.organizationId === ORG_B);
    expect(restored?.status, "STOP then START must restore the consent STOP removed").toBe(
      "opted_in",
    );
    expect(restored?.stopKeywordTriggered).toBeNull();
    // Restore is not a new consent event — the original provenance survives.
    expect(restored?.optInSource).toBe("checkout_sms_recapture");
    expect(untouched?.status, "a bare START must never promote a pending row").toBe(
      "pending",
    );
  });
});
