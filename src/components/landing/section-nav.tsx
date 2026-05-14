"use client"

import { track } from "@/lib/analytics/track"

export interface SectionNavItem {
  id: string
  label: string
  /** Optional leading glyph. Omitted for sections whose label stands alone
   *  (e.g. age bands), used for the adult finder's sport/format icons. */
  icon?: string
}

interface SectionNavProps {
  items: SectionNavItem[]
  active: string
}

/**
 * Slim sticky nav for the /adult finder. Sticks just below the global site
 * header on scroll; `active` (computed by the parent's scroll-spy) underlines
 * the section currently in view. Clicking smooth-scrolls to a section anchor.
 * On narrow screens it becomes a horizontally scrollable strip.
 */
export function SectionNav({ items, active }: SectionNavProps) {
  return (
    <nav
      className="sticky top-16 lg:top-20 z-30 bg-cream/95 backdrop-blur border-y border-border"
      aria-label="Adult program sections"
    >
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex gap-1 overflow-x-auto">
          {items.map((item) => {
            const isActive = active === item.id
            return (
              <a
                key={item.id}
                href={`#${item.id}`}
                aria-current={isActive ? "true" : undefined}
                onClick={() => track("adult_section_nav_click", { section: item.id })}
                className={`whitespace-nowrap px-4 py-3.5 text-sm font-medium border-b-2 transition-colors ${
                  isActive
                    ? "border-primary text-ink"
                    : "border-transparent text-ink-muted hover:text-ink"
                }`}
              >
                {item.icon && (
                  <span aria-hidden="true" className="mr-1.5">
                    {item.icon}
                  </span>
                )}
                {item.label}
              </a>
            )
          })}
        </div>
      </div>
    </nav>
  )
}
