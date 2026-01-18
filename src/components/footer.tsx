"use client"

import { useState } from "react"
import { Facebook, Instagram, Twitter, Mail, Phone, MapPin, ArrowRight, Loader2 } from "lucide-react"

const programLinks = [
  { label: "Soccer", href: "/programs?sport=soccer" },
  { label: "Basketball", href: "/programs?sport=basketball" },
  { label: "Baseball", href: "/programs?sport=baseball" },
  { label: "Football", href: "/programs?sport=football" },
  { label: "View All Programs", href: "/programs" },
]

const supportLinks = [
  { label: "FAQ", href: "/faq" },
  { label: "Contact Us", href: "/contact" },
  { label: "Refund Policy", href: "/refund-policy" },
  { label: "Terms of Service", href: "/terms" },
  { label: "Privacy Policy", href: "/privacy" },
]

const locations = ["Powell", "Dublin", "Delaware"]

const socialLinks = [
  { icon: Facebook, href: "https://facebook.com", label: "Facebook" },
  { icon: Instagram, href: "https://instagram.com", label: "Instagram" },
  { icon: Twitter, href: "https://twitter.com", label: "Twitter" },
]

export default function Footer() {
  const [email, setEmail] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSubscribed, setIsSubscribed] = useState(false)

  const handleNewsletterSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email) return

    setIsSubmitting(true)
    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 1000))
    setIsSubmitting(false)
    setIsSubscribed(true)
    setEmail("")
  }

  return (
    <footer className="relative bg-[#0a0a0f]">
      {/* Top border accent */}
      <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/10 to-transparent" />

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-16 lg:py-20">
        {/* Main footer grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 lg:gap-8 mb-16">
          {/* Column 1 - About & Newsletter */}
          <div className="lg:col-span-1">
            {/* Logo */}
            <a href="/" className="inline-block mb-6 group">
              <img
                src="/images/logo.svg"
                alt="Aspire Sports"
                className="h-10 w-auto group-hover:opacity-90 transition-opacity"
              />
            </a>

            <p className="text-gray-400 text-sm leading-relaxed mb-6">
              Development-focused youth sports programs building character, confidence,
              and community through athletics in Central Ohio.
            </p>

            {/* Newsletter */}
            <div>
              <h4 className="text-white font-semibold mb-3 text-sm">Stay Updated</h4>
              {isSubscribed ? (
                <div className="flex items-center gap-2 text-primary text-sm">
                  <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center">
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  Thanks for subscribing!
                </div>
              ) : (
                <form onSubmit={handleNewsletterSubmit} className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Enter your email"
                      className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white text-sm placeholder:text-gray-500 focus:outline-none focus:border-primary/50 focus:bg-white/[0.07] transition-all"
                      required
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-4 py-2.5 bg-primary hover:bg-primary/90 text-white rounded-lg text-sm font-medium transition-all hover:scale-105 disabled:opacity-50 disabled:hover:scale-100"
                  >
                    {isSubmitting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <ArrowRight className="w-4 h-4" />
                    )}
                  </button>
                </form>
              )}
            </div>
          </div>

          {/* Column 2 - Programs */}
          <div>
            <h4 className="text-white font-semibold mb-4 text-sm uppercase tracking-wider">
              Programs
            </h4>
            <ul className="space-y-3">
              {programLinks.map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    className="text-gray-400 hover:text-primary text-sm transition-colors inline-flex items-center gap-1 group"
                  >
                    {link.label}
                    {link.label === "View All Programs" && (
                      <ArrowRight className="w-3 h-3 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
                    )}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Column 3 - Support */}
          <div>
            <h4 className="text-white font-semibold mb-4 text-sm uppercase tracking-wider">
              Support
            </h4>
            <ul className="space-y-3">
              {supportLinks.map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    className="text-gray-400 hover:text-primary text-sm transition-colors"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Column 4 - Connect */}
          <div>
            <h4 className="text-white font-semibold mb-4 text-sm uppercase tracking-wider">
              Connect
            </h4>

            {/* Contact info */}
            <div className="space-y-3 mb-6">
              <a
                href="mailto:info@aspiresports.com"
                className="flex items-center gap-3 text-gray-400 hover:text-primary text-sm transition-colors group"
              >
                <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center group-hover:bg-primary/10 transition-colors">
                  <Mail className="w-4 h-4" />
                </div>
                info@aspiresports.com
              </a>
              <a
                href="tel:6145550123"
                className="flex items-center gap-3 text-gray-400 hover:text-primary text-sm transition-colors group"
              >
                <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center group-hover:bg-primary/10 transition-colors">
                  <Phone className="w-4 h-4" />
                </div>
                (614) 555-0123
              </a>
            </div>

            {/* Locations */}
            <div className="flex items-center gap-2 text-gray-500 text-sm mb-6">
              <MapPin className="w-4 h-4 flex-shrink-0" />
              <span>{locations.join(" • ")}</span>
            </div>

            {/* Social links */}
            <div className="flex gap-2">
              {socialLinks.map((social) => (
                <a
                  key={social.label}
                  href={social.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={social.label}
                  className="w-10 h-10 rounded-lg bg-white/5 hover:bg-primary/20 flex items-center justify-center text-gray-400 hover:text-primary transition-all hover:scale-110"
                >
                  <social.icon className="w-5 h-5" />
                </a>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="pt-8 border-t border-white/5">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-gray-500 text-sm">
              &copy; {new Date().getFullYear()} Aspire Sports. All rights reserved.
            </p>

            <div className="flex items-center gap-6 text-sm">
              <a href="/terms" className="text-gray-500 hover:text-gray-400 transition-colors">
                Terms
              </a>
              <a href="/privacy" className="text-gray-500 hover:text-gray-400 transition-colors">
                Privacy
              </a>
              <a href="/cookies" className="text-gray-500 hover:text-gray-400 transition-colors">
                Cookies
              </a>
            </div>
          </div>
        </div>
      </div>
    </footer>
  )
}
