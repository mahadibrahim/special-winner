import { describe, it, expect, vi, afterEach, beforeAll } from "vitest"
import { dispatchFinderFilter, onFinderFilter, type FinderFilterDetail } from "@/lib/landing/finder-filter"

// finder-filter.ts uses window/document APIs. Provide minimal stubs so the
// module can be exercised in the Node/Vitest environment without jsdom.
beforeAll(() => {
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

  it("location is optional (existing two-field callers still type-check)", () => {
    const d: FinderFilterDetail = { key: "soccer", sectionId: "sessions" }
    expect(d.location).toBeUndefined()
  })
})
