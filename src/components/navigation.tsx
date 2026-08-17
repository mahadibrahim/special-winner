"use client"

import { useState, useEffect } from "react"
import { Menu, X, ArrowRight, LogOut, LayoutDashboard, User, ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { hasConfirmedPayment } from "@/lib/registrations/payment-confirmation-signal"

interface MeUser {
  id: string
  email: string
  firstName: string | null
  lastName: string | null
}

interface NavLink {
  href: string
  label: string
  children?: Array<{ href: string; label: string }>
}

interface NavigationProps {
  /**
   * Auth state resolved server-side (SSR pages — middleware already
   * validated the session). `null` = known anonymous, omitted = unknown
   * (prerendered page), in which case we fall back to /api/auth/me.
   */
  initialUser?: MeUser | null
}

export default function Navigation({ initialUser }: NavigationProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [isScrolled, setIsScrolled] = useState(false)
  const [user, setUser] = useState<MeUser | null>(initialUser ?? null)
  const [authResolved, setAuthResolved] = useState(initialUser !== undefined)
  // Count of started-but-unpaid registrations, surfaced as a badge on the
  // Dashboard link so a saved registration is discoverable from anywhere.
  const [pendingCount, setPendingCount] = useState(0)

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20)
    }

    window.addEventListener("scroll", handleScroll, { passive: true })
    handleScroll()

    return () => window.removeEventListener("scroll", handleScroll)
  }, [])

  useEffect(() => {
    // Server already told us who the user is — no fetch needed.
    if (initialUser !== undefined) return
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

  // Once we know who the user is, fetch their incomplete-registration count.
  useEffect(() => {
    if (!user) {
      setPendingCount(0)
      return
    }
    let cancelled = false
    fetch("/api/registrations", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : { registrations: [] }))
      .then((data: { registrations?: Array<{ id: string; status: string; paymentStatus: string }> }) => {
        if (cancelled) return
        // A registration whose payment Stripe already confirmed in this
        // browser (webhook not yet processed) is NOT awaiting payment —
        // don't nag the customer seconds after they paid.
        const count = (data.registrations ?? []).filter(
          (r) =>
            r.status === "pending" &&
            r.paymentStatus === "unpaid" &&
            !hasConfirmedPayment(r.id),
        ).length
        setPendingCount(count)
      })
      .catch(() => {
        if (!cancelled) setPendingCount(0)
      })
    return () => {
      cancelled = true
    }
  }, [user])

  const initials = user
    ? `${user.firstName?.[0] ?? ""}${user.lastName?.[0] ?? ""}`.toUpperCase() ||
      user.email[0]?.toUpperCase() ||
      "U"
    : ""

  const navLinks: NavLink[] = [
    {
      href: "/youth",
      label: "Youth",
      children: [
        { href: "/youth/leagues", label: "Leagues" },
        { href: "/youth/classes", label: "Classes" },
        { href: "/youth/camps", label: "Camps" },
      ],
    },
    {
      href: "/adult",
      label: "Adult",
      children: [
        { href: "/adult/leagues", label: "Leagues" },
        { href: "/adult/pickup", label: "Pickup" },
        { href: "/adult/tournaments", label: "Tournaments" },
      ],
    },
    { href: "/locations", label: "Locations" },
    { href: "/shop", label: "Shop" },
    { href: "/about", label: "About" },
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
      className={`fixed top-0 left-0 right-0 z-50 bg-cream transition-all duration-500 ${
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
              width={89}
              height={40}
              className="h-10 w-auto transition-opacity group-hover:opacity-80"
            />
          </a>

          {/* Desktop Navigation */}
          <div className="hidden lg:flex items-center gap-1">
            {navLinks.map((link) => (
              <div key={link.href} className="relative group">
                <a
                  href={link.href}
                  className="relative flex items-center gap-1 px-4 py-2 text-sm font-medium text-ink-muted hover:text-ink transition-colors"
                >
                  {link.label}
                  {link.children && (
                    <ChevronDown
                      className="h-3 w-3 opacity-50 transition-transform group-hover:rotate-180"
                      aria-hidden="true"
                    />
                  )}
                  <span className="absolute bottom-1 left-4 right-4 h-[1.5px] bg-primary scale-x-0 group-hover:scale-x-100 transition-transform origin-left duration-300" />
                </a>
                {link.children && (
                  <div className="absolute left-0 top-full pt-1 hidden group-hover:block group-focus-within:block">
                    <div className="min-w-44 bg-cream border border-border rounded-md shadow-sm py-2">
                      {link.children.map((child) => (
                        <a
                          key={child.href}
                          href={child.href}
                          className="block px-4 py-2 text-sm text-ink-muted hover:text-ink hover:bg-paper transition-colors"
                        >
                          {child.label}
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Desktop CTAs */}
          <div className="hidden lg:flex items-center gap-3">
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
                  {pendingCount > 0 && (
                    <span
                      className="inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-primary text-cream text-xs font-semibold"
                      aria-label={`${pendingCount} registration${pendingCount === 1 ? "" : "s"} awaiting payment`}
                    >
                      {pendingCount}
                    </span>
                  )}
                </a>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      aria-label={`${user.firstName ?? user.email}${user.lastName ? ` ${user.lastName}` : ""} — open account menu`}
                      className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-primary text-cream text-sm font-semibold shadow-sm shadow-primary/15 hover:bg-primary/90 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                    >
                      {initials}
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44 bg-cream border-border shadow-sm">
                    <DropdownMenuItem asChild>
                      <a href="/account" className="flex items-center gap-2 cursor-pointer">
                        <User className="w-4 h-4" />
                        Account
                      </a>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="p-0" onSelect={(e) => e.preventDefault()}>
                      <form action="/api/auth/signout" method="POST" className="w-full">
                        <button
                          type="submit"
                          className="flex w-full items-center gap-2 px-2 py-1.5 text-sm cursor-pointer"
                        >
                          <LogOut className="w-4 h-4" />
                          Sign out
                        </button>
                      </form>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
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
                  Programs
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
                      width={80}
                      height={36}
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
                    {navLinks.map((link) => (
                      <div key={link.href}>
                        <a
                          href={link.href}
                          onClick={() => setMobileMenuOpen(false)}
                          className="flex items-center justify-between py-4 text-lg font-display font-medium text-ink-2 hover:text-ink border-b border-border transition-colors group"
                        >
                          {link.label}
                          <ArrowRight className="w-5 h-5 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all text-primary" />
                        </a>
                        {link.children?.map((child) => (
                          <a
                            key={child.href}
                            href={child.href}
                            onClick={() => setMobileMenuOpen(false)}
                            className="flex items-center justify-between pl-8 py-3 text-sm font-medium text-ink-muted hover:text-ink border-b border-border transition-colors group"
                          >
                            {child.label}
                            <ArrowRight className="w-4 h-4 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all text-primary" />
                          </a>
                        ))}
                      </div>
                    ))}
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
                          {pendingCount > 0 && (
                            <span
                              className="inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-cream text-primary text-xs font-semibold"
                              aria-label={`${pendingCount} registration${pendingCount === 1 ? "" : "s"} awaiting payment`}
                            >
                              {pendingCount}
                            </span>
                          )}
                        </a>
                      </Button>
                      <Button
                        variant="outline"
                        className="w-full border-border text-ink hover:bg-cream-2"
                        asChild
                      >
                        <a
                          href="/account"
                          onClick={() => setMobileMenuOpen(false)}
                          className="flex items-center justify-center gap-2"
                        >
                          <User className="w-4 h-4" />
                          Account
                        </a>
                      </Button>
                      <form action="/api/auth/signout" method="POST" className="w-full">
                        <Button
                          type="submit"
                          variant="outline"
                          className="w-full border-border text-ink hover:bg-cream-2"
                        >
                          <LogOut className="w-4 h-4 mr-2" />
                          Sign out
                        </Button>
                      </form>
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
                          Programs
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
