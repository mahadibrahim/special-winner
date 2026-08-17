import { describe, it, expect, vi, afterEach, beforeEach } from "vitest"
import { dispatchFinderFilter, onFinderFilter, type FinderFilterDetail } from "@/lib/landing/finder-filter"

// finder-filter.ts uses window/document APIs. Provide minimal stubs so the
// module can be exercised in the Node/Vitest environment without jsdom.
// Re-stub before each test to reset the in-memory listener map and avoid
// shared-state leakage between tests. Note: the module-level `pending` replay
// buffer in finder-filter.ts isn't externally resettable, which is why each
// test that subscribes also dispatches first.
beforeEach(() => {
  const listeners: Record<string, EventListenerOrEventListenerObject[]> = {}
  ;(globalThis as any).window = {
    dispatchEvent: (e: CustomEvent) => {
      ;(listeners[e.type] ?? []).forEach((l) =>
        typeof l === "function" ? l(e) : l.handleEvent(e),
      )
    },
    addEventListener: (type: string, fn: EventListenerOrEventListenerObject) => {
      ;(listeners[type] ??= []).push(fn)
    },
    removeEventListener: (type: string, fn: EventListenerOrEventListenerObject) => {
      listeners[type] = (listeners[type] ?? []).filter((l) => l !== fn)
    },
    setTimeout: (_fn: () => void, _ms: number) => 0,
  }
  ;(globalThis as any).document = {
    getElementById: (_id: string) => null,
  }
})

describe("finder-filter event bus", () => {
  afterEach(() => vi.restoreAllMocks())

  it("carries an optional location through dispatch → subscribe", () => {
    vi.spyOn(document, "getElementById").mockReturnValue({
      scrollIntoView: () => {},
    } as unknown as HTMLElement)

    const received: FinderFilterDetail[] = []
    const off = onFinderFilter((d) => received.push(d))
    dispatchFinderFilter({ key: "leagues", sectionId: "finder", location: "worthington" })
    off()

    expect(received).toHaveLength(1)
    expect(received[0].location).toBe("worthington")
    expect(received[0].key).toBe("leagues")
  })

  it("omits location when not provided", () => {
    // Dispatch before subscribing so the module-level pending buffer holds this
    // test's event (not a stale one from a prior test) when onFinderFilter replays.
    dispatchFinderFilter({ key: "soccer", sectionId: "sessions" })
    const received: FinderFilterDetail[] = []
    const off = onFinderFilter((d) => received.push(d))
    off()

    expect(received).toHaveLength(1)
    expect(received[0].key).toBe("soccer")
    expect(received[0].location).toBeUndefined()
  })

  it("scrolls the target section into view by default", () => {
    // Pins the pre-existing hero-tile behavior every adult/SoccerOne launchpad
    // depends on: adding the opt-out below must not change the no-options call.
    const scrollIntoView = vi.fn()
    vi.spyOn(document, "getElementById").mockReturnValue({
      scrollIntoView,
    } as unknown as HTMLElement)

    dispatchFinderFilter({ key: "soccer", sectionId: "finder" })

    expect(scrollIntoView).toHaveBeenCalledTimes(1)
  })

  it("skips the scroll when scroll:false", () => {
    // The youth birthday lookup filters the finder as a side effect of a
    // <select> change while the user is reading the answer right above it —
    // scrolling them away from that answer reads as a page hijack.
    const scrollIntoView = vi.fn()
    vi.spyOn(document, "getElementById").mockReturnValue({
      scrollIntoView,
    } as unknown as HTMLElement)

    dispatchFinderFilter({ key: "soccer", sectionId: "finder", ageGroup: "U10" }, { scroll: false })

    expect(scrollIntoView).not.toHaveBeenCalled()
  })

  it("still broadcasts the detail when the scroll is skipped", () => {
    dispatchFinderFilter({ key: "soccer", sectionId: "finder", ageGroup: "U10" }, { scroll: false })
    const received: FinderFilterDetail[] = []
    const off = onFinderFilter((d) => received.push(d))
    off()

    expect(received).toHaveLength(1)
    expect(received[0].ageGroup).toBe("U10")
  })

  it("preserves `ageGroup` as an own key when clearing, so subscribers can tell 'cleared' from 'not mine'", () => {
    // category-finder.tsx gates on `"ageGroup" in detail` — a dispatcher that
    // doesn't do age groups (a sport hero tile) omits the key and must not wipe
    // a ladder selection, while the ladder clearing its own filter sends the key
    // with an undefined value. If the transport ever dropped undefined keys
    // (e.g. via a JSON round-trip) the age ladder would become set-only again,
    // which is exactly the dead end this pins shut.
    // Dispatch-before-subscribe for the same reason the location test does it:
    // the stubbed setTimeout never fires, so the module's `pending` replay
    // buffer still holds the previous test's detail and would deliver two
    // events to a subscriber registered first.
    dispatchFinderFilter({ key: "soccer", sectionId: "finder", ageGroup: undefined })
    const received: FinderFilterDetail[] = []
    const off = onFinderFilter((d) => received.push(d))
    off()

    expect(received).toHaveLength(1)
    expect("ageGroup" in received[0]).toBe(true)
    expect(received[0].ageGroup).toBeUndefined()
  })

  it("a hero-tile dispatch omits ageGroup entirely — the 'not mine' case", () => {
    dispatchFinderFilter({ key: "soccer", sectionId: "finder" })
    const received: FinderFilterDetail[] = []
    const off = onFinderFilter((d) => received.push(d))
    off()

    expect(received).toHaveLength(1)
    expect("ageGroup" in received[0]).toBe(false)
  })
})
