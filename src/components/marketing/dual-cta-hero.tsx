"use client"

import { useEffect, useState } from "react"
import { ArrowRight } from "lucide-react"
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon"
import type { OrganizationSiteAnnouncement } from "@/lib/db/schema/organizations"

/**
 * DualCtaHero — the homepage gateway, benefit-led.
 *
 * Full-bleed brand-graded photo (see docs/design-system.md "Graded imagery")
 * with the dual-audience fork as the primary action:
 *  - "For Kids"   → /youth/leagues (emerald)
 *  - "For Adults" → /adult/leagues (orange)
 *
 * No geographic chrome — Columbus/service-area copy is SEO-only (meta,
 * footer, /locations). The right column renders the "Next up" announcement
 * card when an active site banner is set; absent one the copy block spans
 * the full width.
 *
 * Note: the card markup is duplicated from next-up-card.astro (two render
 * contexts: Astro for hubs, React for this SSR+client:load hero). Consolidate
 * during the multi-brand theme refactor.
 */

interface DualCtaHeroProps {
  announcement?: OrganizationSiteAnnouncement
}

export function DualCtaHero({ announcement }: DualCtaHeroProps) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  useHydrationBeacon()

  return (
    <section className="graded relative text-cream pt-20 lg:pt-24">
      <img
        src="/images/stock/adult-match-night.jpg"
        alt=""
        aria-hidden="true"
        className="absolute inset-0"
        loading="eager"
      />
      <div className="graded-content max-w-[1400px] mx-auto px-6 sm:px-10 lg:px-16 pt-20 lg:pt-32 pb-16 lg:pb-24 flex flex-col lg:flex-row lg:items-end gap-10">
        <div className="flex-1 max-w-4xl">
          <h1
            className={`font-display transition-all duration-700 delay-100 ${
              mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
            }`}
            style={{
              fontSize: "clamp(2.75rem, 7vw, 6.5rem)",
              lineHeight: 0.98,
              letterSpacing: "-0.03em",
            }}
          >
            The best part of your week{" "}
            <span className="italic text-[#ffb38a]" style={{ fontWeight: 400 }}>
              happens here.
            </span>
          </h1>

          <p
            className={`mt-7 text-lg sm:text-xl text-cream/85 max-w-2xl leading-relaxed transition-all duration-700 delay-200 ${
              mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
            }`}
          >
            Soccer leagues, pickup, and youth programs where the game is the
            excuse and the people are the reason. Organized properly, so you
            just play.
          </p>

          <div
            className={`mt-10 flex flex-wrap items-center gap-4 transition-all duration-700 delay-300 ${
              mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
            }`}
          >
            <a
              href="/youth/leagues"
              data-landing-cta="homepage-hero-youth"
              className="group inline-flex items-center gap-3 bg-emerald-600 text-cream px-7 py-4 text-sm font-medium tracking-wide uppercase hover:bg-emerald-700 transition-colors duration-300"
              style={{ letterSpacing: "0.08em" }}
            >
              For Kids
              <ArrowRight className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-1" />
            </a>
            <a
              href="/adult/leagues"
              data-landing-cta="homepage-hero-adult"
              className="group inline-flex items-center gap-3 bg-primary text-cream px-7 py-4 text-sm font-medium tracking-wide uppercase hover:bg-primary/90 transition-colors duration-300"
              style={{ letterSpacing: "0.08em" }}
            >
              For Adults
              <ArrowRight className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-1" />
            </a>
          </div>
        </div>

        {announcement && (
          <div className="lg:pb-1">
            <div className="bg-paper px-4 py-3.5 shadow-[0_10px_28px_rgba(0,0,0,0.4)] max-w-xs">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-primary animate-pulse" aria-hidden="true" />
                <span className="text-[10px] font-bold tracking-[0.16em] uppercase text-primary">Next up</span>
              </div>
              <p className="font-display text-lg text-ink mt-1.5 leading-snug">{announcement.title}</p>
              {announcement.detail && (
                <p className="font-mono text-[11px] text-ink-muted mt-1.5 uppercase">{announcement.detail}</p>
              )}
              {announcement.linkUrl && (
                <a
                  href={announcement.linkUrl}
                  data-landing-cta="next-up-card"
                  className="block text-sm font-semibold text-primary mt-2.5 pt-2.5 border-t border-border hover:underline"
                >
                  {announcement.linkLabel || "Learn more"} →
                </a>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
