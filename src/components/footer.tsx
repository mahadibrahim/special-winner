"use client"

import { useEffect, useState } from "react"
import type { LucideIcon } from "lucide-react"
import { Mail, MapPin, Loader2, CheckCircle2 } from "lucide-react"
import { track } from "@/lib/analytics/track"
import { CAPTAIN_DEPOSIT_DOLLARS } from "@/lib/registrations/team-deposit"

const youthLinks = [
  { label: "Youth programs", href: "/youth" },
  { label: "Leagues", href: "/youth/leagues" },
  { label: "Camps", href: "/youth/camps" },
  // One entry, not two: /youth/classes is the single page for both program
  // types (programTypes={["training", "clinic"]}), and it now owns the copy,
  // hero and finder these two raw /programs?type= query links used to
  // substitute for. Two footer links to the same URL would just split the
  // internal-link signal — /youth/classes is otherwise linked only from the
  // nav dropdown and the /youth hub.
  { label: "Classes & clinics", href: "/youth/classes" },
  { label: "Coaching guides", href: "/guides" },
]

const adultLinks = [
  { label: "Adult programs", href: "/adult" },
  { label: "Leagues", href: "/adult/leagues" },
  { label: "Pick-up", href: "/adult/pickup" },
  { label: "Tournaments", href: "/adult/tournaments" },
  { label: `Register a team — $${CAPTAIN_DEPOSIT_DOLLARS} reserves it`, href: "/programs?audience=team" },
]

const sportLinks = [
  { label: "Soccer", href: "/sports/soccer" },
  { label: "Basketball", href: "/sports/basketball" },
  { label: "Baseball", href: "/sports/baseball" },
  { label: "Hockey", href: "/sports/hockey" },
  { label: "All sports", href: "/sports" },
]

const orgLinks = [
  { label: "All locations", href: "/locations" },
  { label: "Our philosophy", href: "/about" },
  { label: "For coaches", href: "/coach" },
  { label: "Careers", href: "/careers" },
  { label: "Shop", href: "/shop" },
]

const supportLinks = [
  { label: "Email us", href: "mailto:hello@aspiresportsohio.com" },
  { label: "The Aspire Promise", href: "/promise" },
  { label: "Refund policy", href: "/refund-policy" },
  { label: "Terms of service", href: "/terms" },
  { label: "Privacy policy", href: "/privacy" },
]

// Add social links with real URLs once company accounts are set up.
const socialLinks: Array<{ icon: LucideIcon; href: string; label: string }> = []

