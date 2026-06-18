// src/lib/landing/finder-filter.ts
export const FINDER_FILTER_EVENT = "aspire:finder-filter"

export interface FinderFilterDetail {
  /** Sport slug (seasons) or sport word (pickup) to filter to. */
  key: string
  /** Id of the finder <section> to scroll to and that should react. */
  sectionId: string
}

/** Fired by a hero tile: notify the finder island, then scroll to it. */
export function dispatchFinderFilter(detail: FinderFilterDetail): void {
  window.dispatchEvent(new CustomEvent<FinderFilterDetail>(FINDER_FILTER_EVENT, { detail }))
  document
    .getElementById(detail.sectionId)
    ?.scrollIntoView({ behavior: "smooth", block: "start" })
}

/** Subscribe to tile filter events. Returns an unsubscribe fn. */
export function onFinderFilter(cb: (detail: FinderFilterDetail) => void): () => void {
  const handler = (e: Event) => cb((e as CustomEvent<FinderFilterDetail>).detail)
  window.addEventListener(FINDER_FILTER_EVENT, handler)
  return () => window.removeEventListener(FINDER_FILTER_EVENT, handler)
}
