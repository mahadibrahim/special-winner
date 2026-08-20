// The camp-family detail pages exist twice: as CAMP_TYPES registry entries
// (which create the routes) and as hand-listed sitemap URLs. A mismatch in
// either direction is a silent 404-in-sitemap or an invisible page.
import { describe, it, expect } from "vitest"
import { CAMP_TYPES } from "@/lib/youth/camp-page-content"
import { ASPIRE_SSR_PUBLIC_PAGES } from "@/lib/seo/aspire-sitemap-pages.mjs"

describe("camp registry ↔ sitemap sync", () => {
  const listed = (ASPIRE_SSR_PUBLIC_PAGES as string[]).filter((p) =>
    p.startsWith("/youth/camps/"),
  )

  it("every camp family is in the sitemap", () => {
    for (const t of CAMP_TYPES) expect(listed).toContain(`/youth/camps/${t.slug}`)
  })

  it("the sitemap lists no camp page without a registry entry", () => {
    const slugs = new Set(CAMP_TYPES.map((t) => `/youth/camps/${t.slug}`))
    for (const p of listed) expect(slugs.has(p), `${p} has no registry entry`).toBe(true)
  })
})
