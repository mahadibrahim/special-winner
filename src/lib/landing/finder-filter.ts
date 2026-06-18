// src/lib/landing/finder-filter.ts
export const FINDER_FILTER_EVENT = "aspire:finder-filter"

export interface FinderFilterDetail {
  /** Sport slug (seasons) or sport/format word (pickup, SoccerOne) to filter to. */
  key: string
  /** Id of the finder <section> to scroll to and that should react. */
  sectionId: string
  /** Optional location slug (e.g. "worthington" | "downtown"). SoccerOne hero
   *  launchpad sets this; finders that don't filter by location ignore it. */
  location?: string
}

let pending: FinderFilterDetail | null = null

/** Fired by a hero tile: notify the finder island, then scroll to it. */
export function dispatchFinderFilter(detail: FinderFilterDetail): void {
  pending = detail
  window.dispatchEvent(new CustomEvent<FinderFilterDetail>(FINDER_FILTER_EVENT, { detail }))
  document
    .getElementById(detail.sectionId)
    ?.scrollIntoView({ behavior: "smooth", block: "start" })
  // The replay buffer only needs to bridge the hydration window for a finder
  // island that mounts just after a pre-hydration click. Expire it so a later
  // remount (e.g. a youth age-band change re-keying the section) doesn't
  // re-apply a filter the user has since cleared. Guard against clobbering a
  // newer dispatch.
  window.setTimeout(() => {
    if (pending === detail) pending = null
  }, 5000)
}

/** Subscribe to tile filter events. Returns an unsubscribe fn. Replays the most
 *  recent filter to a late subscriber (hydration race) — sections gate on
 *  sectionId, so a non-matching replay is a no-op. */
export function onFinderFilter(cb: (detail: FinderFilterDetail) => void): () => void {
  const handler = (e: Event) => cb((e as CustomEvent<FinderFilterDetail>).detail)
  window.addEventListener(FINDER_FILTER_EVENT, handler)
  if (pending) cb(pending)
  return () => window.removeEventListener(FINDER_FILTER_EVENT, handler)
}
