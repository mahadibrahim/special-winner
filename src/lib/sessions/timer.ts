export interface SegmentWindow {
  order: number;
  startsAtMinute: number;
  endsAtMinute: number;
}

export function segmentWindows(
  segments: Array<{ order: number; durationMinutes: number }>,
): SegmentWindow[] {
  let cursor = 0;
  return segments.map((s) => {
    const startsAtMinute = cursor;
    cursor += s.durationMinutes;
    return { order: s.order, startsAtMinute, endsAtMinute: cursor };
  });
}

export function elapsedMinutes(startedAtIso: string, nowMs: number): number {
  return Math.max(0, (nowMs - Date.parse(startedAtIso)) / 60_000);
}
