"use client"

import { ArrowRight } from "lucide-react"

/**
 * CTABanner — the homepage closer, as the Broadsheet orange band ("open on
 * ink, close on orange"). Replaces the v1 gradient flood (floating shapes,
 * sparkle badge, squiggle underline, wave curve — all retired with the
 * Editorial system). The same Youth/Adult gateway split as the hero, so the
 * page opens and closes on the same choice; the data-landing-cta hooks are
 * unchanged.
 */
export default function CTABanner() {
  return (
    <section className="band-orange px-6 sm:px-12 py-16 lg:py-20">
      <div className="max-w-[1080px] mx-auto flex flex-wrap items-center justify-between gap-8">
        <div className="flex flex-col gap-2.5">
          <h2 className="display-xl" style={{ fontSize: "clamp(2.5rem, 5vw, 4rem)" }}>
            Ready to get started?
          </h2>
          <p className="body-l font-medium text-ink max-w-[560px]" style={{ textWrap: "pretty" }}>
            Real programs, real coaches, real community — for the kid learning the game and the
            adult who never stopped playing.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <a
            href="/youth"
            data-landing-cta="homepage-cta-youth"
            className="btn btn--ink no-underline whitespace-nowrap !text-primary-bright hover:!text-ink group"
          >
            For Kids
            <ArrowRight className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-1" />
          </a>
          <a
            href="/adult"
            data-landing-cta="homepage-cta-adult"
            className="btn btn--outline no-underline whitespace-nowrap group"
          >
            For Adults
            <ArrowRight className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-1" />
          </a>
        </div>
      </div>
    </section>
  )
}
