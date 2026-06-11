/**
 * Field-time ledger primitives.
 *
 * Spec: docs/superpowers/specs/2026-06-11-field-time-ledger-design.md
 *
 * Every claim on field time is a resource_blocks row. Two layers keep
 * the ledger conflict-free:
 *   1. DB: GiST exclusion constraint (resource_blocks_no_overlap) makes
 *      same-resource overlap impossible no matter who writes.
 *   2. This module: family-aware checks (a full field conflicts with its
 *      halves and vice versa, siblings don't) under a transaction-scoped
 *      advisory lock keyed on the resource's ROOT, so two concurrent
 *      bookings on different members of the same family serialize.
 *
 * Expired hold-blocks (expiresAt < now — abandoned rental checkouts) are
 * treated as free and deleted on the next write that touches their range.
 */
import { and, eq, gt, inArray, isNotNull, lt, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  resourceBlocks,
  venueResources,
  type BlockSource,
  type ResourceBlock,
} from "@/lib/db/schema/scheduling";

export class BlockConflictError extends Error {
  readonly conflict: { label: string; startsAt: Date; endsAt: Date; sourceType: string };
  constructor(conflict: BlockConflictError["conflict"]) {
    super(
      `Time conflict: "${conflict.label}" (${conflict.sourceType}) occupies this field ` +
        `${conflict.startsAt.toISOString()} – ${conflict.endsAt.toISOString()}`,
    );
    this.name = "BlockConflictError";
    this.conflict = conflict;
  }
}

/** Range overlap on half-open intervals [start, end). Pure — unit tested. */
export function rangesOverlap(
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date,
): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/**
 * Pure family expansion over an in-memory resource list: self, all
 * ancestors, all descendants. Siblings (and their subtrees) excluded.
 * Unit tested; the DB variant below feeds it rows for one venue.
 */
export function expandFamily(
  resourceId: string,
  rows: Array<{ id: string; parentResourceId: string | null }>,
): string[] {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const childrenOf = new Map<string, string[]>();
  for (const r of rows) {
    if (r.parentResourceId) {
      const list = childrenOf.get(r.parentResourceId) ?? [];
      list.push(r.id);
      childrenOf.set(r.parentResourceId, list);
    }
  }

  const family = new Set<string>([resourceId]);
  // Ancestors
  let cur = byId.get(resourceId);
  while (cur?.parentResourceId) {
    family.add(cur.parentResourceId);
    cur = byId.get(cur.parentResourceId);
  }
  // Descendants (BFS)
  const queue = [resourceId];
  while (queue.length > 0) {
    const next = queue.shift()!;
    for (const child of childrenOf.get(next) ?? []) {
      if (!family.has(child)) {
        family.add(child);
        queue.push(child);
      }
    }
  }
  return [...family];
}

/** Root of a resource's tree (for advisory-lock keying). */
export function findRoot(
  resourceId: string,
  rows: Array<{ id: string; parentResourceId: string | null }>,
): string {
  const byId = new Map(rows.map((r) => [r.id, r]));
  let cur = byId.get(resourceId);
  let rootId = resourceId;
  while (cur?.parentResourceId) {
    rootId = cur.parentResourceId;
    cur = byId.get(cur.parentResourceId);
  }
  return rootId;
}

/** Drizzle executor — the transaction object inside db.transaction(). */
export type Tx = Parameters<
  Parameters<ReturnType<typeof getDb>["transaction"]>[0]
>[0];

/**
 * All resources of the venue that owns `resourceId` (small set).
 * MUST run on the caller's transaction: the pg pool is max:1
 * (serverless), so a pool query while a transaction holds the only
 * connection deadlocks until timeout.
 */
async function venueResourceRows(tx: Tx, resourceId: string) {
  const [self] = await tx
    .select({ venueId: venueResources.venueId })
    .from(venueResources)
    .where(eq(venueResources.id, resourceId))
    .limit(1);
  if (!self) throw new Error(`Unknown resource ${resourceId}`);
  return tx
    .select({
      id: venueResources.id,
      parentResourceId: venueResources.parentResourceId,
    })
    .from(venueResources)
    .where(eq(venueResources.venueId, self.venueId));
}

export interface BlockWindow {
  resourceId: string;
  startsAt: Date;
  endsAt: Date;
}

export interface SourceBlockInput extends BlockWindow {
  sourceType: BlockSource;
  sourceId: string;
  label: string;
  expiresAt?: Date | null;
}

