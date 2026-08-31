/**
 * Public class catalog endpoints — GET /api/public/class-packs and
 * GET /api/public/class-blocks (Task 6 of the class purchase ladder).
 *
 * Both are anonymous, org-resolved reads. The block endpoint returns the ONE
 * current-or-next block, so these tests have to control which `class_blocks`
 * rows are active for the duration of the file: `beforeAll` parks every
 * pre-existing active block in the org and `afterAll` un-parks them. Each block
 * test then creates its own block, asserts, and parks it again (in a `finally`)
 * before the next one runs — `tests/api` runs with `fileParallelism: false`
 * (vitest.config.ts), so nothing races this.
 *
 * PARKING IS CRASH-RECOVERABLE, and deliberately so: this suite deactivates
 * rows it does not own on a SHARED staging DB, so a killed run (Ctrl-C, CI
 * timeout, OOM) that never reaches `afterAll` must not leave a real block
 * switched off forever. Parking therefore stamps a marker onto the block's
 * name and restoration scans for that marker rather than an in-memory id list
 * (which dies with the process it lived in). Same "rediscoverable marker,
 * swept on entry" shape as `sweepOrphanedTestTemplates` in
 * tests/utils/classes-helpers.ts.
 *
 * The marker is RUN-SCOPED — `[parked-by-test:<runId>:<unixHour>] ` — because
 * `fileParallelism: false` only serializes files WITHIN one vitest process:
 * a CI run overlapping a local run (or a second worktree/agent) hits the same
 * staging DB concurrently. A generic marker would let either process un-park
 * the other's rows mid-suite. So restoration splits in two:
 *   - `afterAll`'s `finally` restores ONLY this process's exact marker;
 *   - `beforeAll` recovers rows whose marker belongs to ANOTHER run AND whose
 *     stamped hour is more than STALE_HOURS old — old enough that no live
 *     suite could still be holding them.
 *
 * ACCEPTED RESIDUAL RISK: a crashed run's blocks stay parked (inactive, with a
 * visibly marked name) for up to STALE_HOURS before the next run recovers
 * them. That is the deliberate trade for never yanking a concurrent run's
 * rows out from under it; the alternative failure — two suites fighting over
 * which blocks are active — produces confusing red tests instead of one
 * bounded, self-healing window.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { and, eq, inArray, like } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { classBlocks, classPackProducts } from "@/lib/db/schema/classes";
import { organizations } from "@/lib/db/schema/organizations";
import { ORG_DEFAULT_TIMEZONE } from "@/lib/time/zoned-day";
import { apiFetch } from "./setup/test-helpers";
import {
  resolveClassTestFixtures,
  createTestClassTemplate,
  sweepOrphanedTestTemplates,
  cleanupTestClassFixtures,
} from "../utils/classes-helpers";

let organizationId: string;
let venueId: string;
let timeZone: string;

const createdTemplateIds: string[] = [];
const createdBlockIds: string[] = [];
const createdPackIds: string[] = [];

/** Shared prefix of every parked-block stamp. `[`, `]` and `:` are not LIKE
 *  metacharacters in Postgres, so markers are matchable with a plain prefix
 *  `LIKE`. */
const PARK_PREFIX = "[parked-by-test:";
/** Identifies THIS process's parked rows. Contains no `:` or `]` so the marker
 *  stays unambiguously parseable. */
const RUN_ID = `${process.pid}-${Date.now().toString(36)}`;
/** Hours after which another run's parked rows are treated as crash debris. */
const STALE_HOURS = 6;
const unixHour = () => Math.floor(Date.now() / 3_600_000);
/** `[parked-by-test:<runId>:<unixHour>] ` — stamped onto a parked block's name. */
const OWN_MARKER = `${PARK_PREFIX}${RUN_ID}:${unixHour()}] `;
/** Parses any run's marker off a parked name. */
const MARKER_RE = /^\[parked-by-test:([^:\]]+):(\d+)\] /;

/** Today's civil date ("YYYY-MM-DD") in the org's timezone — the same notion
 *  of "today" the endpoint uses to decide which block is current. */
function orgToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** `delta` calendar days from the org's today, as "YYYY-MM-DD". */
function civilDay(delta: number): string {
  const [y, m, d] = orgToday().split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + delta)).toISOString().slice(0, 10);
}

