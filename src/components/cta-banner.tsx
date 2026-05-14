"use client"

import { useEffect, useRef, useState } from "react"
import { ArrowRight, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function CTABanner() {
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
      { threshold: 0.2 }
    )

    if (sectionRef.current) {
      observer.observe(sectionRef.current)
    }

    return () => observer.disconnect()
  }, [])

  return (
    <section
      ref={sectionRef}
      className="relative py-24 lg:py-32 overflow-hidden"
    >
      {/* Gradient background */}
      <div className="absolute inset-0">
        <div
          className="absolute inset-0"
          style={{
            background: 'linear-gradient(135deg, oklch(0.55 0.18 35) 0%, oklch(0.5 0.2 30) 50%, oklch(0.45 0.22 25) 100%)',
          }}
        />

        {/* Animated gradient overlay */}
        <div
          className="absolute inset-0 opacity-30"
          style={{
            background: 'radial-gradient(ellipse at 30% 20%, oklch(0.7 0.15 40) 0%, transparent 50%)',
          }}
        />
        <div
          className="absolute inset-0 opacity-20"
          style={{
            background: 'radial-gradient(ellipse at 70% 80%, oklch(0.6 0.2 20) 0%, transparent 50%)',
          }}
        />

        {/* Noise texture overlay */}
        <div
          className="absolute inset-0 opacity-[0.08] mix-blend-overlay"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
          }}
        />

        {/* Floating shapes */}
        <div className="absolute inset-0 overflow-hidden">
          {/* Large circle */}
          <div
            className={`absolute -top-20 -right-20 w-64 h-64 rounded-full border-2 border-cream/10 transition-all duration-1000 ${
              isVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-50'
            }`}
            style={{ animationDelay: '200ms' }}
          />

          {/* Smaller circles */}
          <div
            className={`absolute top-1/4 left-[10%] w-4 h-4 rounded-full bg-cream/20 transition-all duration-1000 delay-300 ${
              isVisible ? 'opacity-100' : 'opacity-0'
            }`}
            style={{ animation: isVisible ? 'float 4s ease-in-out infinite' : 'none' }}
          />
          <div
            className={`absolute bottom-1/3 right-[15%] w-6 h-6 rounded-full bg-cream/15 transition-all duration-1000 delay-500 ${
              isVisible ? 'opacity-100' : 'opacity-0'
            }`}
            style={{ animation: isVisible ? 'float 5s ease-in-out infinite 1s' : 'none' }}
          />
          <div
            className={`absolute top-1/2 left-[20%] w-3 h-3 rounded-full bg-cream/25 transition-all duration-1000 delay-700 ${
              isVisible ? 'opacity-100' : 'opacity-0'
            }`}
            style={{ animation: isVisible ? 'float 3.5s ease-in-out infinite 0.5s' : 'none' }}
          />

          {/* Geometric shapes */}
          <div
            className={`absolute bottom-20 left-[5%] w-16 h-16 border border-cream/10 rotate-45 transition-all duration-1000 delay-400 ${
              isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'
            }`}
          />
          <div
            className={`absolute top-16 right-[25%] w-8 h-8 border border-cream/15 rotate-12 transition-all duration-1000 delay-600 ${
              isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-10'
            }`}
          />

          {/* Diagonal lines */}
          <div className="absolute top-0 left-0 w-full h-full">
            <div
              className={`absolute top-[20%] left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-cream/10 to-transparent -rotate-3 transition-all duration-1000 ${
                isVisible ? 'opacity-100' : 'opacity-0'
              }`}
            />
            <div
              className={`absolute bottom-[30%] left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-cream/5 to-transparent rotate-2 transition-all duration-1000 delay-200 ${
                isVisible ? 'opacity-100' : 'opacity-0'
              }`}
            />
          </div>
        </div>
      </div>

      <div className="relative container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto text-center">
          {/* Sparkle badge */}
          <div
            className={`inline-flex items-center gap-2 mb-6 px-4 py-2 rounded-full bg-cream/10 backdrop-blur-sm border border-cream/20 transition-all duration-700 ${
              isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
            }`}
          >
            <Sparkles className="w-4 h-4 text-cream" />
            <span className="text-cream/90 text-sm font-medium">Registration is open</span>
          </div>

          {/* Headline */}
          <h2
            className={`font-display text-4xl sm:text-5xl lg:text-6xl font-bold text-cream mb-6 leading-tight transition-all duration-700 delay-100 ${
              isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
            }`}
          >
            Ready to Get{" "}
            <span className="relative inline-block">
              Started?
              {/* Underline decoration */}
              <svg
                className="absolute -bottom-2 left-0 w-full"
                height="12"
                viewBox="0 0 200 12"
                preserveAspectRatio="none"
              >
                <path
                  d="M0 8 Q50 2, 100 6 T200 4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  className={`text-cream transition-all duration-1000 delay-500`}
                  style={{
                    strokeDasharray: 250,
                    strokeDashoffset: isVisible ? 0 : 250,
                    opacity: 0.4,
                  }}
                />
              </svg>
            </span>
          </h2>

          {/* Subtext */}
          <p
            className={`text-lg sm:text-xl text-cream/80 mb-10 max-w-xl mx-auto transition-all duration-700 delay-200 ${
              isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
            }`}
          >
            Real programs, real coaches, real community — for the kid learning
            the game and the adult who never stopped playing.
          </p>

          {/* CTA buttons */}
          <div
            className={`flex flex-col sm:flex-row items-center justify-center gap-4 transition-all duration-700 delay-300 ${
              isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
            }`}
          >
            <Button
              size="lg"
              className="group relative overflow-hidden bg-cream hover:bg-cream/95 text-ink px-8 py-6 text-lg font-bold rounded-xl shadow-2xl shadow-navy-deep/20 hover:shadow-navy-deep/30 transition-all duration-300 hover:scale-105"
            >
              <span className="relative z-10 flex items-center gap-2">
                Browse Programs
                <ArrowRight className="w-5 h-5 transition-transform duration-300 group-hover:translate-x-1" />
              </span>
              {/* Shine effect */}
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-primary/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
            </Button>

            <a
              href="mailto:hello@aspiresportsohio.com"
              className="group flex items-center gap-2 text-cream font-medium px-6 py-3 rounded-xl hover:bg-cream/10 transition-all duration-300"
            >
              Email Us
              <span className="w-6 h-6 rounded-full border border-cream/30 flex items-center justify-center group-hover:bg-cream/10 transition-colors">
                <ArrowRight className="w-3 h-3 transition-transform duration-300 group-hover:translate-x-0.5" />
              </span>
            </a>
          </div>
        </div>
      </div>

      {/* Bottom wave/curve */}
      <div className="absolute bottom-0 left-0 right-0">
        <svg
          viewBox="0 0 1440 60"
          className="w-full h-12 sm:h-16"
          preserveAspectRatio="none"
        >
          <path
            d="M0,40 C480,80 960,0 1440,40 L1440,60 L0,60 Z"
            className="fill-cream"
          />
        </svg>
      </div>

      {/* Inline keyframes */}
      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-15px); }
        }
      `}</style>
    </section>
  )
}
