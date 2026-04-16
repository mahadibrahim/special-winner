"use client"

import { useEffect, useRef, useState } from "react"
import { Star, Quote } from "lucide-react"

const testimonials = [
  {
    quote: "Aspire has been incredible for my son. He's gained so much confidence and made amazing friends. The coaches truly care about each child's development.",
    name: "Sarah M.",
    role: "Parent of U8 Soccer Player",
    initials: "SM",
    gradient: "from-rose-500 to-orange-500",
  },
  {
    quote: "We tried other leagues, but nothing compares to Aspire. The focus on sportsmanship and fun has made our daughter fall in love with basketball.",
    name: "Michael T.",
    role: "Parent of U10 Basketball Player",
    initials: "MT",
    gradient: "from-amber-500 to-yellow-500",
  },
  {
    quote: "The coaches at Aspire go above and beyond. My kids have learned so much about teamwork and perseverance. Worth every penny!",
    name: "Jennifer L.",
    role: "Parent of U6 & U8 Players",
    initials: "JL",
    gradient: "from-emerald-500 to-teal-500",
  },
]

export default function Testimonials() {
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
      {/* Background decorative elements */}
      <div className="absolute inset-0 pointer-events-none">
        {/* Large decorative quote marks */}
        <Quote
          className={`absolute top-12 left-[5%] w-32 h-32 lg:w-48 lg:h-48 text-primary/[0.06] transition-all duration-1000 ${
            isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-10'
          }`}
          strokeWidth={1}
        />
        <Quote
          className={`absolute bottom-12 right-[5%] w-24 h-24 lg:w-36 lg:h-36 text-primary/[0.06] rotate-180 transition-all duration-1000 delay-300 ${
            isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'
          }`}
          strokeWidth={1}
        />

        {/* Ambient glow */}
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[60vw] h-[40vh] rounded-full opacity-[0.04] blur-[120px]"
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
            <div className="flex gap-1">
              {[...Array(5)].map((_, i) => (
                <Star
                  key={i}
                  className="w-4 h-4 fill-primary text-primary"
                  style={{
                    animationDelay: `${i * 100}ms`,
                    animation: isVisible ? 'pulse 2s ease-in-out infinite' : 'none'
                  }}
                />
              ))}
            </div>
            <span className="text-[11px] font-semibold tracking-[0.15em] uppercase text-primary">
              4.9 Average Rating
            </span>
          </div>

          <h2
            className={`text-3xl sm:text-4xl lg:text-5xl font-display font-bold text-ink mb-6 transition-all duration-700 delay-100 ${
              isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
            }`}
          >
            Loved by{" "}
            <span
              style={{
                background: 'linear-gradient(135deg, oklch(0.7 0.2 35), oklch(0.58 0.18 35))',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text'
              }}
            >
              Families
            </span>
          </h2>

          <p
            className={`text-lg text-ink-muted max-w-2xl mx-auto transition-all duration-700 delay-200 ${
              isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
            }`}
          >
            Don't just take our word for it. Here's what parents are saying about
            their Aspire experience.
          </p>
        </div>

        {/* Testimonials grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8 max-w-6xl mx-auto">
          {testimonials.map((testimonial, index) => (
            <TestimonialCard
              key={testimonial.name}
              testimonial={testimonial}
              index={index}
              isVisible={isVisible}
            />
          ))}
        </div>

        {/* Trust indicator */}
        <div
          className={`mt-16 text-center transition-all duration-700 delay-700 ${
            isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
          }`}
        >
          <p className="text-ink-muted text-sm">
            Join <span className="text-ink font-semibold">1,000+</span> happy families in Central Ohio
          </p>
        </div>
      </div>

      {/* Inline keyframes */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }
      `}</style>
    </section>
  )
}

interface TestimonialCardProps {
  testimonial: typeof testimonials[0]
  index: number
  isVisible: boolean
}

function TestimonialCard({ testimonial, index, isVisible }: TestimonialCardProps) {
  const delay = 300 + index * 150
  const isMiddle = index === 1

  return (
    <div
      className={`group relative transition-all duration-700 ${
        isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'
      } ${isMiddle ? 'md:-translate-y-4' : ''}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {/* Card */}
      <div className="relative h-full">
        {/* Glass card */}
        <div className="relative h-full bg-paper border border-border rounded-2xl p-8 transition-all duration-500 hover:bg-cream-2 hover:border-primary/20 hover:shadow-2xl hover:shadow-primary/5">
          {/* Quote icon */}
          <div className="absolute -top-3 -left-1 w-8 h-8 rounded-full bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-lg shadow-primary/30">
            <Quote className="w-4 h-4 text-cream" strokeWidth={2.5} />
          </div>

          {/* Stars */}
          <div className="flex gap-1 mb-6">
            {[...Array(5)].map((_, i) => (
              <Star
                key={i}
                className="w-4 h-4 fill-primary text-primary transition-transform duration-300 hover:scale-125"
              />
            ))}
          </div>

          {/* Quote text */}
          <blockquote className="text-ink-2 leading-relaxed mb-8 text-[15px] group-hover:text-ink transition-colors">
            "{testimonial.quote}"
          </blockquote>

          {/* Author */}
          <div className="flex items-center gap-4">
            {/* Avatar */}
            <div
              className={`relative w-12 h-12 rounded-full bg-gradient-to-br ${testimonial.gradient} p-[2px] group-hover:scale-110 transition-transform duration-300`}
            >
              <div className="w-full h-full rounded-full bg-cream flex items-center justify-center">
                <span className="text-sm font-bold text-ink">{testimonial.initials}</span>
              </div>
              {/* Subtle glow on hover */}
              <div
                className={`absolute inset-0 rounded-full bg-gradient-to-br ${testimonial.gradient} blur-md opacity-0 group-hover:opacity-40 transition-opacity duration-300 -z-10`}
              />
            </div>

            {/* Name and role */}
            <div>
              <div className="font-semibold text-ink group-hover:text-primary transition-colors">
                {testimonial.name}
              </div>
              <div className="text-sm text-ink-muted">
                {testimonial.role}
              </div>
            </div>
          </div>

          {/* Decorative corner */}
          <div className="absolute bottom-0 right-0 w-20 h-20 overflow-hidden rounded-br-2xl">
            <div className="absolute bottom-0 right-0 w-32 h-32 bg-gradient-to-tl from-primary/10 to-transparent transform translate-x-8 translate-y-8 group-hover:translate-x-4 group-hover:translate-y-4 transition-transform duration-500" />
          </div>
        </div>
      </div>
    </div>
  )
}
