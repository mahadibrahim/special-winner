import type { ApiSeason } from "./api-season"

/**
 * Client-side fetch of the host-scoped public catalog, memoized per page
 * load. Category pages now carry several islands that all need the same
 * inventory (finder, season-facts band, season-calendar band) — sharing one
 * in-flight promise keeps that to a single network request. A failed fetch
 * clears the cache so a later island (or remount) can retry.
 */
let inflight: Promise<ApiSeason[]> | null = null

export function fetchPublicCatalogSeasons(): Promise<ApiSeason[]> {
  if (!inflight) {
    inflight = fetch("/api/public/seasons")
      .then((r) =>
        r.ok ? r.json() : Promise.reject(new Error(`seasons fetch failed: ${r.status}`)),
      )
      .then((j: { seasons: ApiSeason[] }) => j.seasons)
      .catch((err) => {
        inflight = null
        throw err
      })
  }
  return inflight
}