export default function Footer() {
  // Locations are fetched from /api/public/filters so the footer reflects
  // real venues without needing a code change when one is added.
  const [locations, setLocations] = useState<string[]>([])

  // Newsletter form state
  const [nlEmail, setNlEmail] = useState("")
  const [nlAudience, setNlAudience] = useState<"" | "parent" | "adult">("")
  const [nlStatus, setNlStatus] = useState<"idle" | "submitting" | "ok" | "error">("idle")
  const [nlError, setNlError] = useState<string | null>(null)

  const handleNewsletterSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!nlEmail.trim()) return
    setNlStatus("submitting")
    setNlError(null)
    try {
      const res = await fetch("/api/public/newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: nlEmail.trim(),
          audience: nlAudience || undefined,
          source: "footer",
        }),
      })
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(json.error ?? "Could not subscribe")
      }
      setNlStatus("ok")
      track("newsletter_signup", { source: "footer", audience: nlAudience || undefined })
    } catch (err) {
      setNlError(err instanceof Error ? err.message : "Could not subscribe")
      setNlStatus("error")
    }
  }

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch("/api/public/filters")
        if (!res.ok) return
        const json = (await res.json()) as { locations?: { name: string }[] }
        if (cancelled) return
        const names = (json.locations ?? [])
          .map((l) => l.name.replace(/^Soccer One\s+/i, ""))
          .filter(Boolean)
        setLocations(names)
      } catch {
        // Silent — footer simply won't show the location strip.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <footer className="relative bg-navy-deep text-cream/80">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-16 lg:py-20">
        {/* Main footer grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-[repeat(16,minmax(0,1fr))] gap-12 lg:gap-8 mb-16">
          {/* Column 1 - Brand & Newsletter */}
          <div className="lg:col-span-4">
            {/* Logo */}
            <a href="/" className="inline-block mb-6 group">
              <img
                src="/images/logo.svg"
                alt="Aspire Sports"
                width={89}
                height={40}
                className="h-10 w-auto group-hover:opacity-90 transition-opacity"
              />
            </a>

            {/* Tagline */}
            <p className="font-display text-xl italic text-cream/90 mb-4 leading-snug">
              Adult &amp; youth sports, done with<br />
              <span className="text-primary">conviction.</span>
            </p>

            <p className="text-sm leading-relaxed mb-8 text-cream/50 max-w-xs">
              Sports programs for kids and adults in Central Ohio — built on real frameworks,
              taught by coaches who played the game.
            </p>

            {/* Newsletter signup — top-of-funnel email capture */}
            <div>
              <h4 className="text-cream font-semibold mb-3 text-[11px] uppercase tracking-[0.15em]">
                Get the Aspire newsletter
              </h4>
              {nlStatus === "ok" ? (
                <p className="flex items-center gap-2 text-sm text-cream/80">
                  <CheckCircle2 className="w-4 h-4 text-primary-orange" />
                  Thanks — you're on the list.
                </p>
              ) : (
                <form onSubmit={handleNewsletterSubmit} className="space-y-2">
                  <input
                    type="email"
                    required
                    value={nlEmail}
                    onChange={(e) => setNlEmail(e.target.value)}
                    placeholder="you@example.com"
                    aria-label="Email address"
                    className="w-full px-3 py-2 bg-cream/5 border border-cream/10 rounded text-cream placeholder:text-cream/30 text-sm focus:outline-none focus:border-primary-orange transition-colors"
                  />
                  <select
                    value={nlAudience}
                    onChange={(e) => setNlAudience(e.target.value as "" | "parent" | "adult")}
                    aria-label="I'm a"
                    className="w-full px-3 py-2 bg-cream/5 border border-cream/10 rounded text-cream text-sm focus:outline-none focus:border-primary-orange transition-colors"
                  >
                    <option value="" className="bg-navy-deep">I'm a… (optional)</option>
                    <option value="parent" className="bg-navy-deep">Parent</option>
                    <option value="adult" className="bg-navy-deep">Adult player</option>
                  </select>
                  <button
                    type="submit"
                    disabled={nlStatus === "submitting"}
                    className="inline-flex items-center justify-center gap-2 w-full px-4 py-2 bg-primary-orange text-cream text-sm font-medium rounded hover:bg-primary-orange/90 disabled:opacity-60 transition-colors"
                  >
                    {nlStatus === "submitting" ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Subscribing…
                      </>
                    ) : (
                      "Subscribe"
                    )}
                  </button>
                  {nlError && (
                    <p className="text-xs text-red-400">{nlError}</p>
                  )}
                </form>
              )}
            </div>
          </div>

          {/* Column 2 - Youth */}
          <div className="lg:col-span-2">
            <h4 className="text-cream font-semibold mb-4 text-[11px] uppercase tracking-[0.15em]">
              Youth
            </h4>
            <ul className="space-y-3">
              {youthLinks.map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    className="text-cream/50 hover:text-primary text-sm transition-colors"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Column 3 - Adult */}
          <div className="lg:col-span-2">
            <h4 className="text-cream font-semibold mb-4 text-[11px] uppercase tracking-[0.15em]">
              Adult
            </h4>
            <ul className="space-y-3">
              {adultLinks.map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    className="text-cream/50 hover:text-primary text-sm transition-colors"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Column 4 - Sports */}
          <div className="lg:col-span-2">
            <h4 className="text-cream font-semibold mb-4 text-[11px] uppercase tracking-[0.15em]">
              Sports
            </h4>
            <ul className="space-y-3">
              {sportLinks.map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    className="text-cream/50 hover:text-primary text-sm transition-colors"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Column 5 - Aspire */}
          <div className="lg:col-span-2">
            <h4 className="text-cream font-semibold mb-4 text-[11px] uppercase tracking-[0.15em]">
              Aspire
            </h4>
            <ul className="space-y-3">
              {orgLinks.map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    className="text-cream/50 hover:text-primary text-sm transition-colors"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Column 6 - Support */}
          <div className="lg:col-span-2">
            <h4 className="text-cream font-semibold mb-4 text-[11px] uppercase tracking-[0.15em]">
              Support
            </h4>
            <ul className="space-y-3">
              {supportLinks.map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    className="text-cream/50 hover:text-primary text-sm transition-colors"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Column 7 - Connect */}
          <div className="lg:col-span-2">
            <h4 className="text-cream font-semibold mb-4 text-[11px] uppercase tracking-[0.15em]">
              Connect
            </h4>

            {/* Contact info */}
            <div className="space-y-3 mb-6">
              <a
                href="mailto:hello@aspiresportsohio.com"
                className="flex items-center gap-3 text-cream/50 hover:text-primary text-sm transition-colors group"
              >
                <Mail className="w-4 h-4 flex-shrink-0" />
                hello@aspiresportsohio.com
              </a>
              {locations.length > 0 && (
                <div className="flex items-center gap-3 text-cream/40 text-sm">
                  <MapPin className="w-4 h-4 flex-shrink-0" />
                  {locations.join(" · ")}
                </div>
              )}
            </div>

            {/* Social links */}
            {socialLinks.length > 0 && (
              <div className="flex gap-2">
                {socialLinks.map((social) => (
                  <a
                    key={social.label}
                    href={social.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={social.label}
                    className="w-9 h-9 rounded-lg bg-cream/5 hover:bg-primary/20 flex items-center justify-center text-cream/40 hover:text-primary transition-all"
                  >
                    <social.icon className="w-4 h-4" />
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Bottom bar */}
        <div className="pt-8 border-t border-cream/10">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-cream/30 text-sm">
              &copy; {new Date().getFullYear()} Aspire Sports. All rights reserved.
            </p>

            <div className="flex items-center gap-6 text-sm">
              <a href="/terms" className="text-cream/30 hover:text-cream/60 transition-colors">
                Terms
              </a>
              <a href="/privacy" className="text-cream/30 hover:text-cream/60 transition-colors">
                Privacy
              </a>
            </div>
          </div>
        </div>
      </div>
    </footer>
  )
}