/** JS weekday (0=Sun) of a "YYYY-MM-DD" civil date. */
function weekdayOf(civil: string): number {
  return new Date(`${civil}T00:00:00Z`).getUTCDay();
}

/** Deactivate blocks this suite CREATED — no marker needed, `afterAll` deletes
 *  them outright and a crashed run leaves only disposable fixtures behind. */
async function parkBlocks(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await getDb().update(classBlocks).set({ active: false }).where(inArray(classBlocks.id, ids));
}

/** Deactivate every currently-active block in the org that this suite does NOT
 *  own, stamping OWN_MARKER on the name so this run — and only this run — can
 *  find them again, even after a crash. */
async function parkPreExistingBlocks(): Promise<void> {
  const db = getDb();
  const rows = await db
    .select({ id: classBlocks.id, name: classBlocks.name })
    .from(classBlocks)
    .where(and(eq(classBlocks.organizationId, organizationId), eq(classBlocks.active, true)));

  for (const row of rows) {
    if (createdBlockIds.includes(row.id)) continue;
    await db
      .update(classBlocks)
      .set({ active: false, name: `${OWN_MARKER}${row.name}` })
      .where(eq(classBlocks.id, row.id));
  }
}

/** Reactivate the blocks THIS process parked and strip its marker. Idempotent;
 *  never touches another run's rows. */
async function unparkOwnBlocks(): Promise<void> {
  const db = getDb();
  const rows = await db
    .select({ id: classBlocks.id, name: classBlocks.name })
    .from(classBlocks)
    .where(
      and(eq(classBlocks.organizationId, organizationId), like(classBlocks.name, `${OWN_MARKER}%`)),
    );

  for (const row of rows) {
    await db
      .update(classBlocks)
      .set({ active: true, name: row.name.slice(OWN_MARKER.length) })
      .where(eq(classBlocks.id, row.id));
  }
}

/** Crash recovery, `beforeAll` only: restore rows parked by a DIFFERENT run
 *  whose stamped hour is older than STALE_HOURS. A recent stamp is assumed to
 *  belong to a live concurrent run and is left alone (see the file docstring's
 *  accepted residual risk). */
async function recoverStaleParkedBlocks(): Promise<void> {
  const db = getDb();
  const rows = await db
    .select({ id: classBlocks.id, name: classBlocks.name })
    .from(classBlocks)
    .where(
      and(eq(classBlocks.organizationId, organizationId), like(classBlocks.name, `${PARK_PREFIX}%`)),
    );

  const cutoffHour = unixHour() - STALE_HOURS;
  for (const row of rows) {
    const match = MARKER_RE.exec(row.name);
    if (!match) continue;
    const [marker, runId, stampedHour] = match;
    if (runId === RUN_ID) continue; // this process's own rows — unparkOwnBlocks owns them
    if (Number(stampedHour) > cutoffHour) continue; // possibly still live
    await db
      .update(classBlocks)
      .set({ active: true, name: row.name.slice(marker.length) })
      .where(eq(classBlocks.id, row.id));
  }
}

async function createBlock(opts: {
  name: string;
  startDate: string;
  endDate: string;
  active?: boolean;
}): Promise<string> {
  const [row] = await getDb()
    .insert(classBlocks)
    .values({
      organizationId,
      name: opts.name,
      startDate: opts.startDate,
      endDate: opts.endDate,
      active: opts.active ?? true,
    })
    .returning({ id: classBlocks.id });
  createdBlockIds.push(row.id);
  return row.id;
}

async function createPack(opts: {
  name: string;
  sessionCount: number;
  priceCents: number;
  expiryMonths?: number;
  displayOrder?: number;
  active?: boolean;
}): Promise<string> {
  const [row] = await getDb()
    .insert(classPackProducts)
    .values({
      organizationId,
      name: opts.name,
      sessionCount: opts.sessionCount,
      priceCents: opts.priceCents,
      expiryMonths: opts.expiryMonths ?? 6,
      displayOrder: opts.displayOrder ?? 0,
      active: opts.active ?? true,
    })
    .returning({ id: classPackProducts.id });
  createdPackIds.push(row.id);
  return row.id;
}

beforeAll(async () => {
  ({ organizationId, venueId } = await resolveClassTestFixtures());
  await sweepOrphanedTestTemplates(organizationId);

  const db = getDb();
  const [org] = await db
    .select({ timezone: organizations.timezone })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);
  timeZone = org?.timezone ?? ORG_DEFAULT_TIMEZONE;

  // Recover a crashed run's stale rows BEFORE parking, so a marker-stamped
  // row never gets double-stamped by this run.
  await recoverStaleParkedBlocks();
  await parkPreExistingBlocks();
});

