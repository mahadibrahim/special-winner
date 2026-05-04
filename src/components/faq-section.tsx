"use client"

import { useEffect, useRef, useState } from "react"
import { Plus, Minus } from "lucide-react"

const faqs = [
  {
    question: "Who can register?",
    answer: "Programs run for ages 3 through 18 (organized as U6, U8, U10, U12, U14, and high school divisions) and for adults 18+ in our community leagues.",
  },
  {
    question: "How does registration work?",
    answer: "Browse the catalog, pick a program, and complete the online checkout. Pay in full or put down a deposit to lock your spot — same flow whether you're enrolling a kid or signing up yourself.",
  },
  {
    question: "What if I (or my kid) am new to the game?",
    answer: "Most programs include a beginner pathway. Our coaches focus on fundamentals first — you don't need prior experience to join.",
  },
  {
    question: "What is your refund policy?",
    answer: "Full refunds up to 14 days before the season starts. After that, prorated refunds or credits toward future programs on a case-by-case basis.",
  },
  {
    question: "Do you provide equipment?",
    answer: "Basic equipment is provided for most programs. Players bring their own athletic shoes and apparel. Per-program specifics are listed on each program page.",
  },
  {
    question: "How are teams formed?",
    answer: "Balanced by age, skill level, and friend requests where possible. Adult leagues also support free-agent signups if you don't have a team yet.",
  },
]

export default function FAQSection() {
  const sectionRef = useRef<HTMLElement>(null)
  const [isVisible, setIsVisible] = useState(false)
  const [openIndex, setOpenIndex] = useState<number | null>(0)

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true)
          observer.disconnect()
        }
      },
      { threshold: 0.1 }
    )

    if (sectionRef.current) {
      observer.observe(sectionRef.current)
    }

    return () => observer.disconnect()
  }, [])

  const toggleItem = (index: number) => {
    setOpenIndex(openIndex === index ? null : index)
  }

  return (
    <section
      ref={sectionRef}
      className="relative py-24 lg:py-32 bg-cream-2 overflow-hidden"
    >
      {/* Background elements */}
      <div className="absolute inset-0 pointer-events-none">
        {/* Subtle dot pattern */}
        <div className="absolute inset-0 opacity-[0.06]">
          <svg className="w-full h-full">
            <defs>
              <pattern id="dotPattern" x="0" y="0" width="24" height="24" patternUnits="userSpaceOnUse">
                <circle cx="2" cy="2" r="1" fill="currentColor" className="text-ink-faint" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#dotPattern)" />
          </svg>
        </div>

        {/* Side glow */}
        <div
          className="absolute top-1/2 -left-32 w-64 h-[60vh] rounded-full opacity-[0.05] blur-[100px]"
          style={{ background: 'oklch(0.58 0.18 35)' }}
        />
      </div>

      <div className="relative container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto">
          {/* Section header */}
          <div className="text-center mb-12 lg:mb-16">
            <div
              className={`inline-flex items-center gap-3 mb-6 transition-all duration-700 ${
                isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
              }`}
            >
              <span className="text-[11px] font-semibold tracking-[0.15em] uppercase text-primary">
                Got Questions?
              </span>
            </div>

            <h2
              className={`text-3xl sm:text-4xl lg:text-5xl font-display font-bold text-ink mb-6 transition-all duration-700 delay-100 ${
                isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
              }`}
            >
              Frequently Asked{" "}
              <span
                style={{
                  background: 'linear-gradient(135deg, oklch(0.7 0.2 35), oklch(0.58 0.18 35))',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text'
                }}
              >
                Questions
              </span>
            </h2>

            <p
              className={`text-lg text-ink-muted transition-all duration-700 delay-200 ${
                isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
              }`}
            >
              Everything you need to know about our programs
            </p>
          </div>

          {/* FAQ accordion */}
          <div className="space-y-3">
            {faqs.map((faq, index) => (
              <FAQItem
                key={index}
                faq={faq}
                index={index}
                isOpen={openIndex === index}
                onToggle={() => toggleItem(index)}
                isVisible={isVisible}
              />
            ))}
          </div>

          {/* Contact CTA */}
          <div
            className={`mt-12 text-center transition-all duration-700 delay-700 ${
              isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
            }`}
          >
            <p className="text-ink-muted">
              Still have questions?{" "}
              <a
                href="mailto:hello@aspiresportsohio.com"
                className="text-primary hover:text-primary/80 font-medium underline underline-offset-4 decoration-primary/30 hover:decoration-primary/60 transition-colors"
              >
                Email us
              </a>
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}

interface FAQItemProps {
  faq: typeof faqs[0]
  index: number
  isOpen: boolean
  onToggle: () => void
  isVisible: boolean
}

function FAQItem({ faq, index, isOpen, onToggle, isVisible }: FAQItemProps) {
  const contentRef = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState(0)
  const delay = 300 + index * 50

  useEffect(() => {
    if (contentRef.current) {
      setHeight(isOpen ? contentRef.current.scrollHeight : 0)
    }
  }, [isOpen])

  return (
    <div
      className={`group transition-all duration-700 ${
        isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
      }`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      <div
        className={`relative rounded-xl border transition-all duration-300 ${
          isOpen
            ? 'bg-paper border-primary/20'
            : 'bg-paper/50 border-border hover:bg-paper hover:border-primary/10'
        }`}
      >
        {/* Question button */}
        <button
          onClick={onToggle}
          className="w-full flex items-center gap-4 p-5 sm:p-6 text-left"
        >
          {/* Number */}
          <span
            className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold transition-all duration-300 ${
              isOpen
                ? 'bg-primary text-cream'
                : 'bg-cream-3 text-ink-muted group-hover:text-ink-2'
            }`}
          >
            {String(index + 1).padStart(2, '0')}
          </span>

          {/* Question text */}
          <span
            className={`flex-1 font-medium text-base sm:text-lg transition-colors duration-300 ${
              isOpen ? 'text-ink' : 'text-ink-2 group-hover:text-ink'
            }`}
          >
            {faq.question}
          </span>

          {/* Toggle icon */}
          <span
            className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300 ${
              isOpen
                ? 'bg-primary/20 text-primary rotate-0'
                : 'bg-cream-3 text-ink-muted group-hover:bg-cream-3'
            }`}
          >
            {isOpen ? (
              <Minus className="w-4 h-4" />
            ) : (
              <Plus className="w-4 h-4" />
            )}
          </span>
        </button>

        {/* Answer content */}
        <div
          className="overflow-hidden transition-all duration-300 ease-out"
          style={{ height }}
        >
          <div ref={contentRef} className="px-5 sm:px-6 pb-5 sm:pb-6 pl-[4.25rem] sm:pl-[4.75rem]">
            <p className="text-ink-muted leading-relaxed">
              {faq.answer}
            </p>
          </div>
        </div>

        {/* Active indicator bar */}
        <div
          className={`absolute left-0 top-4 bottom-4 w-[3px] rounded-full bg-primary transition-all duration-300 ${
            isOpen ? 'opacity-100' : 'opacity-0'
          }`}
        />
      </div>
    </div>
  )
}
