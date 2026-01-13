"use client"

import { useEffect, useRef, useState } from "react"
import { Handshake, ArrowRight, Star } from "lucide-react"

interface Partner {
  id: string
  name: string
  tier: "sponsor" | "community"
  logo: React.ReactNode
}

// Placeholder logo components - replace with real logos later
const LogoPlaceholder = ({ name, icon }: { name: string; icon: string }) => (
  <div className="flex items-center gap-2">
    <span className="text-2xl">{icon}</span>
    <span className="font-bold tracking-tight text-sm whitespace-nowrap">{name}</span>
  </div>
)

const partners: Partner[] = [
  // Sponsors
  {
    id: "nike",
    name: "Nike Community",
    tier: "sponsor",
    logo: <LogoPlaceholder name="NIKE" icon="✓" />,
  },
  {
    id: "under-armour",
    name: "Under Armour",
    tier: "sponsor",
    logo: <LogoPlaceholder name="UNDER ARMOUR" icon="◆" />,
  },
  {
    id: "sportsplex",
    name: "Columbus Sportsplex",
    tier: "sponsor",
    logo: <LogoPlaceholder name="SPORTSPLEX" icon="⬡" />,
  },
  {
    id: "ohio-youth",
    name: "Ohio Youth Athletics",
    tier: "sponsor",
    logo: <LogoPlaceholder name="OYA" icon="★" />,
  },
  // Community Partners
  {
    id: "powell-chamber",
    name: "Powell Chamber",
    tier: "community",
    logo: <LogoPlaceholder name="POWELL" icon="◎" />,
  },
  {
    id: "dublin-rec",
    name: "Dublin Recreation",
    tier: "community",
    logo: <LogoPlaceholder name="DUBLIN REC" icon="▲" />,
  },
  {
    id: "delaware-parks",
    name: "Delaware County Parks",
    tier: "community",
    logo: <LogoPlaceholder name="DC PARKS" icon="♦" />,
  },
  {
    id: "local-first",
    name: "Local First Columbus",
    tier: "community",
    logo: <LogoPlaceholder name="LOCAL FIRST" icon="●" />,
  },
]

interface PartnersSectionProps {
  mode?: "compact" | "expanded"
  className?: string
}

