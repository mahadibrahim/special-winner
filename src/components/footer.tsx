"use client"

import type { LucideIcon } from "lucide-react"
import { Mail, MapPin } from "lucide-react"

const programLinks = [
  { label: "Soccer", href: "/programs?sport=soccer" },
  { label: "Basketball", href: "/programs?sport=basketball" },
  { label: "Baseball", href: "/programs?sport=baseball" },
  { label: "Football", href: "/programs?sport=football" },
  { label: "View All Programs", href: "/programs" },
]

const resourceLinks = [
  { label: "Coaching guides", href: "/guides" },
  { label: "Our philosophy", href: "/about" },
  { label: "For coaches", href: "/coach" },
]

const supportLinks = [
  { label: "Contact us", href: "/contact" },
  { label: "Refund policy", href: "/refund-policy" },
  { label: "Terms of service", href: "/terms" },
  { label: "Privacy policy", href: "/privacy" },
]

const locations = ["Powell", "Dublin", "Delaware"]

// Add social links with real URLs once company accounts are set up.
const socialLinks: Array<{ icon: LucideIcon; href: string; label: string }> = []

export default function Footer() {
  return (
    <footer className="relative bg-navy-deep text-cream/80">
      {/* Editorial section break */}
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between py-6 border-b border-cream/10">
          <p className="text-[11px] font-semibold tracking-[0.15em] uppercase text-cream/40">
            § The Colophon
          </p>
          <p className="text-[11px] font-semibold tracking-[0.15em] uppercase text-cream/40">
            Aspire Sports · Powell, Ohio
          </p>
        </div>
      </div>

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-16 lg:py-20">
        {/* Main footer grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-12 lg:gap-8 mb-16">
          {/* Column 1 - Brand & Newsletter */}
          <div className="lg:col-span-4">
            {/* Logo */}
            <a href="/" className="inline-block mb-6 group">
              <img
                src="/images/logo.svg"
                alt="Aspire Sports"
                className="h-10 w-auto group-hover:opacity-90 transition-opacity"
              />
            </a>

            {/* Tagline */}
            <p className="font-display text-xl italic text-cream/90 mb-4 leading-snug">
              Youth sports, done with<br />
              <span className="text-primary">conviction.</span>
            </p>

            <p className="text-sm leading-relaxed mb-8 text-cream/50 max-w-xs">
              Development-focused youth sports programs building character, confidence,
              and community through athletics in Central Ohio.
            </p>
          </div>

          {/* Column 2 - Programs */}
          <div className="lg:col-span-2">
            <h4 className="text-cream font-semibold mb-4 text-[11px] uppercase tracking-[0.15em]">
              Programs
            </h4>
            <ul className="space-y-3">
              {programLinks.map((link) => (
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

          {/* Column 3 - Resources */}
          <div className="lg:col-span-2">
            <h4 className="text-cream font-semibold mb-4 text-[11px] uppercase tracking-[0.15em]">
              Resources
            </h4>
            <ul className="space-y-3">
              {resourceLinks.map((link) => (
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

          {/* Column 4 - Support */}
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

          {/* Column 5 - Connect */}
          <div className="lg:col-span-2">
            <h4 className="text-cream font-semibold mb-4 text-[11px] uppercase tracking-[0.15em]">
              Connect
            </h4>

            {/* Contact info */}
            <div className="space-y-3 mb-6">
              <a
                href="mailto:info@aspiresports.com"
                className="flex items-center gap-3 text-cream/50 hover:text-primary text-sm transition-colors group"
              >
                <Mail className="w-4 h-4 flex-shrink-0" />
                info@aspiresports.com
              </a>
              <div className="flex items-center gap-3 text-cream/40 text-sm">
                <MapPin className="w-4 h-4 flex-shrink-0" />
                {locations.join(" · ")}
              </div>
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