afterAll(async () => {
  const db = getDb();
  try {
    await cleanupTestClassFixtures(createdTemplateIds);
    if (createdBlockIds.length > 0) {
      await db.delete(classBlocks).where(inArray(classBlocks.id, createdBlockIds));
    }
    if (createdPackIds.length > 0) {
      await db.delete(classPackProducts).where(inArray(classPackProducts.id, createdPackIds));
    }
  } finally {
    // Un-parking rows this suite does not own is the one teardown step that
    // must run even if the cleanup above throws.
    await unparkOwnBlocks();
  }
});

describe("GET /api/public/class-packs", () => {
  it("200s with an empty list when the org has no active packs", async () => {
    const db = getDb();
    const active = await db
      .select({ id: classPackProducts.id })
      .from(classPackProducts)
      .where(
        and(
          eq(classPackProducts.organizationId, organizationId),
          eq(classPackProducts.active, true),
        ),
      );
    const ids = active.map((p) => p.id);
    if (ids.length > 0) {
      await db.update(classPackProducts).set({ active: false }).where(inArray(classPackProducts.id, ids));
    }
    try {
      const res = await apiFetch("/api/public/class-packs");
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ packs: [] });
    } finally {
      if (ids.length > 0) {
        await db.update(classPackProducts).set({ active: true }).where(inArray(classPackProducts.id, ids));
      }
    }
  });

  it("lists active packs by displayOrder and omits inactive ones", async () => {
    const suffix = Date.now();
    const secondId = await createPack({
      name: `Catalog Pack B ${suffix}`,
      sessionCount: 10,
      priceCents: 22000,
      expiryMonths: 12,
      displayOrder: 20,
    });
    const firstId = await createPack({
      name: `Catalog Pack A ${suffix}`,
      sessionCount: 4,
      priceCents: 9600,
      expiryMonths: 3,
      displayOrder: 10,
    });
    const inactiveId = await createPack({
      name: `Catalog Pack Retired ${suffix}`,
      sessionCount: 8,
      priceCents: 18000,
      displayOrder: 1,
      active: false,
    });

    const res = await apiFetch("/api/public/class-packs");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.packs)).toBe(true);

    const mine = body.packs.filter((p: any) => [firstId, secondId, inactiveId].includes(p.id));
    expect(mine.map((p: any) => p.id)).toEqual([firstId, secondId]);
    expect(mine[0]).toEqual({
      id: firstId,
      name: `Catalog Pack A ${suffix}`,
      sessionCount: 4,
      priceCents: 9600,
      expiryMonths: 3,
    });
  });
});

