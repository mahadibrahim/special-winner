"use client"

import { useState, useEffect } from "react"
import { Menu, X, ArrowRight, LogOut, LayoutDashboard } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import LocationSelector from "@/components/location-selector"

interface MeUser {
  id: string
  email: string
  firstName: string | null
  lastName: string | null
}

export default function Navigation() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [isScrolled, setIsScrolled] = useState(false)
  const [user, setUser] = useState<MeUser | null>(null)
  const [authResolved, setAuthResolved] = useState(false)

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20)
    }

    window.addEventListener("scroll", handleScroll, { passive: true })
    handleScroll()

    return () => window.removeEventListener("scroll", handleScroll)
  }, [])

  useEffect(() => {
    let cancelled = false
    fetch("/api/auth/me", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : { user: null }))
      .then((data) => {
        if (!cancelled) setUser(data.user ?? null)
      })
      .catch(() => {
        if (!cancelled) setUser(null)
      })
      .finally(() => {
        if (!cancelled) setAuthResolved(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const handleSignOut = async () => {
    try {
      await fetch("/api/auth/signout", { method: "POST", credentials: "same-origin" })
    } finally {
      window.location.href = "/"
    }
  }

  const initials = user
    ? `${user.firstName?.[0] ?? ""}${user.lastName?.[0] ?? ""}`.toUpperCase() ||
      user.email[0]?.toUpperCase() ||
      "U"
    : ""

  const navLinks = [
    { href: "/programs", label: "Programs" },
    { href: "/guides", label: "Guides" },
    { href: "/about", label: "About" },
    { href: "/contact", label: "Contact" },
  ]

  return (
    <>
      {/* Skip link — visible only on focus, jumps past nav to main content. */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:px-3 focus:py-2 focus:rounded-md focus:bg-primary focus:text-primary-foreground focus:outline-none focus:ring-2 focus:ring-primary"
      >
        Skip to main content
      </a>
    <nav
      className={`fixed top-0 left-0 right-0 z-50 bg-cream/95 backdrop-blur-md transition-all duration-500 ${
        isScrolled
          ? "shadow-[0_1px_0_0_var(--border)]"
          : ""
      }`}
    >
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="h-16 lg:h-20 flex items-center justify-between">
          {/* Logo — switches between light and dark variants */}
          <a href="/" className="flex items-center group">
            <img
              src="/images/logo-dark.svg"
              alt="Aspire Sports"
              className="h-10 w-auto transition-opacity group-hover:opacity-80"
            />
          </a>

          {/* Desktop Navigation */}
          <div className="hidden lg:flex items-center gap-1">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="relative px-4 py-2 text-sm font-medium text-ink-muted hover:text-ink transition-colors group"
              >
                {link.label}
                <span className="absolute bottom-1 left-4 right-4 h-[1.5px] bg-primary scale-x-0 group-hover:scale-x-100 transition-transform origin-left duration-300" />
              </a>
            ))}
          </div>

          {/* Desktop CTAs */}
          <div className="hidden lg:flex items-center gap-3">
            {/* Location Selector */}
            <LocationSelector mode="dropdown" />

            {!authResolved ? (
              // Reserve space to avoid layout shift while /api/auth/me resolves.
              <div className="h-10 w-40" aria-hidden />
            ) : user ? (
              <>
                <a
                  href="/dashboard"
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-ink-muted hover:text-ink transition-colors"
                >
                  <LayoutDashboard className="w-4 h-4" />
                  Dashboard
                </a>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-ink-muted hover:text-ink transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  Sign out
                </button>
                <a
                  href="/dashboard"
                  className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-primary text-cream text-sm font-semibold shadow-sm shadow-primary/15 hover:bg-primary/90 transition-all"
                  title={`${user.firstName ?? user.email}${user.lastName ? ` ${user.lastName}` : ""}`}
                >
                  {initials}
                </a>
              </>
            ) : (
              <>
                <a
                  href="/signin"
                  className="px-4 py-2 text-sm font-medium text-ink-muted hover:text-ink transition-colors"
                >
                  Sign In
                </a>
                <a
                  href="/programs"
                  className="group inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium bg-primary text-cream rounded-lg hover:bg-primary/90 shadow-sm shadow-primary/15 transition-all"
                >
                  Get Started
                  <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
                </a>
              </>
            )}
          </div>

          {/* Mobile Menu */}
          <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="lg:hidden text-ink hover:bg-cream-2"
              >
                <Menu className="h-5 w-5" />
                <span className="sr-only">Toggle menu</span>
              </Button>
            </SheetTrigger>
            <SheetContent
              side="right"
              className="w-full sm:w-[400px] bg-cream border-l border-border p-0"
            >
              <div className="flex flex-col h-full">
                {/* Mobile menu header */}
                <div className="flex items-center justify-between p-6 border-b border-border">
                  <a href="/" className="flex items-center">
                    <img
                      src="/images/logo-dark.svg"
                      alt="Aspire Sports"
                      className="h-9 w-auto"
                    />
                  </a>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setMobileMenuOpen(false)}
                    className="text-ink-muted hover:text-ink hover:bg-cream-2"
                  >
                    <X className="h-5 w-5" />
                  </Button>
                </div>

                {/* Mobile menu links */}
                <div className="flex-1 px-6 py-8 overflow-y-auto">
                  <div className="space-y-1 mb-8">
                    {navLinks.map((link, index) => (
                      <a
                        key={link.href}
                        href={link.href}
                        onClick={() => setMobileMenuOpen(false)}
                        className="flex items-center justify-between py-4 text-lg font-display font-medium text-ink-2 hover:text-ink border-b border-border transition-colors group"
                        style={{ animationDelay: `${index * 50}ms` }}
                      >
                        {link.label}
                        <ArrowRight className="w-5 h-5 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all text-primary" />
                      </a>
                    ))}
                  </div>

                  {/* Mobile Location Selector */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-semibold text-ink-muted uppercase tracking-wider">
                      Your Location
                    </h4>
                    <LocationSelector mode="cards" />
                  </div>
                </div>

                {/* Mobile menu CTAs */}
                <div className="p-6 border-t border-border space-y-3">
                  {user ? (
                    <>
                      <Button
                        className="w-full bg-primary hover:bg-primary/90 text-cream"
                        asChild
                      >
                        <a
                          href="/dashboard"
                          onClick={() => setMobileMenuOpen(false)}
                          className="flex items-center justify-center gap-2"
                        >
                          <LayoutDashboard className="w-4 h-4" />
                          Dashboard
                        </a>
                      </Button>
                      <Button
                        variant="outline"
                        className="w-full border-border text-ink hover:bg-cream-2"
                        onClick={() => {
                          setMobileMenuOpen(false)
                          handleSignOut()
                        }}
                      >
                        <LogOut className="w-4 h-4 mr-2" />
                        Sign out
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        variant="outline"
                        className="w-full border-border text-ink hover:bg-cream-2"
                        asChild
                      >
                        <a href="/signin" onClick={() => setMobileMenuOpen(false)}>
                          Sign In
                        </a>
                      </Button>
                      <Button
                        className="w-full bg-primary hover:bg-primary/90 text-cream"
                        asChild
                      >
                        <a
                          href="/programs"
                          onClick={() => setMobileMenuOpen(false)}
                          className="flex items-center justify-center gap-2"
                        >
                          Get Started
                          <ArrowRight className="w-4 h-4" />
                        </a>
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </nav>
    </>
  )
}
