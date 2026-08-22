"use client"

import { useEffect, useRef, useState } from "react"
import { Plus, Minus } from "lucide-react"

/**
 * Props-driven FAQ accordion for category landing pages. Same interaction
 * idiom as the homepage FAQSection (src/components/faq-section.tsx) —
 * numbered paper cards, plus/minus toggle, animated height — with the copy
 * supplied per page instead of hardcoded, and no eyebrow text above the
 * headline (design-system rule).
 *
 * NO FAQPage JSON-LD here, deliberately — pages that want the rich result
 * emit it themselves via faqPageJsonLd (src/lib/seo/faq-jsonld.ts).
 *
 * Aspire-brand pages only — cream-idiom tokens invert under the SoccerOne
 * theme; do not import into SoccerOne-brand pages.
 */

export interface LandingFaqItem {
  question: string
  answer: string
  /** Optional trailing link rendered after the answer (e.g. refund policy). */
  linkHref?: string
  linkLabel?: string
}

/**
 * Open-item accent (#557, owner decision 2026-08-22): the accent follows the
 * page's audience — orange (brand primary) on adult surfaces, emerald on
 * youth ones, matching the emerald=youth / orange=adult token rule. Default
 * stays orange so every existing call site renders unchanged; youth pages
 * opt in with accent="emerald".
 */
export type LandingFaqAccent = "orange" | "emerald"

interface LandingFaqProps {
  /** Section anchor id — the facts band's "FAQs" link points here. */
  id: string
  heading: string
  items: LandingFaqItem[]
  accent?: LandingFaqAccent
}

interface AccentClasses {
  openBorder: string
  hoverBorder: string
  numOpen: string
  toggleOpen: string
  rule: string
}

const ACCENTS: Record<LandingFaqAccent, AccentClasses> = {
  orange: {
    openBorder: "border-primary/20",
    hoverBorder: "hover:border-primary/10",
    numOpen: "bg-primary text-cream",
    toggleOpen: "bg-primary/20 text-primary",
    rule: "bg-primary",
  },
  emerald: {
    openBorder: "border-emerald/20",
    hoverBorder: "hover:border-emerald/10",
    numOpen: "bg-emerald text-cream",
    toggleOpen: "bg-emerald/20 text-emerald",
    rule: "bg-emerald",
  },
}

export default function LandingFaq({ id, heading, items, accent = "orange" }: LandingFaqProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(0)

  return (
    <section id={id} className="scroll-mt-28 bg-cream-2 py-16 lg:py-24 border-t border-border">
      <div className="max-w-3xl mx-auto px-6 sm:px-9">
        <h2 className="font-display text-2xl lg:text-3xl text-ink">{heading}</h2>
        <div className="mt-8 space-y-3">
          {items.map((item, index) => (
            <FaqItem
              key={item.question}
              item={item}
              index={index}
              isOpen={openIndex === index}
              onToggle={() => setOpenIndex(openIndex === index ? null : index)}
              a={ACCENTS[accent]}
            />
          ))}
        </div>
        <p className="mt-10 text-ink-muted text-sm">
          Still have questions?{" "}
          <a
            href="mailto:hello@aspiresportsohio.com"
            className="text-primary font-medium underline underline-offset-4 decoration-primary/30 hover:decoration-primary/60 transition-colors"
          >
            Email us
          </a>
        </p>
      </div>
    </section>
  )
}

function FaqItem({
  item,
  index,
  isOpen,
  onToggle,
  a,
}: {
  item: LandingFaqItem
  index: number
  isOpen: boolean
  onToggle: () => void
  a: AccentClasses
}) {
  const contentRef = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState(0)

  useEffect(() => {
    if (contentRef.current) {
      setHeight(isOpen ? contentRef.current.scrollHeight : 0)
    }
  }, [isOpen])

  return (
    <div
      className={`relative rounded-xl border transition-all duration-300 ${
        isOpen
          ? `bg-paper ${a.openBorder}`
          : `bg-paper/50 border-border hover:bg-paper ${a.hoverBorder}`
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        className="w-full flex items-center gap-4 p-5 text-left group"
      >
        <span
          className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold transition-all duration-300 ${
            isOpen ? a.numOpen : "bg-cream-3 text-ink-muted"
          }`}
        >
          {String(index + 1).padStart(2, "0")}
        </span>
        <span
          className={`flex-1 font-medium text-base sm:text-lg transition-colors duration-300 ${
            isOpen ? "text-ink" : "text-ink-2 group-hover:text-ink"
          }`}
        >
          {item.question}
        </span>
        <span
          className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300 ${
            isOpen ? a.toggleOpen : "bg-cream-3 text-ink-muted"
          }`}
        >
          {isOpen ? <Minus className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
        </span>
      </button>
      <div className="overflow-hidden transition-all duration-300 ease-out" style={{ height }}>
        <div ref={contentRef} className="px-5 pb-5 pl-[4.25rem]">
          <p className="text-ink-muted leading-relaxed">{item.answer}</p>
          {item.linkHref && item.linkLabel && (
            <a
              href={item.linkHref}
              className="inline-block mt-2 text-sm font-medium text-primary hover:underline"
            >
              {item.linkLabel} →
            </a>
          )}
        </div>
      </div>
      <div
        className={`absolute left-0 top-4 bottom-4 w-[3px] rounded-full transition-all duration-300 ${a.rule} ${
          isOpen ? "opacity-100" : "opacity-0"
        }`}
      />
    </div>
  )
}