describe("GET /api/public/class-blocks", () => {
  it("200s with { block: null } when the org has no current-or-next block", async () => {
    // Pre-existing blocks are parked in beforeAll; an already-ended block must
    // not be picked either.
    const endedId = await createBlock({
      name: `Catalog Block Ended ${Date.now()}`,
      startDate: civilDay(-40),
      endDate: civilDay(-10),
    });

    // `finally` throughout this describe: each test owns "only my block is
    // active" as an invariant for the NEXT one, so a failed assertion must
    // still hand that state back rather than cascading into every later test.
    try {
      const res = await apiFetch("/api/public/class-blocks");
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ block: null });
    } finally {
      await parkBlocks([endedId]);
    }
  });

  it("prorates a mid-flight block: remainingSessions < totalSessions, prices follow the counts", async () => {
    const suffix = Date.now();
    // Window straddles today with ≥2 past and ≥2 future occurrences of the
    // slot's weekday, whichever day of the week the suite happens to run on.
    const startDate = civilDay(-21);
    const endDate = civilDay(21);
    const weekday = weekdayOf(civilDay(3));
    const blockId = await createBlock({ name: `Catalog Block Mid ${suffix}`, startDate, endDate });

    const templateId = await createTestClassTemplate({
      organizationId,
      venueId,
      name: `Catalog-Mid-${suffix}`,
      capacity: 6,
      weekday,
      startTime: "16:00:00",
      sessionRateCents: 2000,
      blockRateCents: 3000,
    });
    createdTemplateIds.push(templateId);

    try {
      const res = await apiFetch("/api/public/class-blocks");
      expect(res.status).toBe(200);
      const { block } = await res.json();
      expect(block).toMatchObject({
        id: blockId,
        name: `Catalog Block Mid ${suffix}`,
        startDate,
        endDate,
        upcoming: false,
      });

      const tpl = block.templates.find((t: any) => t.slotTemplateId === templateId);
      expect(tpl).toBeTruthy();
      expect(Object.keys(tpl).sort()).toEqual(
        [
          "fullPriceCents",
          "name",
          "proratedPriceCents",
          "remainingSessions",
          "slotTemplateId",
          "spotsLeft",
          "startTime",
          "totalSessions",
          "venueName",
          "weekday",
        ].sort(),
      );
      expect(tpl.weekday).toBe(weekday);
      expect(tpl.startTime).toBe("16:00:00");
      expect(typeof tpl.venueName).toBe("string");
      expect(tpl.spotsLeft).toBe(6);
      // Mid-flight: some sessions are already gone.
      expect(tpl.remainingSessions).toBeGreaterThanOrEqual(2);
      expect(tpl.remainingSessions).toBeLessThan(tpl.totalSessions);
      expect(tpl.totalSessions - tpl.remainingSessions).toBeGreaterThanOrEqual(2);
      // blockRateCents wins over sessionRateCents.
      expect(tpl.fullPriceCents).toBe(tpl.totalSessions * 3000);
      expect(tpl.proratedPriceCents).toBe(tpl.remainingSessions * 3000);
    } finally {
      await parkBlocks([blockId]);
      await cleanupTestClassFixtures([templateId]);
    }
  });

  it("marks a not-yet-started block upcoming, falls back to sessionRateCents, and omits rate-less templates", async () => {
    const suffix = Date.now();
    // A 14-day inclusive window contains exactly two of any given weekday.
    const startDate = civilDay(7);
    const endDate = civilDay(20);
    const weekday = weekdayOf(civilDay(9));
    const blockId = await createBlock({ name: `Catalog Block Next ${suffix}`, startDate, endDate });

    const sellableId = await createTestClassTemplate({
      organizationId,
      venueId,
      name: `Catalog-Next-${suffix}`,
      capacity: 8,
      weekday,
      startTime: "17:00:00",
      sessionRateCents: 2500, // no blockRateCents → falls back
    });
    const unsellableId = await createTestClassTemplate({
      organizationId,
      venueId,
      name: `Catalog-NoRate-${suffix}`,
      capacity: 8,
      weekday,
      startTime: "18:00:00",
    });
    createdTemplateIds.push(sellableId, unsellableId);

    try {
      const res = await apiFetch("/api/public/class-blocks");
      expect(res.status).toBe(200);
      const { block } = await res.json();
      expect(block.id).toBe(blockId);
      expect(block.upcoming).toBe(true);

      const tpl = block.templates.find((t: any) => t.slotTemplateId === sellableId);
      expect(tpl).toBeTruthy();
      expect(tpl.totalSessions).toBe(2);
      expect(tpl.remainingSessions).toBe(2);
      expect(tpl.fullPriceCents).toBe(5000);
      expect(tpl.proratedPriceCents).toBe(5000);

      // Both rates null = unsellable (Task 5's class_rate_not_configured) — omitted.
      expect(block.templates.find((t: any) => t.slotTemplateId === unsellableId)).toBeUndefined();
    } finally {
      await parkBlocks([blockId]);
      await cleanupTestClassFixtures([sellableId, unsellableId]);
    }
  });

  it("picks the earliest-starting active block and ignores inactive ones", async () => {
    const suffix = Date.now();
    const laterId = await createBlock({
      name: `Catalog Block Later ${suffix}`,
      startDate: civilDay(30),
      endDate: civilDay(45),
    });
    const inactiveId = await createBlock({
      name: `Catalog Block Inactive ${suffix}`,
      startDate: civilDay(1),
      endDate: civilDay(20),
      active: false,
    });
    const earlierId = await createBlock({
      name: `Catalog Block Earlier ${suffix}`,
      startDate: civilDay(5),
      endDate: civilDay(12),
    });

    try {
      const res = await apiFetch("/api/public/class-blocks");
      expect(res.status).toBe(200);
      const { block } = await res.json();
      expect(block.id).toBe(earlierId);
      expect(block.id).not.toBe(inactiveId);
    } finally {
      await parkBlocks([laterId, earlierId]);
    }
  });
});
