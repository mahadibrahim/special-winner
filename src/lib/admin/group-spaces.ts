/**
 * Group admin space (venue) options by their parent facility (location) so a
 * picker can render one <optgroup> / <SelectGroup> per facility.
 *
 * A "space" is a bookable area inside a facility — without its facility name a
 * bare space name ("Field 1") is ambiguous as soon as an org runs more than
 * one facility. Spaces with no resolved facility fall into a trailing "Other"
 * group rather than being dropped.
 */
export interface SpaceWithLocation {
  id: string;
  name: string;
  location?: { name: string } | null;
}

export interface SpaceGroup<T> {
  /** Facility name — the <optgroup> / <SelectLabel> heading. */
  locationName: string;
  spaces: T[];
}

const OTHER = "Other";

export function groupSpacesByLocation<T extends SpaceWithLocation>(
  spaces: T[],
): SpaceGroup<T>[] {
  const byLocation = new Map<string, T[]>();
  for (const space of spaces) {
    const key = space.location?.name?.trim() || OTHER;
    const group = byLocation.get(key);
    if (group) group.push(space);
    else byLocation.set(key, [space]);
  }
  return [...byLocation.entries()]
    .sort(([a], [b]) => {
      // Keep the catch-all "Other" group last; otherwise sort A→Z by facility.
      if (a === OTHER) return 1;
      if (b === OTHER) return -1;
      return a.localeCompare(b);
    })
    .map(([locationName, group]) => ({
      locationName,
      spaces: [...group].sort((a, b) => a.name.localeCompare(b.name)),
    }));
}
