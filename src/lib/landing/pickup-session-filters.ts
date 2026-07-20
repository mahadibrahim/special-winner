import type { SessionCardData } from "@/components/dropin/SessionCard";

export interface VenueTab {
  venueId: string;
  venueName: string;
  count: number;
}

/** Distinct venues present in the session set, each with a count. Sorted by
 * count desc, then venue name asc — the busiest location leads. */
export function deriveVenueTabs(sessions: SessionCardData[]): VenueTab[] {
  const acc = new Map<string, VenueTab>();
  for (const sesh of sessions) {
    if (!sesh.venueId || !sesh.venueName) continue;
    const existing = acc.get(sesh.venueId);
    if (existing) existing.count++;
    else acc.set(sesh.venueId, { venueId: sesh.venueId, venueName: sesh.venueName, count: 1 });
  }
  return [...acc.values()].sort(
    (a, b) => b.count - a.count || a.venueName.localeCompare(b.venueName),
  );
}

export interface PickupFilters {
  venueId?: string | null;
  date?: string | null;
  sport?: string | null;
  skill?: string | null;
  /** Hero-tile cross-filter: substring match on the free-text sport label. */
  sportKey?: string | null;
}

export function filterPickupSessions(
  sessions: SessionCardData[],
  filters: PickupFilters,
  dateBucketOf?: (startsAt: string) => string,
): SessionCardData[] {
  return sessions.filter((sesh) => {
    if (filters.venueId && sesh.venueId !== filters.venueId) return false;
    if (filters.sportKey && !sesh.sportOrClassLabel.toLowerCase().includes(filters.sportKey.toLowerCase())) return false;
    if (filters.sport && sesh.sportOrClassLabel !== filters.sport) return false;
    if (filters.skill && sesh.skillLevel !== filters.skill) return false;
    if (filters.date && dateBucketOf && dateBucketOf(sesh.startsAt) !== filters.date) return false;
    return true;
  });
}
