"use client"

import { useState, useEffect } from "react"
import { Menu, X, ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import LocationSelector from "@/components/location-selector"

export default function Navigation() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [isScrolled, setIsScrolled] = useState(false)

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20)
    }

    window.addEventListener("scroll", handleScroll, { passive: true })
    handleScroll() // Check initial state

    return () => window.removeEventListener("scroll", handleScroll)
  }, [])

  const navLinks = [
    { href: "#programs", label: "Programs" },
    { href: "/guides", label: "Guides" },
    { href: "/about", label: "About" },
    { href: "/contact", label: "Contact" },
  ]

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        isScrolled
          ? "bg-[#0a0a0f]/95 backdrop-blur-md border-b border-white/5 shadow-lg shadow-black/10"
          : "bg-transparent"
      }`}
    >
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="h-16 lg:h-20 flex items-center justify-between">
          {/* Logo */}
          <a href="/" className="flex items-center group">
            <img
              src="/images/logo.svg"
              alt="Aspire Sports"
              className="h-10 w-auto transition-opacity group-hover:opacity-90"
            />
          </a>

          {/* Desktop Navigation */}
          <div className="hidden lg:flex items-center gap-1">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="relative px-4 py-2 text-sm font-medium text-gray-300 hover:text-white transition-colors group"
              >
                {link.label}
                <span className="absolute bottom-1 left-4 right-4 h-[2px] bg-primary scale-x-0 group-hover:scale-x-100 transition-transform origin-left" />
              </a>
            ))}
          </div>

          {/* Desktop CTAs */}
          <div className="hidden lg:flex items-center gap-4">
            {/* Location Selector */}
            <LocationSelector mode="dropdown" />

            <div className="w-px h-6 bg-white/10" />

            <Button
              variant="ghost"
              className="text-gray-300 hover:text-white hover:bg-white/10"
              asChild
            >
              <a href="/signin">Sign In</a>
            </Button>
            <Button
              className="group bg-primary hover:bg-primary/90 text-primary-foreground px-5 rounded-lg shadow-lg shadow-primary/20 hover:shadow-primary/30 transition-all"
              asChild
            >
              <a href="#programs" className="flex items-center gap-2">
                Get Started
                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
              </a>
            </Button>
          </div>

          {/* Mobile Menu */}
          <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="lg:hidden text-white hover:bg-white/10"
              >
                <Menu className="h-5 w-5" />
                <span className="sr-only">Toggle menu</span>
              </Button>
            </SheetTrigger>
            <SheetContent
              side="right"
              className="w-full sm:w-[400px] bg-[#0a0a0f] border-l border-white/10 p-0"
            >
              <div className="flex flex-col h-full">
                {/* Mobile menu header */}
                <div className="flex items-center justify-between p-6 border-b border-white/10">
                  <a href="/" className="flex items-center">
                    <img
                      src="/images/logo.svg"
                      alt="Aspire Sports"
                      className="h-9 w-auto"
                    />
                  </a>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setMobileMenuOpen(false)}
                    className="text-gray-400 hover:text-white hover:bg-white/10"
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
                        className="flex items-center justify-between py-4 text-lg font-medium text-gray-300 hover:text-white border-b border-white/5 transition-colors group"
                        style={{ animationDelay: `${index * 50}ms` }}
                      >
                        {link.label}
                        <ArrowRight className="w-5 h-5 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all text-primary" />
                      </a>
                    ))}
                  </div>

                  {/* Mobile Location Selector */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      Your Location
                    </h4>
                    <LocationSelector mode="cards" />
                  </div>
                </div>

                {/* Mobile menu CTAs */}
                <div className="p-6 border-t border-white/10 space-y-3">
                  <Button
                    variant="outline"
                    className="w-full border-white/20 text-white hover:bg-white/10 hover:border-white/30"
                    asChild
                  >
                    <a href="/signin" onClick={() => setMobileMenuOpen(false)}>
                      Sign In
                    </a>
                  </Button>
                  <Button
                    className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
                    asChild
                  >
                    <a
                      href="#programs"
                      onClick={() => setMobileMenuOpen(false)}
                      className="flex items-center justify-center gap-2"
                    >
                      Get Started
                      <ArrowRight className="w-4 h-4" />
                    </a>
                  </Button>
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </nav>
  )
}
