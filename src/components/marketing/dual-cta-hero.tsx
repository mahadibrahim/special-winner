"use client"

import { useEffect, useState } from "react"
import { ArrowRight } from "lucide-react"

/**
 * DualCtaHero — the homepage's showpiece gateway.
 *
 * An editorial brand moment with the dual-audience choice as the primary
 * action. Two clear paths so the visitor self-segments in one glance:
 *  - "For your kid"  → /youth   (the youth finder)
 *  - "For yourself"  → /adult   (the adult finder)
 *
 * The audience colors mirror the finders themselves — emerald for youth,
 * ink for adult — so the gateway and its destinations feel of a piece.
 * Brand-neutral framing; the current offering lives on the finder pages.
 */
export function DualCtaHero() {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  return (
    <section className="relative bg-cream text-ink pt-20 lg:pt-24">
      {/* Hero body */}
      <div className="max-w-[1400px] mx-auto px-6 sm:px-10 lg:px-16 pt-16 lg:pt-24 pb-16 lg:pb-24">
        <div className="max-w-4xl">
          <p
            className={`label-sm text-primary-orange mb-8 flex items-center gap-3 transition-all duration-700 ${
              mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"
            }`}
          >
            <span className="inline-block w-8 h-px bg-primary-orange" />
            Aspire Sports · Central Ohio
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
          </h1>

          <p
            className={`mt-8 text-lg sm:text-xl text-ink-2 max-w-2xl leading-relaxed transition-all duration-700 delay-200 ${
              mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
            }`}
            style={{ letterSpacing: "-0.003em" }}
          >
            Real coaches, real development — for the kid learning the game and
            the adult who never stopped playing.
          </p>

          {/* Dual CTAs — the gateway. Emerald for youth, ink for adult,
              matching the finders they lead to. */}
          <div
            className={`mt-10 flex flex-wrap items-center gap-4 transition-all duration-700 delay-300 ${
              mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
            }`}
          >
            <a
              href="/youth"
              data-landing-cta="homepage-hero-youth"
              className="group inline-flex items-center gap-3 bg-emerald-600 text-cream px-7 py-4 text-sm font-medium tracking-wide uppercase hover:bg-emerald-700 transition-colors duration-300"
              style={{ letterSpacing: "0.08em" }}
            >
              For your kid
              <ArrowRight className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-1" />
            </a>
            <a
              href="/adult"
              data-landing-cta="homepage-hero-adult"
              className="group inline-flex items-center gap-3 bg-ink text-cream px-7 py-4 text-sm font-medium tracking-wide uppercase hover:bg-primary-orange transition-colors duration-300"
              style={{ letterSpacing: "0.08em" }}
            >
              For yourself
              <ArrowRight className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-1" />
            </a>
          </div>
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
