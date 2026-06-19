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
})
