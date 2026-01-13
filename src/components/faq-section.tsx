"use client"

import { useEffect, useRef, useState } from "react"
import { Plus, Minus } from "lucide-react"

const faqs = [
  {
    question: "What age groups do you offer programs for?",
    answer: "We offer programs for children ages 3-18, organized into age-appropriate groups like U6, U8, U10, U12, U14, and high school divisions. We also have adult leagues for ages 18+.",
  },
  {
    question: "How do I register my child for a program?",
    answer: "Simply browse our programs, select the one that fits your child, and complete the online registration. You can pay in full or put down a deposit to secure your spot.",
  },
  {
    question: "What if my child has never played before?",
    answer: "Perfect! Many of our programs are designed for beginners. Our coaches focus on fundamentals and making sports fun, so every child can learn and grow at their own pace.",
  },
  {
    question: "What is your refund policy?",
    answer: "We offer full refunds up to 14 days before the season starts. After that, we provide prorated refunds or credits toward future programs on a case-by-case basis.",
  },
  {
    question: "Do you provide equipment?",
    answer: "Basic equipment is provided for most programs. Players should bring appropriate athletic shoes and clothing. Specific requirements are listed on each program page.",
  },
  {
    question: "How are teams formed?",
    answer: "Teams are balanced based on age, skill level, and friend requests when possible. We aim to create competitive and fun experiences for all players.",
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
      className="relative py-24 lg:py-32 bg-[#0a0a0f] overflow-hidden"
    >
      {/* Background elements */}
      <div className="absolute inset-0 pointer-events-none">
        {/* Subtle dot pattern */}
        <div className="absolute inset-0 opacity-[0.02]">
          <svg className="w-full h-full">
            <defs>
              <pattern id="dotPattern" x="0" y="0" width="24" height="24" patternUnits="userSpaceOnUse">
                <circle cx="2" cy="2" r="1" fill="white" />
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
              <span className="text-primary font-medium tracking-widest text-sm uppercase">
                Got Questions?
              </span>
            </div>

            <h2
              className={`text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-6 transition-all duration-700 delay-100 ${
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
              className={`text-lg text-gray-400 transition-all duration-700 delay-200 ${
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
            <p className="text-gray-500">
              Still have questions?{" "}
              <a
                href="/contact"
                className="text-primary hover:text-primary/80 font-medium underline underline-offset-4 decoration-primary/30 hover:decoration-primary/60 transition-colors"
              >
                Contact us
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
            ? 'bg-white/[0.03] border-primary/20'
            : 'bg-white/[0.01] border-white/[0.05] hover:bg-white/[0.02] hover:border-white/[0.08]'
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
                ? 'bg-primary text-primary-foreground'
                : 'bg-white/[0.05] text-gray-500 group-hover:text-gray-400'
            }`}
          >
            {String(index + 1).padStart(2, '0')}
          </span>

          {/* Question text */}
          <span
            className={`flex-1 font-medium text-base sm:text-lg transition-colors duration-300 ${
              isOpen ? 'text-white' : 'text-gray-300 group-hover:text-white'
            }`}
          >
            {faq.question}
          </span>

          {/* Toggle icon */}
          <span
            className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300 ${
              isOpen
                ? 'bg-primary/20 text-primary rotate-0'
                : 'bg-white/[0.05] text-gray-500 group-hover:bg-white/[0.08]'
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
            <p className="text-gray-400 leading-relaxed">
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
