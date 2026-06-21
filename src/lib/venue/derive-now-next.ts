import type { VenueTodaySession } from "./today-types";

export function deriveNowNext(sessions: VenueTodaySession[], nowMs: number) {
  const now: VenueTodaySession[] = [];
  const upcoming: VenueTodaySession[] = [];
  for (const s of sessions) {
    const start = Date.parse(s.startsAt);
    const end = Date.parse(s.endsAt);
    if (start <= nowMs && nowMs < end) now.push(s);
    else if (start > nowMs) upcoming.push(s);
  }
  upcoming.sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  return { now, next: upcoming.slice(0, 4) };
}
