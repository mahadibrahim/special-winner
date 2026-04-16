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
    <section className={`relative py-16 overflow-hidden bg-cream ${className}`}>
      {/* Subtle top border */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-border to-transparent" />

      <div className="relative">
        {/* Header */}
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 mb-10">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 mb-3">
                <Handshake className="w-4 h-4 text-primary" />
                <span className="text-[11px] font-semibold tracking-[0.15em] uppercase text-primary">
                  Our Partners
                </span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-display font-bold text-ink">
                Trusted by the Community
              </h2>
            </div>

            <a
              href="/partners"
              className="group inline-flex items-center gap-2 text-sm text-ink-muted hover:text-primary transition-colors"
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
          <div className="absolute left-0 top-0 bottom-0 w-32 bg-gradient-to-r from-cream to-transparent z-10 pointer-events-none" />
          <div className="absolute right-0 top-0 bottom-0 w-32 bg-gradient-to-l from-cream to-transparent z-10 pointer-events-none" />

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
          <div className="flex flex-wrap items-center justify-center gap-6 text-xs text-ink-muted">
            <div className="flex items-center gap-2">
              <Star className="w-3.5 h-3.5 text-primary/60" />
              <span>10+ Years of Partnerships</span>
            </div>
            <div className="w-px h-4 bg-border hidden sm:block" />
            <div className="flex items-center gap-2">
              <Star className="w-3.5 h-3.5 text-primary/60" />
              <span>Local & National Brands</span>
            </div>
            <div className="w-px h-4 bg-border hidden sm:block" />
            <div className="flex items-center gap-2">
              <Star className="w-3.5 h-3.5 text-primary/60" />
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
        bg-paper
        border border-border hover:border-primary/30
        transition-all duration-500 cursor-pointer
        hover:bg-cream-2
      `}
    >
      {/* Subtle highlight on hover */}
      <div className="absolute inset-0 rounded-xl bg-gradient-to-b from-primary/0 to-primary/0 group-hover:from-primary/5 group-hover:to-transparent transition-all duration-500" />

      {/* Tier indicator */}
      {partner.tier === "sponsor" && (
        <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-lg shadow-primary/30">
          <Star className="w-2.5 h-2.5 text-cream fill-cream" />
        </div>
      )}

      {/* Logo container */}
      <div
        className={`
          relative text-ink-muted group-hover:text-ink
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
          px-2 py-1 rounded bg-cream-3 border border-border
          text-[10px] text-ink-muted whitespace-nowrap
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
    <section ref={sectionRef} className={`relative py-20 bg-cream-2 ${className}`}>
      {/* Decorative elements */}
      <div className="absolute top-20 left-10 w-64 h-64 bg-primary/5 rounded-full blur-3xl" />
      <div className="absolute bottom-20 right-10 w-48 h-48 bg-primary/3 rounded-full blur-3xl" />

      <div className="relative container mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 mb-4">
            <div className="h-px w-8 bg-gradient-to-r from-transparent to-primary/50" />
            <span className="text-[11px] font-semibold tracking-[0.15em] uppercase text-primary">
              Our Partners
            </span>
            <div className="h-px w-8 bg-gradient-to-l from-transparent to-primary/50" />
          </div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-display font-bold text-ink mb-4">
            Powered by Community
          </h2>
          <p className="text-ink-muted max-w-2xl mx-auto">
            We're proud to partner with local businesses and national brands who share our
            commitment to youth development through sports.
          </p>
        </div>

        {/* Sponsors Section */}
        <div className="mb-16">
          <div className="flex items-center gap-4 mb-8">
            <h3 className="text-lg font-display font-semibold text-ink flex items-center gap-2">
              <Star className="w-5 h-5 text-primary fill-primary" />
              Proud Sponsors
            </h3>
            <div className="flex-1 h-px bg-gradient-to-r from-primary/30 to-transparent" />
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
            <h3 className="text-lg font-display font-semibold text-ink flex items-center gap-2">
              <Handshake className="w-5 h-5 text-primary" />
              Community Partners
            </h3>
            <div className="flex-1 h-px bg-gradient-to-r from-primary/30 to-transparent" />
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
            bg-gradient-to-br from-primary/10 via-primary/5 to-transparent
            border border-primary/20
            transition-all duration-700 delay-700
            ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}
          `}
        >
          <h3 className="text-xl font-display font-bold text-ink mb-2">
            Interested in Partnering?
          </h3>
          <p className="text-ink-muted text-sm mb-6 max-w-md mx-auto">
            Join our community of partners and help shape the future of youth sports in Central Ohio.
          </p>
          <a
            href="/contact?subject=partnership"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-primary text-cream font-semibold hover:bg-primary/90 transition-all shadow-lg shadow-primary/25 hover:shadow-primary/40 hover:scale-105"
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
        bg-paper
        border border-border hover:border-primary/40
        transition-all duration-500 cursor-pointer
        hover:bg-cream-2 hover:scale-[1.02]
        ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}
      `}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {/* Sponsor badge */}
      {partner.tier === "sponsor" && (
        <div className="absolute top-3 right-3">
          <div className="px-2 py-0.5 rounded-full bg-primary/10 border border-primary/30">
            <span className="text-[10px] font-semibold text-primary uppercase tracking-wider">
              Sponsor
            </span>
          </div>
        </div>
      )}

      {/* Logo */}
      <div
        className={`
          mb-4 text-ink-muted group-hover:text-ink
          transition-all duration-500
          grayscale group-hover:grayscale-0
          opacity-70 group-hover:opacity-100
          transform group-hover:scale-110
        `}
      >
        {partner.logo}
      </div>

      {/* Name */}
      <h4 className="font-semibold text-ink text-sm">{partner.name}</h4>
      <p className="text-xs text-ink-muted capitalize">{partner.tier} Partner</p>

      {/* Hover glow */}
      <div className="absolute inset-0 rounded-xl bg-gradient-to-t from-primary/0 to-primary/0 group-hover:from-primary/5 group-hover:to-transparent transition-all duration-500 pointer-events-none" />
    </div>
  )
}
