"use client"

import { useState } from "react"
import { Menu, X, LogOut, LayoutGrid } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon"
import { VenuePicker } from "@/components/admin/venue-picker"
import { isNavItemActive } from "@/lib/portal/active-state"
import type { NavGroup } from "@/lib/admin/nav-super-admin"

export type PortalBadges = {
  inbox?: number
  refundsPending?: number
  attention?: number
  mediaQueue?: number
  reportsOwed?: number
}

export type Breadcrumb = { label: string; href?: string }

interface PortalLayoutProps {
  children: React.ReactNode
  currentPath: string
  /** Portal nav groups to render in the sidebar. */
  navGroups: NavGroup[]
  /** Where the logo links to. */
  homeHref: string
  /** Sidebar subtitle (portal label / venue name). */
  subtitle: string
  /** Footer role label under the user's name. */
  roleLabel: string
  /** When true, show the "Switch portal" link (user has >1 portal). */
  showPortalSwitch?: boolean
  /** Show the venue picker in the top bar (admin/venue only). */
  showVenuePicker?: boolean
  badges?: PortalBadges
  breadcrumbs?: Breadcrumb[]
  user: {
    firstName: string | null
    lastName: string | null
    email: string
  } | null
}

export function PortalLayout({
  children,
  currentPath,
  navGroups,
  homeHref,
  subtitle,
  roleLabel,
  showPortalSwitch = false,
  showVenuePicker = false,
  badges,
  breadcrumbs,
  user,
}: PortalLayoutProps) {
  useHydrationBeacon()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="min-h-screen bg-cream">
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-ink/30 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-64 md:w-12 lg:w-64 bg-navy-deep transform transition-transform duration-200 ease-in-out md:translate-x-0",
          sidebarOpen ? "translate-x-0 w-64" : "-translate-x-full"
        )}
      >
        <div className="flex flex-col h-full">
          <div className="flex items-center justify-between h-16 px-3 lg:px-4 bg-navy">
            <a href={homeHref} className="flex items-center gap-3 min-w-0">
              <img src="/images/logo.svg" alt="Aspire Sports" className="h-8 w-auto flex-shrink-0" />
              <span className={cn(
                "text-[11px] font-semibold tracking-[0.15em] uppercase text-cream/50 truncate",
                sidebarOpen ? "inline" : "hidden lg:inline"
              )}>
                {subtitle}
              </span>
            </a>
            <button
              onClick={() => setSidebarOpen(false)}
              className="md:hidden text-cream/60 hover:text-cream"
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          <nav className="flex-1 px-1.5 lg:px-2 py-4 overflow-y-auto">
            {navGroups.map((group, gi) => (
              <div key={gi} className={gi === 0 ? "" : "mt-4"}>
                {group.name && (
                  <div className={cn(
                    "px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-cream/40 truncate",
                    sidebarOpen ? "block" : "hidden lg:block"
                  )}>
                    {group.name}
                  </div>
                )}
                <div className="space-y-1">
                  {group.items.map((item) => {
                    const isActive = isNavItemActive(currentPath, item.href)
                    const badgeCount = item.badgeKey && badges ? badges[item.badgeKey] : undefined
                    return (
                      <a
                        key={item.name}
                        href={item.href}
                        title={item.name}
                        className={cn(
                          "flex items-center gap-3 px-2 lg:px-3 py-2 rounded-lg text-sm font-medium transition-colors min-h-[44px]",
                          isActive
                            ? "bg-navy text-cream"
                            : "text-cream/60 hover:bg-navy hover:text-cream"
                        )}
                      >
                        <item.icon className="h-5 w-5 flex-shrink-0" />
                        <span className={cn(
                          "flex-1 truncate",
                          sidebarOpen ? "inline" : "hidden lg:inline"
                        )}>{item.name}</span>
                        {badgeCount ? (
                          <span className={cn(
                            "ml-auto inline-flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-semibold min-w-[18px] h-[18px] px-1",
                            sidebarOpen ? "inline-flex" : "hidden lg:inline-flex"
                          )}>
                            {badgeCount > 99 ? "99+" : badgeCount}
                          </span>
                        ) : null}
                      </a>
                    )
                  })}
                </div>
              </div>
            ))}
          </nav>

          <div className="p-2 lg:p-4 border-t border-cream/10">
            {showPortalSwitch && (
              <a
                href="/portal"
                title="Switch portal"
                className="flex items-center gap-3 px-2 lg:px-3 py-2 mb-2 rounded-lg text-sm font-medium text-cream/60 hover:bg-navy hover:text-cream min-h-[44px]"
              >
                <LayoutGrid className="h-5 w-5 flex-shrink-0" />
                <span className={cn(sidebarOpen ? "inline" : "hidden lg:inline")}>
                  Switch portal
                </span>
              </a>
            )}
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 lg:w-10 lg:h-10 rounded-full bg-navy flex items-center justify-center text-cream font-medium flex-shrink-0">
                {user?.firstName?.[0] || user?.email[0].toUpperCase()}
              </div>
              <div className={cn(
                "flex-1 min-w-0",
                sidebarOpen ? "block" : "hidden lg:block"
              )}>
                <p className="text-sm font-medium text-cream truncate">
                  {user?.firstName && user?.lastName
                    ? `${user.firstName} ${user.lastName}`
                    : user?.email}
                </p>
                <p className="text-xs text-cream/50 truncate">{roleLabel}</p>
              </div>
            </div>
            <form action="/api/auth/signout" method="POST" className="mt-3">
              <Button
                type="submit"
                variant="ghost"
                size="sm"
                title="Sign out"
                className="w-full justify-start text-cream/60 hover:text-cream hover:bg-navy min-h-[44px]"
              >
                <LogOut className="h-4 w-4 mr-2 flex-shrink-0" />
                <span className={cn(sidebarOpen ? "inline" : "hidden lg:inline")}>
                  Sign out
                </span>
              </Button>
            </form>
          </div>
        </div>
      </aside>

      <div className="md:pl-12 lg:pl-64">
        <header className="sticky top-0 z-30 bg-cream/95 backdrop-blur-sm border-b border-border">
          <div className="flex items-center justify-between h-16 px-4">
            <div className="flex items-center gap-3 min-w-0">
              <button
                onClick={() => setSidebarOpen(true)}
                className="md:hidden text-ink-muted hover:text-ink"
              >
                <Menu className="h-6 w-6" />
              </button>
              {breadcrumbs && breadcrumbs.length > 0 && (
                <nav aria-label="Breadcrumb" className="hidden sm:flex items-center gap-1 text-sm text-ink-muted min-w-0">
                  {breadcrumbs.map((crumb, i) => (
                    <span key={i} className="flex items-center gap-1 min-w-0">
                      {i > 0 && <span className="text-ink-muted/50">/</span>}
                      {crumb.href ? (
                        <a href={crumb.href} className="hover:text-ink truncate">{crumb.label}</a>
                      ) : (
                        <span className="text-ink truncate">{crumb.label}</span>
                      )}
                    </span>
                  ))}
                </nav>
              )}
            </div>
            <div className="flex items-center gap-4">
              {showVenuePicker && <VenuePicker />}
              <a
                href="/"
                className="text-sm text-ink-muted hover:text-ink transition-colors"
              >
                View Site
              </a>
            </div>
          </div>
        </header>

        <main className="p-6">{children}</main>
      </div>
    </div>
  )
}