export default function PartnersSection({ mode = "compact", className = "" }: PartnersSectionProps) {
  const [isPaused, setIsPaused] = useState(false)

  if (mode === "expanded") {
    return <ExpandedPartners className={className} />
  }

  return (
    <section className={`relative py-16 overflow-hidden ${className}`}>
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#0a0a0f] via-[#0d0d12] to-[#0a0a0f]" />

      {/* Subtle top border */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

      <div className="relative">
        {/* Header */}
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 mb-10">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500/20 to-orange-600/20 border border-amber-500/20 flex items-center justify-center">
                  <Handshake className="w-4 h-4 text-amber-500" />
                </div>
                <span className="text-xs font-semibold text-amber-500/80 uppercase tracking-widest">
                  Our Partners
                </span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-bold text-white">
                Trusted by the Community
              </h2>
            </div>

            <a
              href="/partners"
              className="group inline-flex items-center gap-2 text-sm text-gray-400 hover:text-amber-500 transition-colors"
            >
              Become a Partner
              <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
            </a>
          </div>
        </div>

        {/* Marquee container */}
        <div
          className="relative"
          onMouseEnter={() => setIsPaused(true)}
          onMouseLeave={() => setIsPaused(false)}
        >
          {/* Gradient masks */}
          <div className="absolute left-0 top-0 bottom-0 w-32 bg-gradient-to-r from-[#0a0a0f] to-transparent z-10 pointer-events-none" />
          <div className="absolute right-0 top-0 bottom-0 w-32 bg-gradient-to-l from-[#0a0a0f] to-transparent z-10 pointer-events-none" />

          {/* Scrolling track */}
          <div className="flex overflow-hidden">
            <div
              className={`flex gap-6 ${isPaused ? "[animation-play-state:paused]" : ""}`}
              style={{
                animation: "marquee 40s linear infinite",
              }}
            >
              {/* Double the items for seamless loop */}
              {[...partners, ...partners].map((partner, index) => (
                <PartnerBadge key={`${partner.id}-${index}`} partner={partner} />
              ))}
            </div>
          </div>
        </div>

        {/* Trust indicators */}
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 mt-10">
          <div className="flex flex-wrap items-center justify-center gap-6 text-xs text-gray-500">
            <div className="flex items-center gap-2">
              <Star className="w-3.5 h-3.5 text-amber-500/60" />
              <span>10+ Years of Partnerships</span>
            </div>
            <div className="w-px h-4 bg-white/10 hidden sm:block" />
            <div className="flex items-center gap-2">
              <Star className="w-3.5 h-3.5 text-amber-500/60" />
              <span>Local & National Brands</span>
            </div>
            <div className="w-px h-4 bg-white/10 hidden sm:block" />
            <div className="flex items-center gap-2">
              <Star className="w-3.5 h-3.5 text-amber-500/60" />
              <span>Community Focused</span>
            </div>
          </div>
        </div>
      </div>

      {/* Keyframes */}
      <style>{`
        @keyframes marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</style>
    </section>
  )
}

function PartnerBadge({ partner }: { partner: Partner }) {
  return (
    <div
      className={`
        group relative flex-shrink-0 px-8 py-5 rounded-xl
        bg-gradient-to-b from-white/[0.04] to-transparent
        border border-white/[0.06] hover:border-amber-500/30
        transition-all duration-500 cursor-pointer
        hover:bg-white/[0.06]
      `}
    >
      {/* Glow effect on hover */}
      <div className="absolute inset-0 rounded-xl bg-gradient-to-b from-amber-500/0 to-amber-500/0 group-hover:from-amber-500/5 group-hover:to-transparent transition-all duration-500" />

      {/* Tier indicator */}
      {partner.tier === "sponsor" && (
        <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg shadow-amber-500/30">
          <Star className="w-2.5 h-2.5 text-white fill-white" />
        </div>
      )}

      {/* Logo container */}
      <div
        className={`
          relative text-gray-500 group-hover:text-white
          transition-all duration-500
          grayscale group-hover:grayscale-0
          opacity-60 group-hover:opacity-100
        `}
      >
        {partner.logo}
      </div>

      {/* Partner name tooltip */}
      <div
        className={`
          absolute -bottom-8 left-1/2 -translate-x-1/2
          px-2 py-1 rounded bg-white/10 backdrop-blur-sm
          text-[10px] text-gray-400 whitespace-nowrap
          opacity-0 group-hover:opacity-100 transition-opacity duration-300
          pointer-events-none
        `}
      >
        {partner.name}
      </div>
    </div>
  )
}

function ExpandedPartners({ className = "" }: { className?: string }) {
  const [isVisible, setIsVisible] = useState(false)
  const sectionRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true)
        }
      },
      { threshold: 0.1 }
    )

    if (sectionRef.current) {
      observer.observe(sectionRef.current)
    }

    return () => observer.disconnect()
  }, [])

  const sponsors = partners.filter((p) => p.tier === "sponsor")
  const community = partners.filter((p) => p.tier === "community")

  return (
    <section ref={sectionRef} className={`relative py-20 ${className}`}>
      {/* Background */}
      <div className="absolute inset-0 bg-[#0a0a0f]" />

      {/* Decorative elements */}
      <div className="absolute top-20 left-10 w-64 h-64 bg-amber-500/5 rounded-full blur-3xl" />
      <div className="absolute bottom-20 right-10 w-48 h-48 bg-orange-500/5 rounded-full blur-3xl" />

      <div className="relative container mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 mb-4">
            <div className="h-px w-8 bg-gradient-to-r from-transparent to-amber-500/50" />
            <span className="text-xs font-semibold text-amber-500 uppercase tracking-widest">
              Our Partners
            </span>
            <div className="h-px w-8 bg-gradient-to-l from-transparent to-amber-500/50" />
          </div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-4">
            Powered by Community
          </h2>
          <p className="text-gray-400 max-w-2xl mx-auto">
            We're proud to partner with local businesses and national brands who share our
            commitment to youth development through sports.
          </p>
        </div>

        {/* Sponsors Section */}
        <div className="mb-16">
          <div className="flex items-center gap-4 mb-8">
            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
              <Star className="w-5 h-5 text-amber-500 fill-amber-500" />
              Proud Sponsors
            </h3>
            <div className="flex-1 h-px bg-gradient-to-r from-amber-500/30 to-transparent" />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {sponsors.map((partner, index) => (
              <ExpandedPartnerCard
                key={partner.id}
                partner={partner}
                isVisible={isVisible}
                delay={index * 100}
              />
            ))}
          </div>
        </div>

        {/* Community Partners Section */}
        <div className="mb-16">
          <div className="flex items-center gap-4 mb-8">
            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
              <Handshake className="w-5 h-5 text-amber-500" />
              Community Partners
            </h3>
            <div className="flex-1 h-px bg-gradient-to-r from-amber-500/30 to-transparent" />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {community.map((partner, index) => (
              <ExpandedPartnerCard
                key={partner.id}
                partner={partner}
                isVisible={isVisible}
                delay={index * 100 + 400}
              />
            ))}
          </div>
        </div>

        {/* CTA */}
        <div
          className={`
            text-center p-8 rounded-2xl
            bg-gradient-to-br from-amber-500/10 via-orange-500/5 to-transparent
            border border-amber-500/20
            transition-all duration-700 delay-700
            ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}
          `}
        >
          <h3 className="text-xl font-bold text-white mb-2">
            Interested in Partnering?
          </h3>
          <p className="text-gray-400 text-sm mb-6 max-w-md mx-auto">
            Join our community of partners and help shape the future of youth sports in Central Ohio.
          </p>
          <a
            href="/contact?subject=partnership"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 text-white font-semibold hover:from-amber-400 hover:to-orange-400 transition-all shadow-lg shadow-amber-500/25 hover:shadow-amber-500/40 hover:scale-105"
          >
            Become a Partner
            <ArrowRight className="w-4 h-4" />
          </a>
        </div>
      </div>
    </section>
  )
}

function ExpandedPartnerCard({
  partner,
  isVisible,
  delay,
}: {
  partner: Partner
  isVisible: boolean
  delay: number
}) {
  return (
    <div
      className={`
        group relative p-6 rounded-xl
        bg-gradient-to-b from-white/[0.04] to-transparent
        border border-white/[0.08] hover:border-amber-500/40
        transition-all duration-500 cursor-pointer
        hover:bg-white/[0.06] hover:scale-[1.02]
        ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}
      `}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {/* Sponsor badge */}
      {partner.tier === "sponsor" && (
        <div className="absolute top-3 right-3">
          <div className="px-2 py-0.5 rounded-full bg-gradient-to-r from-amber-500/20 to-orange-500/20 border border-amber-500/30">
            <span className="text-[10px] font-semibold text-amber-500 uppercase tracking-wider">
              Sponsor
            </span>
          </div>
        </div>
      )}

      {/* Logo */}
      <div
        className={`
          mb-4 text-gray-400 group-hover:text-white
          transition-all duration-500
          grayscale group-hover:grayscale-0
          opacity-70 group-hover:opacity-100
          transform group-hover:scale-110
        `}
      >
        {partner.logo}
      </div>

      {/* Name */}
      <h4 className="font-semibold text-white text-sm">{partner.name}</h4>
      <p className="text-xs text-gray-500 capitalize">{partner.tier} Partner</p>

      {/* Hover glow */}
      <div className="absolute inset-0 rounded-xl bg-gradient-to-t from-amber-500/0 to-amber-500/0 group-hover:from-amber-500/5 group-hover:to-transparent transition-all duration-500 pointer-events-none" />
    </div>
  )
}
