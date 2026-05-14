/**
 * Pure time-range helpers for rental availability. No DB access.
 * A "block" is a half-open interval [startsAt, endsAt).
 */
export interface TimeBlock {
  startsAt: Date;
  endsAt: Date;
}

/** Half-open overlap: touching endpoints do not count as overlapping. */
export function rangesOverlap(
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date,
): boolean {
  return aStart.getTime() < bEnd.getTime() && bStart.getTime() < aEnd.getTime();
}

/** Merge overlapping/adjacent blocks into a sorted, disjoint list. */
function mergeBlocks(blocks: TimeBlock[]): TimeBlock[] {
  const sorted = [...blocks].sort(
    (x, y) => x.startsAt.getTime() - y.startsAt.getTime(),
  );
  const merged: TimeBlock[] = [];
  for (const block of sorted) {
    const last = merged[merged.length - 1];
    if (last && block.startsAt.getTime() <= last.endsAt.getTime()) {
      if (block.endsAt.getTime() > last.endsAt.getTime()) {
        last.endsAt = block.endsAt;
      }
    } else {
      merged.push({ startsAt: block.startsAt, endsAt: block.endsAt });
    }
  }
  return merged;
}

/**
 * Subtract busy blocks from a [windowStart, windowEnd) window, returning
 * the free blocks. Busy blocks are merged first so overlapping inputs are
 * handled correctly.
 */
export function subtractBusyBlocks(
  windowStart: Date,
  windowEnd: Date,
  busy: TimeBlock[],
): TimeBlock[] {
  const free: TimeBlock[] = [];
  let cursor = windowStart;
  for (const block of mergeBlocks(busy)) {
    if (block.endsAt <= cursor) continue;
    if (block.startsAt >= windowEnd) break;
    if (block.startsAt > cursor) {
      free.push({ startsAt: cursor, endsAt: block.startsAt });
    }
    if (block.endsAt > cursor) cursor = block.endsAt;
  }
  if (cursor < windowEnd) {
    free.push({ startsAt: cursor, endsAt: windowEnd });
  }
  return free;
}
