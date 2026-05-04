"use client"

import { useEffect, useState } from "react"
import { ArrowRight } from "lucide-react"

/**
 * DualCtaHero — conversion-first hero for a dual-audience platform.
 *
 * Two clear paths in the hero so the visitor self-segments in one glance:
 *  - "Browse youth programs"  → /programs?audience=youth
 *  - "Browse adult leagues"   → /programs?audience=adult
 *
 * Brand-neutral framing — no specific venues or sports in the headline.
 * The current offering (soccer in central Ohio) lives in the kicker line.
 */
export function DualCtaHero() {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  return (
    <section className="relative bg-cream text-ink pt-20 lg:pt-24">
      {/* Top rule — section break */}
      <div className="max-w-[1400px] mx-auto px-6 sm:px-10 lg:px-16">
        <div className="flex items-center justify-between py-6 border-b border-ink/15">
          <span className="label-sm text-ink-muted">Central Ohio</span>
          <span className="label-sm text-ink-muted hidden sm:inline">
            Youth &amp; Adult Programs
          </span>
          <span className="label-sm text-ink-muted">Est. 2015</span>
        </div>
      </div>

      {/* Hero body */}
      <div className="max-w-[1400px] mx-auto px-6 sm:px-10 lg:px-16 pt-16 lg:pt-24 pb-16 lg:pb-24">
        <div className="max-w-4xl">
          <p
            className={`label-sm text-primary-orange mb-8 flex items-center gap-3 transition-all duration-700 ${
              mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"
            }`}
          >
            <span className="inline-block w-8 h-px bg-primary-orange" />
            Now enrolling · Summer 2026
          </p>

          <h1
            className={`display text-ink transition-all duration-700 delay-100 ${
              mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
            }`}
            style={{
              fontSize: "clamp(2.75rem, 8vw, 7.5rem)",
              lineHeight: 0.95,
              letterSpacing: "-0.035em",
            }}
          >
            Sports done with{" "}
            <span
              className="italic text-primary-orange"
              style={{ fontWeight: 400 }}
            >
              conviction.
            </span>
            <br />
            For kids. For adults.
          </h1>

          <p
            className={`mt-8 text-lg sm:text-xl text-ink-2 max-w-2xl leading-relaxed transition-all duration-700 delay-200 ${
              mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
            }`}
            style={{ letterSpacing: "-0.003em" }}
          >
            Real programs, real coaches, real community — for the kid learning
            the game and the adult who never stopped playing.
          </p>

          {/* Dual CTAs */}
          <div
            className={`mt-10 flex flex-wrap items-center gap-4 transition-all duration-700 delay-300 ${
              mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
            }`}
          >
            <a
              href="/programs?audience=youth"
              className="group inline-flex items-center gap-3 bg-ink text-cream px-7 py-4 text-sm font-medium tracking-wide uppercase hover:bg-primary-orange transition-colors duration-300"
              style={{ letterSpacing: "0.08em" }}
            >
              Browse youth programs
              <ArrowRight className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-1" />
            </a>
            <a
              href="/programs?audience=adult"
              className="group inline-flex items-center gap-3 border border-ink text-ink px-7 py-4 text-sm font-medium tracking-wide uppercase hover:border-primary-orange hover:text-primary-orange transition-colors duration-300"
              style={{ letterSpacing: "0.08em" }}
            >
              Browse adult leagues
              <ArrowRight className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-1" />
            </a>
          </div>
        </div>
      </div>

      {/* Bottom rule */}
      <div className="max-w-[1400px] mx-auto px-6 sm:px-10 lg:px-16">
        <div className="flex items-center justify-between py-6 border-t border-ink/15">
          <span className="label-sm text-ink-muted">
            Programs below ↓
          </span>
          <span className="label-sm text-ink-faint hidden md:inline">
            Aspire Sports
          </span>
        </div>
      </div>

      {/* Subtle paper grain overlay for warmth */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.35] paper-grain"
        aria-hidden="true"
      />
    </section>
  )
}
