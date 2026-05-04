"use client"

import { useEffect, useRef, useState } from "react"
import { BookOpen, Award, Users, TrendingUp } from "lucide-react"

const benefits = [
  {
    icon: BookOpen,
    title: "Built on real frameworks",
    description: "Programs grounded in published development research — Double-Goal Coach, ELM, TDEQ-5. Real methodology, not vibes.",
    accent: "from-rose-500/10 to-orange-500/10",
    iconBg: "from-rose-500 to-orange-500",
  },
  {
    icon: Award,
    title: "Coaches who played the game",
    description: "Not parent volunteers filling a clipboard. Coaches with playing résumés who've earned the right to teach it.",
    accent: "from-amber-500/10 to-yellow-500/10",
    iconBg: "from-amber-500 to-yellow-500",
  },
  {
    icon: Users,
    title: "Kids and adults, one home",
    description: "Same community, same standards. Sports don't end at 18 — your league and your kid's program live on the same platform.",
    accent: "from-emerald-500/10 to-teal-500/10",
    iconBg: "from-emerald-500 to-teal-500",
  },
  {
    icon: TrendingUp,
    title: "Programs that progress",
    description: "From first touches to adult competitive — designed as a pathway, not isolated classes. Players grow with us.",
    accent: "from-violet-500/10 to-purple-500/10",
    iconBg: "from-violet-500 to-purple-500",
  },
]

export default function WhyAspire() {
  const sectionRef = useRef<HTMLElement>(null)
  const [isVisible, setIsVisible] = useState(false)

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

  return (
    <section
      ref={sectionRef}
      className="relative py-24 lg:py-32 bg-cream overflow-hidden"
    >
      {/* Background elements */}
      <div className="absolute inset-0">
        {/* Subtle grid pattern */}
        <div className="absolute inset-0 opacity-[0.04]">
          <svg className="w-full h-full">
            <defs>
              <pattern id="grid" width="60" height="60" patternUnits="userSpaceOnUse">
                <path d="M 60 0 L 0 0 0 60" fill="none" stroke="currentColor" strokeWidth="1" className="text-ink-faint" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)" />
          </svg>
        </div>

        {/* Accent glow */}
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[80vw] h-[50vh] rounded-full opacity-[0.06] blur-[150px]"
          style={{ background: 'oklch(0.58 0.18 35)' }}
        />
      </div>

      <div className="relative container mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section header */}
        <div className="text-center mb-16 lg:mb-20">
          <div
            className={`inline-flex items-center gap-3 mb-6 transition-all duration-700 ${
              isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
            }`}
          >
            <div className="h-[1px] w-12 bg-gradient-to-r from-transparent to-primary" />
            <span className="text-[11px] font-semibold tracking-[0.15em] uppercase text-primary">
              Why Aspire
            </span>
            <div className="h-[1px] w-12 bg-gradient-to-l from-transparent to-primary" />
          </div>

          <h2
            className={`font-display text-3xl sm:text-4xl lg:text-5xl font-bold text-ink mb-6 transition-all duration-700 delay-100 ${
              isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
            }`}
          >
            Different by{" "}
            <span
              className="relative inline-block"
              style={{
                background: 'linear-gradient(135deg, oklch(0.7 0.2 35), oklch(0.58 0.18 35))',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text'
              }}
            >
              design
              <svg
                className="absolute -bottom-2 left-0 w-full"
                height="8"
                viewBox="0 0 100 8"
                preserveAspectRatio="none"
              >
                <path
                  d="M0 7 Q25 0, 50 4 T100 3"
                  fill="none"
                  stroke="oklch(0.58 0.18 35)"
                  strokeWidth="2"
                  strokeLinecap="round"
                  className={`transition-all duration-1000 delay-500 ${
                    isVisible ? 'opacity-100' : 'opacity-0'
                  }`}
                  style={{
                    strokeDasharray: 120,
                    strokeDashoffset: isVisible ? 0 : 120,
                    transition: 'stroke-dashoffset 1s ease-out 0.5s, opacity 0.3s'
                  }}
                />
              </svg>
            </span>
          </h2>

          <p
            className={`text-lg text-ink-muted max-w-2xl mx-auto transition-all duration-700 delay-200 ${
              isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
            }`}
          >
            We treat sports as a craft — for the U6 learning to dribble and the
            adult chasing a Saturday league title. The standards stay the same.
          </p>
        </div>

        {/* Benefits grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8 max-w-5xl mx-auto">
          {benefits.map((benefit, index) => (
            <BenefitCard
              key={benefit.title}
              benefit={benefit}
              index={index}
              isVisible={isVisible}
            />
          ))}
        </div>
      </div>
    </section>
  )
}

interface BenefitCardProps {
  benefit: typeof benefits[0]
  index: number
  isVisible: boolean
}

function BenefitCard({ benefit, index, isVisible }: BenefitCardProps) {
  const Icon = benefit.icon
  const delay = 300 + index * 100

  return (
    <div
      className={`group relative transition-all duration-700 ${
        isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
      }`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {/* Card */}
      <div className="relative h-full bg-paper hover:bg-cream-2 border border-border hover:border-primary/20 rounded-2xl p-8 transition-all duration-500 overflow-hidden shadow-sm hover:shadow-md">
        {/* Diagonal accent corner */}
        <div
          className={`absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl ${benefit.accent} opacity-0 group-hover:opacity-100 transition-opacity duration-500 -translate-x-16 -translate-y-16 rotate-45`}
        />

        {/* Corner line accent */}
        <div className="absolute top-0 right-0 w-16 h-[2px] bg-gradient-to-l from-primary/50 to-transparent opacity-0 group-hover:opacity-100 transition-all duration-500 group-hover:w-24" />
        <div className="absolute top-0 right-0 h-16 w-[2px] bg-gradient-to-b from-primary/50 to-transparent opacity-0 group-hover:opacity-100 transition-all duration-500 group-hover:h-24" />

        {/* Content */}
        <div className="relative">
          {/* Icon */}
          <div className="mb-6">
            <div className="relative inline-flex">
              {/* Glow effect */}
              <div
                className={`absolute inset-0 bg-gradient-to-br ${benefit.iconBg} rounded-xl blur-xl opacity-0 group-hover:opacity-20 transition-opacity duration-500 scale-150`}
              />

              {/* Icon container */}
              <div
                className={`relative w-14 h-14 rounded-xl bg-gradient-to-br ${benefit.iconBg} p-[1px] transform group-hover:scale-110 transition-transform duration-500`}
              >
                <div className="w-full h-full rounded-xl bg-paper flex items-center justify-center">
                  <Icon className="w-6 h-6 text-ink" />
                </div>
              </div>
            </div>
          </div>

          {/* Text */}
          <h3 className="font-display text-xl font-bold text-ink mb-3 group-hover:text-primary transition-colors duration-300">
            {benefit.title}
          </h3>
          <p className="text-ink-muted leading-relaxed group-hover:text-ink-2 transition-colors duration-300">
            {benefit.description}
          </p>
        </div>

        {/* Bottom border accent on hover */}
        <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-primary/50 to-transparent scale-x-0 group-hover:scale-x-100 transition-transform duration-500 origin-center" />
      </div>
    </div>
  )
}
