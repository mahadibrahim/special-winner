"use client"

import { useEffect, useState } from "react"
import { ArrowRight } from "lucide-react"

/**
 * DualCtaHero — Unified People Model marketing surface.
 *
 * Surfaces both audiences equally with two primary CTAs:
 *  - "Register your child"  → /programs?audience=youth
 *  - "Register yourself"    → /programs?audience=adult
 *
 * Inherits all editorial cream conventions from the existing HeroSection:
 *  - Small-caps kicker label with rule line
 *  - Massive display serif headline (Newsreader) with italic orange accent
 *  - Lead paragraph at confident reading size
 *  - Asymmetric right-side pull-quote sidebar
 *  - Staggered CSS-transition reveal (no framer-motion)
 *  - Honest stats bar at the bottom
 */
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

export function DualCtaHero() {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  return (
    <section className="relative bg-cream text-ink pt-20 lg:pt-24">
      {/* Top rule — editorial section break */}
      <div className="max-w-[1400px] mx-auto px-6 sm:px-10 lg:px-16">
        <div className="flex items-center justify-between py-6 border-b border-ink/15">
          <span className="label-sm text-ink-muted">Powell, Ohio</span>
          <span className="label-sm text-ink-muted hidden sm:inline">
            Youth &amp; Adult Development
          </span>
          <span className="label-sm text-ink-muted">Est. 2015</span>
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
              Sports for kids.
              <br />
              Sports for{" "}
              <span
                className="italic text-primary-orange"
                style={{ fontWeight: 400 }}
              >
                adults.
              </span>
            </h1>

            <p
              className={`mt-10 text-lg sm:text-xl text-ink-2 max-w-xl leading-relaxed transition-all duration-700 delay-200 ${
                mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
              }`}
              style={{ letterSpacing: "-0.003em" }}
            >
              One platform. Programs at your local facility, registration in
              minutes, schedules on every device — whether you're enrolling a
              child or lacing up yourself.
            </p>

            {/* Dual CTAs */}
            <div
              className={`mt-10 flex flex-wrap items-center gap-6 transition-all duration-700 delay-300 ${
                mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
              }`}
            >
              <a
                href="/programs?audience=youth"
                className="group inline-flex items-center gap-3 bg-ink text-cream px-7 py-4 text-sm font-medium tracking-wide uppercase hover:bg-primary-orange transition-colors duration-300"
                style={{ letterSpacing: "0.08em" }}
              >
                Register your child
                <ArrowRight className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-1" />
              </a>
              <a
                href="/programs?audience=adult"
                className="group inline-flex items-center gap-3 border border-ink text-ink px-7 py-4 text-sm font-medium tracking-wide uppercase hover:border-primary-orange hover:text-primary-orange transition-colors duration-300"
                style={{ letterSpacing: "0.08em" }}
              >
                Register yourself
                <ArrowRight className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-1" />
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

            {/* Small stats panel */}
            <div
              className={`mt-12 lg:mt-0 pt-8 border-t border-ink/15 transition-all duration-700 delay-500 ${
                mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
              }`}
            >
              <div className="grid grid-cols-3 gap-4">
                <Stat label="Ages" value="4–60+" />
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
            ① Youth Programs   ·   ② Adult Programs   ·   ③ Curriculum
          </span>
          <span className="label-sm text-ink-faint hidden md:inline">
            Scroll ↓
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
