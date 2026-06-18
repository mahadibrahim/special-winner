// src/lib/hooks/use-finder-filter.ts
import { useEffect, useRef } from "react"
import { onFinderFilter, type FinderFilterDetail } from "@/lib/landing/finder-filter"

/**
 * Run `cb` whenever a hero tile dispatches a finder-filter event. The callback
 * is held in a ref so the window listener is attached once, not re-subscribed
 * on every render (the caller need not memoize `cb`).
 */
export function useFinderFilter(cb: (detail: FinderFilterDetail) => void): void {
  const ref = useRef(cb)
  ref.current = cb
  useEffect(() => onFinderFilter((detail) => ref.current(detail)), [])
}