/**
 * Throws BlockConflictError if any unexpired block on the resource's
 * family overlaps the window (ignoring the caller's own source row, so
 * updates don't conflict with themselves). Also sweeps expired
 * hold-blocks in the window.
 *
 * Run inside a transaction together with the subsequent write; the
 * advisory lock serializes concurrent family writes for the transaction
 * lifetime.
 */
export async function assertNoBlockConflict(
  tx: Tx,
  window: BlockWindow,
  ignore?: { sourceType: BlockSource; sourceId: string },
): Promise<void> {
  const rows = await venueResourceRows(tx, window.resourceId);
  const familyIds = expandFamily(window.resourceId, rows);
  const rootId = findRoot(window.resourceId, rows);

  // Transaction-scoped advisory lock on the family root.
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${rootId}))`);

  // Free abandoned holds in this window before judging conflicts.
  await tx
    .delete(resourceBlocks)
    .where(
      and(
        inArray(resourceBlocks.resourceId, familyIds),
        isNotNull(resourceBlocks.expiresAt),
        lt(resourceBlocks.expiresAt, new Date()),
        lt(resourceBlocks.startsAt, window.endsAt),
        gt(resourceBlocks.endsAt, window.startsAt),
      ),
    );

  const conflicts = await tx
    .select({
      label: resourceBlocks.label,
      startsAt: resourceBlocks.startsAt,
      endsAt: resourceBlocks.endsAt,
      sourceType: resourceBlocks.sourceType,
      sourceId: resourceBlocks.sourceId,
    })
    .from(resourceBlocks)
    .where(
      and(
        inArray(resourceBlocks.resourceId, familyIds),
        lt(resourceBlocks.startsAt, window.endsAt),
        gt(resourceBlocks.endsAt, window.startsAt),
      ),
    )
    .limit(5);

  const real = conflicts.find(
    (c) =>
      !(
        ignore &&
        c.sourceType === ignore.sourceType &&
        c.sourceId === ignore.sourceId
      ),
  );
  if (real) {
    throw new BlockConflictError({
      label: real.label,
      startsAt: real.startsAt,
      endsAt: real.endsAt,
      sourceType: real.sourceType,
    });
  }
}

/**
 * Upsert the ledger block for a source row (one block per source).
 * Family-conflict-checked. Throws BlockConflictError on conflict.
 */
export async function upsertSourceBlock(input: SourceBlockInput): Promise<void> {
  const db = getDb();
  await db.transaction(async (tx) => {
    await assertNoBlockConflict(tx, input, {
      sourceType: input.sourceType,
      sourceId: input.sourceId,
    });
    await tx
      .insert(resourceBlocks)
      .values({
        resourceId: input.resourceId,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        label: input.label.slice(0, 200),
        expiresAt: input.expiresAt ?? null,
      })
      .onConflictDoUpdate({
        target: [resourceBlocks.sourceType, resourceBlocks.sourceId],
        targetWhere: sql`${resourceBlocks.sourceId} IS NOT NULL`,
        set: {
          resourceId: input.resourceId,
          startsAt: input.startsAt,
          endsAt: input.endsAt,
          label: input.label.slice(0, 200),
          expiresAt: input.expiresAt ?? null,
          updatedAt: new Date(),
        },
      });
  });
}

/** Remove the ledger block for a source row (no-op when absent). */
export async function removeSourceBlock(
  sourceType: BlockSource,
  sourceId: string,
): Promise<void> {
  await getDb()
    .delete(resourceBlocks)
    .where(
      and(
        eq(resourceBlocks.sourceType, sourceType),
        eq(resourceBlocks.sourceId, sourceId),
      ),
    );
}

/** Blocks for a venue/day — feeds availability + the admin calendar. */
export async function getBlocksForVenueDay(
  venueId: string,
  dayStart: Date,
  dayEnd: Date,
): Promise<Array<ResourceBlock & { resourceName: string }>> {
  const db = getDb();
  const rows = await db
    .select({
      block: resourceBlocks,
      resourceName: venueResources.name,
    })
    .from(resourceBlocks)
    .innerJoin(venueResources, eq(resourceBlocks.resourceId, venueResources.id))
    .where(
      and(
        eq(venueResources.venueId, venueId),
        lt(resourceBlocks.startsAt, dayEnd),
        gt(resourceBlocks.endsAt, dayStart),
      ),
    );
  const now = new Date();
  return rows
    .filter((r) => !(r.block.expiresAt && r.block.expiresAt < now))
    .map((r) => ({ ...r.block, resourceName: r.resourceName }));
}
