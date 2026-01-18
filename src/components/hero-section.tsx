"use client"

import { useEffect, useState } from "react"
import { ArrowRight, Users, Trophy, Calendar, Star, ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function HeroSection() {
  const [isLoaded, setIsLoaded] = useState(false)

  useEffect(() => {
    setIsLoaded(true)
  }, [])

  return (
    <section className="relative min-h-[90vh] lg:min-h-screen overflow-hidden bg-[#0a0a0f]">
      {/* Animated gradient mesh background */}
      <div className="absolute inset-0">
        {/* Base gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#0a0a0f] via-[#0f0f18] to-[#1a0a05]" />

        {/* Warm glow from primary color */}
        <div
          className="absolute top-1/4 -right-1/4 w-[60vw] h-[60vw] rounded-full opacity-30 blur-[120px]"
          style={{ background: 'oklch(0.58 0.18 35)' }}
        />
        <div
          className="absolute -bottom-1/4 -left-1/4 w-[50vw] h-[50vw] rounded-full opacity-20 blur-[100px]"
          style={{ background: 'oklch(0.65 0.2 35)' }}
        />

        {/* Diagonal lines pattern */}
        <div className="absolute inset-0 opacity-[0.03]">
          <svg className="w-full h-full" preserveAspectRatio="none">
            <defs>
              <pattern id="diagonalLines" x="0" y="0" width="40" height="40" patternUnits="userSpaceOnUse">
                <line x1="0" y1="40" x2="40" y2="0" stroke="white" strokeWidth="1" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#diagonalLines)" />
          </svg>
        </div>

        {/* Animated diagonal accent stripes */}
        <div
          className={`absolute top-0 right-0 w-[150%] h-[200%] -translate-y-1/2 origin-top-right transition-transform duration-1000 ease-out ${
            isLoaded ? 'rotate-[-15deg] translate-x-0' : 'rotate-[-15deg] translate-x-full'
          }`}
        >
          <div className="absolute top-[30%] left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
          <div className="absolute top-[35%] left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-primary/20 to-transparent" />
          <div className="absolute top-[60%] left-0 w-full h-[3px] bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
          <div className="absolute top-[62%] left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-primary/15 to-transparent" />
        </div>

        {/* Floating geometric shapes */}
        <div
          className={`absolute top-20 right-[15%] w-20 h-20 border border-primary/20 rotate-45 transition-all duration-1000 delay-500 ${
            isLoaded ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-10'
          }`}
        />
        <div
          className={`absolute bottom-32 left-[10%] w-12 h-12 border border-primary/10 rotate-12 transition-all duration-1000 delay-700 ${
            isLoaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'
          }`}
        />
        <div
          className={`absolute top-1/3 left-[5%] w-2 h-2 bg-primary/40 rounded-full transition-all duration-1000 delay-300 ${
            isLoaded ? 'opacity-100 scale-100' : 'opacity-0 scale-0'
          }`}
        />
        <div
          className={`absolute bottom-1/4 right-[20%] w-3 h-3 bg-primary/30 rounded-full transition-all duration-1000 delay-600 ${
            isLoaded ? 'opacity-100 scale-100' : 'opacity-0 scale-0'
          }`}
        />
      </div>

      {/* Main content */}
      <div className="relative container mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-16 lg:pt-32 lg:pb-24 min-h-[90vh] lg:min-h-screen flex flex-col justify-center">
        <div className="max-w-4xl">
          {/* Eyebrow text */}
          <div
            className={`inline-flex items-center gap-2 mb-6 transition-all duration-700 ${
              isLoaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
            }`}
          >
            <div className="h-[1px] w-8 bg-primary" />
            <span className="text-primary font-medium tracking-widest text-sm uppercase">
              Central Ohio's Premier Youth Sports
            </span>
          </div>

          {/* Main headline */}
          <h1 className="mb-6">
            <span
              className={`block text-4xl sm:text-5xl lg:text-7xl font-bold text-white leading-[1.1] tracking-tight transition-all duration-700 delay-100 ${
                isLoaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
              }`}
            >
              Where Champions
            </span>
            <span
              className={`block text-4xl sm:text-5xl lg:text-7xl font-bold leading-[1.1] tracking-tight transition-all duration-700 delay-200 ${
                isLoaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
              }`}
              style={{
                background: 'linear-gradient(135deg, oklch(0.7 0.2 35), oklch(0.58 0.18 35), oklch(0.65 0.25 25))',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text'
              }}
            >
              Begin Their Journey
            </span>
          </h1>

          {/* Subheadline */}
          <p
            className={`text-lg sm:text-xl lg:text-2xl text-gray-400 max-w-2xl mb-10 leading-relaxed transition-all duration-700 delay-300 ${
              isLoaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
            }`}
          >
            More than just sports. We build confidence, character, and lifelong skills
            through expert-led programs designed for every skill level.
          </p>

          {/* CTA Buttons */}
          <div
            className={`flex flex-col sm:flex-row gap-4 mb-16 transition-all duration-700 delay-400 ${
              isLoaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
            }`}
          >
            <Button
              size="lg"
              className="group relative overflow-hidden px-8 py-6 text-lg font-semibold rounded-xl shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 transition-all duration-300"
            >
              <span className="relative z-10 flex items-center gap-2">
                Browse Programs
                <ArrowRight className="w-5 h-5 transition-transform duration-300 group-hover:translate-x-1" />
              </span>
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
            </Button>

            <Button
              size="lg"
              variant="outline"
              className="group border-2 border-white/20 hover:border-primary/50 bg-white/5 hover:bg-white/10 text-white px-8 py-6 text-lg font-semibold rounded-xl backdrop-blur-sm transition-all duration-300"
            >
              <span className="flex items-center gap-2">
                Learn More
                <ChevronDown className="w-5 h-5 transition-transform duration-300 group-hover:translate-y-1" />
              </span>
            </Button>
          </div>

          {/* Social Proof Badges */}
          <div
            className={`flex flex-wrap gap-3 sm:gap-4 transition-all duration-700 delay-500 ${
              isLoaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
            }`}
          >
            <SocialProofBadge
              icon={<Users className="w-4 h-4" />}
              value="1,000+"
              label="Families"
              delay={0}
            />
            <SocialProofBadge
              icon={<Trophy className="w-4 h-4" />}
              value="15"
              label="Sports"
              delay={100}
            />
            <SocialProofBadge
              icon={<Calendar className="w-4 h-4" />}
              value="10+"
              label="Years"
              delay={200}
            />
            <SocialProofBadge
              icon={<Star className="w-4 h-4" />}
              value="4.9"
              label="Rating"
              delay={300}
            />
          </div>
        </div>

        {/* Decorative side element - desktop only */}
        <div
          className={`hidden lg:block absolute right-8 xl:right-16 top-1/2 -translate-y-1/2 transition-all duration-1000 delay-700 ${
            isLoaded ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-20'
          }`}
        >
          <div className="relative">
            {/* Main circular element */}
            <div className="w-64 xl:w-80 h-64 xl:h-80 rounded-full border border-white/10 flex items-center justify-center relative">
              <div className="w-48 xl:w-60 h-48 xl:h-60 rounded-full border border-primary/20 flex items-center justify-center">
                <div className="w-32 xl:w-40 h-32 xl:h-40 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center backdrop-blur-sm">
                  <Trophy className="w-12 xl:w-16 h-12 xl:h-16 text-primary" />
                </div>
              </div>

              {/* Orbiting dots */}
              <div className="absolute inset-0 animate-[spin_20s_linear_infinite]">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 bg-primary rounded-full" />
              </div>
              <div className="absolute inset-0 animate-[spin_15s_linear_infinite_reverse]">
                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 w-2 h-2 bg-primary/60 rounded-full" />
              </div>
              <div className="absolute inset-0 animate-[spin_25s_linear_infinite]">
                <div className="absolute top-1/2 right-0 translate-x-1/2 -translate-y-1/2 w-2 h-2 bg-primary/40 rounded-full" />
              </div>
            </div>

            {/* Stats floating around */}
            <div className="absolute -top-4 -left-8 bg-white/5 backdrop-blur-md border border-white/10 rounded-xl px-4 py-3 animate-float">
              <div className="text-2xl font-bold text-white">98%</div>
              <div className="text-xs text-gray-400">Return Rate</div>
            </div>
            <div className="absolute -bottom-4 -right-8 bg-white/5 backdrop-blur-md border border-white/10 rounded-xl px-4 py-3 animate-float-delayed">
              <div className="text-2xl font-bold text-primary">50+</div>
              <div className="text-xs text-gray-400">Expert Coaches</div>
            </div>
          </div>
        </div>

        {/* Scroll indicator */}
        <div
          className={`absolute bottom-8 left-1/2 -translate-x-1/2 transition-all duration-700 delay-1000 ${
            isLoaded ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <div className="flex flex-col items-center gap-2 text-gray-500">
            <span className="text-xs tracking-widest uppercase">Scroll to explore</span>
            <div className="w-6 h-10 border-2 border-gray-600 rounded-full flex justify-center pt-2">
              <div className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce" />
            </div>
          </div>
        </div>
      </div>

      {/* Bottom gradient fade */}
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-background to-transparent pointer-events-none" />

      {/* Inline keyframes for custom animations */}
      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-10px); }
        }
        @keyframes float-delayed {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-8px); }
        }
        .animate-float {
          animation: float 4s ease-in-out infinite;
        }
        .animate-float-delayed {
          animation: float-delayed 4s ease-in-out infinite;
          animation-delay: 1s;
        }
      `}</style>
    </section>
  )
}

interface SocialProofBadgeProps {
  icon: React.ReactNode
  value: string
  label: string
  delay: number
}

function SocialProofBadge({ icon, value, label, delay }: SocialProofBadgeProps) {
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 600 + delay)
    return () => clearTimeout(timer)
  }, [delay])

  return (
    <div
      className={`group flex items-center gap-3 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-primary/30 rounded-full px-4 py-2.5 backdrop-blur-sm transition-all duration-500 cursor-default ${
        isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
      }`}
    >
      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/20 text-primary group-hover:bg-primary/30 transition-colors">
        {icon}
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-lg font-bold text-white">{value}</span>
        <span className="text-sm text-gray-400">{label}</span>
      </div>
    </div>
  )
}
