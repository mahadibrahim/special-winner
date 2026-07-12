/**
 * Converts a UTC ISO instant to a 1-based grid row number using wall-clock
 * time in the given IANA timezone (e.g. "America/New_York").
 *
 * Row 1 = dayStartHour:00, row 2 = dayStartHour:30, etc.
 * Each row represents a 30-minute slot.
 */
export function timeToRow(iso: string, dayStartHour: number, timeZone: string): number {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(new Date(iso));
  const hourStr   = parts.find((p) => p.type === "hour")?.value   ?? "00";
  const minuteStr = parts.find((p) => p.type === "minute")?.value ?? "00";
  const hour   = parseInt(hourStr,   10);
  const minute = parseInt(minuteStr, 10);
  const minutes = (hour - dayStartHour) * 60 + minute;
  return Math.floor(minutes / 30) + 1;
}

export function blockRows(
  startsAt: string,
  endsAt: string,
  dayStartHour: number,
  timeZone: string,
) {
  return {
    rowStart: timeToRow(startsAt, dayStartHour, timeZone),
    rowEnd:   timeToRow(endsAt,   dayStartHour, timeZone),
  };
}

export function columnsForSpaces(spaces: { id: string; name: string }[]) {
  return spaces.map((s, i) => ({ ...s, index: i + 2 }));
}

/**
 * Clamps a block's row span to the visible grid window `[1, totalRows + 1]`.
 *
 * A session that starts before the grid's opening hour or ends after its
 * closing hour (e.g. a pickup game created moments after midnight, or any
 * activity logged outside the 8am–9pm business-hours window the day grid
 * renders) otherwise produces a negative or out-of-range row number. Since
 * ScheduleCalendar turns rows directly into an absolute `top` pixel offset,
 * an out-of-range row pushes the block's box outside its grid container —
 * far enough to overlap the sticky header/search bar above it, which
 * silently swallows pointer events aimed at the block (Playwright surfaces
 * this as "<element> subtree intercepts pointer events" on click). Clamping
 * keeps every block's rendered box inside the container, at least one row
 * tall, regardless of how far outside business hours it actually falls.
 *
 * `clamped` is true whenever the block's true time window fell (fully or
 * partly) outside the grid — callers use this to render an "off-hours" chip
 * so a clamped block (which visually lands right at 8am/9pm) doesn't get
 * mistaken for a normal on-the-hour session.
 */
export function clampRowsToWindow(
  rowStart: number,
  rowEnd: number,
  totalRows: number,
): { rowStart: number; rowEnd: number; clamped: boolean } {
  const clampedStart = Math.min(Math.max(rowStart, 1), totalRows);
  const clampedEnd = Math.min(Math.max(rowEnd, clampedStart + 1), totalRows + 1);
  const clamped = rowStart < 1 || rowEnd > totalRows + 1;
  return { rowStart: clampedStart, rowEnd: clampedEnd, clamped };
}

// ─── Collision layout (side-by-side lanes for overlapping same-space blocks) ──

export type LaneBlock = { id: string; rowStart: number; rowEnd: number };
export type LaneAssignment = { lane: number; laneCount: number };

/**
 * Row intervals are half-open `[rowStart, rowEnd)` — see blockRows' doc
 * comment (a 1-hour 9–10am session is rows 3–5, i.e. occupies rows 3 and 4,
 * with rowEnd being "one past the last occupied row"). Two blocks overlap
 * iff each starts before the other ends.
 */
function blocksOverlap(a: LaneBlock, b: LaneBlock): boolean {
  return a.rowStart < b.rowEnd && b.rowStart < a.rowEnd;
}

/**
 * Assigns each block a side-by-side lane (Google-Calendar style) so
 * overlapping same-space sessions render next to each other instead of
 * stacked on top of one another — the root cause of blocks intercepting
 * clicks meant for a session underneath.
 *
 * Algorithm:
 * 1. Sort by rowStart asc (rowEnd desc as a stable tiebreak).
 * 2. Group blocks into connected "overlap clusters" via union-find — a
 *    cluster is the transitive closure of "overlaps with", so a pure chain
 *    A∩B, B∩C (A∦C) is ONE cluster even though A and C never directly touch.
 * 3. For each cluster, laneCount = the cluster's PEAK concurrency (max
 *    simultaneous blocks at any single row), computed via a sweep line —
 *    NOT the cluster's total block count. A pure 3-block chain has peak
 *    concurrency 2 (A+B, then B+C — never all three at once), so it renders
 *    2 lanes wide, not 3.
 * 4. Within a cluster, greedily assign each block (in sorted order) to the
 *    lowest-numbered lane whose previous occupant has already ended by this
 *    block's start row — reusing a freed lane exactly like Google Calendar.
 */
export function assignLanes(blocks: LaneBlock[]): Map<string, LaneAssignment> {
  const result = new Map<string, LaneAssignment>();
  if (blocks.length === 0) return result;

  const sorted = [...blocks].sort((a, b) => {
    if (a.rowStart !== b.rowStart) return a.rowStart - b.rowStart;
    return b.rowEnd - a.rowEnd;
  });

  // Union-find over block ids to build connected overlap clusters.
  const parent = new Map<string, string>();
  for (const b of sorted) parent.set(b.id, b.id);

  function find(id: string): string {
    let root = id;
    while (parent.get(root) !== root) root = parent.get(root)!;
    let cur = id;
    while (parent.get(cur) !== root) {
      const next = parent.get(cur)!;
      parent.set(cur, root);
      cur = next;
    }
    return root;
  }
  function union(a: string, b: string): void {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  }

  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      if (blocksOverlap(sorted[i], sorted[j])) union(sorted[i].id, sorted[j].id);
    }
  }

  // Group blocks by cluster root, preserving the sorted (rowStart asc) order.
  const clusters = new Map<string, LaneBlock[]>();
  for (const b of sorted) {
    const root = find(b.id);
    const arr = clusters.get(root);
    if (arr) arr.push(b);
    else clusters.set(root, [b]);
  }

  for (const clusterBlocks of clusters.values()) {
    // Peak concurrency via sweep line. At equal rows, process "end" events
    // (delta -1) before "start" events (delta +1) — half-open intervals mean
    // a block ending at row X doesn't coexist with one starting at row X.
    const events = clusterBlocks.flatMap((b) => [
      { row: b.rowStart, delta: 1 },
      { row: b.rowEnd, delta: -1 },
    ]);
    events.sort((a, b) => a.row - b.row || a.delta - b.delta);

    let running = 0;
    let peak = 0;
    for (const e of events) {
      running += e.delta;
      if (running > peak) peak = running;
    }
    const laneCount = Math.max(peak, 1);

    // Greedy lane assignment: reuse the lowest lane already free by this
    // block's start row.
    const laneEnds: number[] = [];
    for (const b of clusterBlocks) {
      let lane = laneEnds.findIndex((end) => end <= b.rowStart);
      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(b.rowEnd);
      } else {
        laneEnds[lane] = b.rowEnd;
      }
      result.set(b.id, { lane, laneCount });
    }
  }

  return result;
}
