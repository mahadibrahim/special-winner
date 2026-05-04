"use client"

import { useEffect, useState } from "react"
import { ArrowRight } from "lucide-react"

/**
 * HeroSection — Editorial redesign, cream foundation.
 *
 * Editorial conventions used:
 *  - Small-caps label above the headline (like a magazine kicker)
 *  - Rule lines bracket the hero as section breaks
 *  - Massive display serif headline with italic accent (Newsreader)
 *  - Lead paragraph in Plex Sans at a confident reading size
 *  - Asymmetric right-side pull quote block (like a magazine sidebar)
 *  - Two CTAs: one filled hot-spot, one bare link-style
 *  - Honest stats bar (ages, sports, philosophy) — not made-up vanity metrics
 *  - Staggered animation-delay reveal, no framer-motion, pure CSS
 */
export default function HeroSection() {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  return (
    <section className="relative bg-cream text-ink pt-20 lg:pt-24">
      {/* Top rule — editorial section break */}
      <div className="max-w-[1400px] mx-auto px-6 sm:px-10 lg:px-16">
        <div className="flex items-center justify-between py-6 border-b border-ink/15">
          <span className="label-sm text-ink-muted">
            Columbus, Ohio
          </span>
          <span className="label-sm text-ink-muted hidden sm:inline">
            Evidence-Based Youth Development
          </span>
          <span className="label-sm text-ink-muted">
            Est. 2015
          </span>
        </div>
      </div>

      {/* Hero body — asymmetric magazine grid */}
      <div className="max-w-[1400px] mx-auto px-6 sm:px-10 lg:px-16 pt-16 lg:pt-28 pb-20 lg:pb-32">
        <div className="grid grid-cols-12 gap-6 lg:gap-12">
          {/* Left — headline column (8/12) */}
          <div className="col-span-12 lg:col-span-8">
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
                fontSize: "clamp(3rem, 9vw, 8.5rem)",
                lineHeight: 0.92,
                letterSpacing: "-0.035em",
              }}
            >
              Youth sports,
              <br />
              done with
              <br />
              <span className="italic text-primary-orange" style={{ fontWeight: 400 }}>
                conviction.
              </span>
            </h1>

            <p
              className={`mt-10 text-lg sm:text-xl text-ink-2 max-w-xl leading-relaxed transition-all duration-700 delay-200 ${
                mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
              }`}
              style={{ letterSpacing: "-0.003em" }}
            >
              A development-first program for kids who want to fall in love with
              their sport — and a curriculum grounded in research, built by
              coaches who've earned the right to teach it.
            </p>

            <div
              className={`mt-10 flex flex-wrap items-center gap-6 transition-all duration-700 delay-300 ${
                mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
              }`}
            >
              <a
                href="#programs"
                className="group inline-flex items-center gap-3 bg-ink text-cream px-7 py-4 text-sm font-medium tracking-wide uppercase hover:bg-primary-orange transition-colors duration-300"
                style={{ letterSpacing: "0.08em" }}
              >
                Browse programs
                <ArrowRight className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-1" />
              </a>
              <a
                href="/guides"
                className="group inline-flex items-center gap-2 text-ink text-sm font-medium tracking-wide uppercase border-b border-ink hover:border-primary-orange hover:text-primary-orange transition-colors duration-300 pb-1"
                style={{ letterSpacing: "0.08em" }}
              >
                Read our philosophy
              </a>
            </div>
          </div>

          {/* Right — editorial pull-quote sidebar (4/12) */}
          <aside className="col-span-12 lg:col-span-4 lg:pl-10 lg:border-l lg:border-ink/15 flex flex-col justify-between">
            <div
              className={`transition-all duration-700 delay-400 ${
                mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
              }`}
            >
              <p className="label-sm text-ink-muted mb-4">
                From the Coaching Guide
              </p>
              <blockquote className="display text-ink text-2xl lg:text-3xl leading-[1.2] italic font-normal">
                "Talent is
                <br />
                <span className="text-primary-orange">developed</span>,
                <br />
                not discovered."
              </blockquote>
              <p className="mt-5 label-sm text-ink-muted">
                — Aspire Sports coaching philosophy
              </p>
            </div>

            {/* Small stats panel — honest content */}
            <div
              className={`mt-12 lg:mt-0 pt-8 border-t border-ink/15 transition-all duration-700 delay-500 ${
                mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
              }`}
            >
              <div className="grid grid-cols-3 gap-4">
                <Stat label="Ages" value="4–14" />
                <Stat label="Sports" value="Four" />
                <Stat label="Framework" value="TDEQ-5" />
              </div>
            </div>
          </aside>
        </div>
      </div>

      {/* Bottom rule + running footer */}
      <div className="max-w-[1400px] mx-auto px-6 sm:px-10 lg:px-16">
        <div className="flex items-center justify-between py-6 border-t border-ink/15">
          <span className="label-sm text-ink-muted">
            ① Programs   ·   ② Coaching   ·   ③ Curriculum
          </span>
          <span className="label-sm text-ink-faint hidden md:inline">
            Scroll ↓
          </span>
        </div>
      </div>

      {/* Optional subtle paper grain overlay for warmth */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.35] paper-grain"
        aria-hidden="true"
      />
    </section>
  )
}

interface StatProps {
  label: string
  value: string
}

function Stat({ label, value }: StatProps) {
  return (
    <div>
      <div className="label-sm text-ink-muted mb-1.5">{label}</div>
      <div
        className="display text-ink text-2xl lg:text-3xl"
        style={{ fontWeight: 500, letterSpacing: "-0.01em" }}
      >
        {value}
      </div>
    </div>
  )
}
