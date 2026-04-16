"use client"

import { useEffect, useRef, useState } from "react"
import { Users, Trophy, Clock, TrendingUp } from "lucide-react"

const stats = [
  {
    value: 1000,
    suffix: "+",
    label: "Families Served",
    icon: Users,
  },
  {
    value: 15,
    suffix: "",
    label: "Different Sports",
    icon: Trophy,
  },
  {
    value: 10,
    suffix: "+",
    label: "Years Experience",
    icon: Clock,
  },
  {
    value: 98,
    suffix: "%",
    label: "Return Rate",
    icon: TrendingUp,
  },
]

function useCountUp(end: number, duration: number = 2000, start: boolean = false) {
  const [count, setCount] = useState(0)

  useEffect(() => {
    if (!start) return

    let startTime: number | null = null
    let animationFrame: number

    const animate = (timestamp: number) => {
      if (!startTime) startTime = timestamp
      const progress = Math.min((timestamp - startTime) / duration, 1)

      // Ease out cubic for smooth deceleration
      const easeOut = 1 - Math.pow(1 - progress, 3)
      setCount(Math.floor(easeOut * end))

      if (progress < 1) {
        animationFrame = requestAnimationFrame(animate)
      }
    }

    animationFrame = requestAnimationFrame(animate)

    return () => cancelAnimationFrame(animationFrame)
  }, [end, duration, start])

  return count
}

export default function StatsSection() {
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
      { threshold: 0.3 }
    )

    if (sectionRef.current) {
      observer.observe(sectionRef.current)
    }

    return () => observer.disconnect()
  }, [])

  return (
    <section
      ref={sectionRef}
      className="relative py-20 lg:py-24 overflow-hidden"
    >
      {/* Background */}
      <div className="absolute inset-0 bg-cream-2">
        {/* Gradient accent bar at top */}
        <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-primary/20 to-transparent" />

        {/* Subtle noise texture */}
        <div
          className="absolute inset-0 opacity-[0.02]"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
          }}
        />

        {/* Radial glow in center */}
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-4xl h-32 rounded-full opacity-[0.04] blur-[80px]"
          style={{ background: 'oklch(0.58 0.18 35)' }}
        />

        {/* Gradient accent bar at bottom */}
        <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-primary/20 to-transparent" />
      </div>

      <div className="relative container mx-auto px-4 sm:px-6 lg:px-8">
        {/* Stats grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-4">
          {stats.map((stat, index) => (
            <StatItem
              key={stat.label}
              stat={stat}
              index={index}
              isVisible={isVisible}
              isLast={index === stats.length - 1}
            />
          ))}
        </div>
      </div>
    </section>
  )
}

interface StatItemProps {
  stat: typeof stats[0]
  index: number
  isVisible: boolean
  isLast: boolean
}

function StatItem({ stat, index, isVisible, isLast }: StatItemProps) {
  const count = useCountUp(stat.value, 2000 + index * 200, isVisible)
  const Icon = stat.icon
  const delay = index * 100

  return (
    <div
      className={`relative group transition-all duration-700 ${
        isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
      }`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {/* Content */}
      <div className="relative text-center lg:text-left lg:flex lg:items-center lg:justify-center lg:gap-6 py-4 lg:py-0">
        {/* Icon - hidden on mobile, shown on desktop */}
        <div className="hidden lg:flex items-center justify-center w-14 h-14 rounded-2xl bg-cream-3 border border-border group-hover:border-primary/30 group-hover:bg-primary/5 transition-all duration-300">
          <Icon className="w-6 h-6 text-primary/70 group-hover:text-primary transition-colors" />
        </div>

        {/* Number and label */}
        <div>
          {/* Number */}
          <div className="relative">
            <span
              className="font-display text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-ink"
            >
              {count.toLocaleString()}
              {stat.suffix}
            </span>

            {/* Subtle glow behind number on hover */}
            <div
              className="absolute inset-0 blur-2xl opacity-0 group-hover:opacity-10 transition-opacity duration-500 -z-10"
              style={{ background: 'oklch(0.58 0.18 35)' }}
            />
          </div>

          {/* Label */}
          <p className="mt-2 text-sm sm:text-base text-ink-muted group-hover:text-ink-2 transition-colors font-medium tracking-wide">
            {stat.label}
          </p>
        </div>
      </div>

      {/* Vertical divider - desktop only, not on last item */}
      {!isLast && (
        <div className="hidden lg:block absolute right-0 top-1/2 -translate-y-1/2 w-[1px] h-16 bg-gradient-to-b from-transparent via-border to-transparent" />
      )}

      {/* Horizontal divider - mobile only, not on last row */}
      {index < 2 && (
        <div className="lg:hidden absolute bottom-0 left-1/2 -translate-x-1/2 w-16 h-[1px] bg-gradient-to-r from-transparent via-border to-transparent" />
      )}
    </div>
  )
}
