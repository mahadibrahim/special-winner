"use client"

import { useState } from "react"
import { Menu, X, LogOut } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { getSidebarForRole } from "@/lib/admin/sidebar-for-role"
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon"
import { VenuePicker } from "@/components/admin/venue-picker"

interface AdminLayoutProps {
  children: React.ReactNode
  currentPath: string
  role: string
  venueLabel?: string
  user: {
    firstName: string | null
    lastName: string | null
    email: string
  } | null
}

export function AdminLayout({
  children,
  currentPath,
  role,
  venueLabel,
  user,
}: AdminLayoutProps) {
  useHydrationBeacon()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const navGroups = getSidebarForRole(role)
  const isSuperAdmin = role === "super_admin"
  const homeHref = isSuperAdmin ? "/admin" : "/admin/venue"
  const sidebarSubtitle = isSuperAdmin
    ? "Super-admin"
    : (venueLabel ?? "Venue")

  return (
    <div className="min-h-screen bg-cream">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-ink/30 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          // mobile: drawer (full width w-64), hidden until sidebarOpen
          // md (tablet): icon rail w-12, always visible
          // lg (desktop): full w-64, always visible
          "fixed inset-y-0 left-0 z-50 w-64 md:w-12 lg:w-64 bg-navy-deep transform transition-transform duration-200 ease-in-out md:translate-x-0",
          sidebarOpen ? "translate-x-0 w-64" : "-translate-x-full"
        )}
      >
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="flex items-center justify-between h-16 px-3 lg:px-4 bg-navy">
            <a href={homeHref} className="flex items-center gap-3 min-w-0">
              <img src="/images/logo.svg" alt="Aspire Sports" className="h-8 w-auto flex-shrink-0" />
              <span className={cn(
                "text-[11px] font-semibold tracking-[0.15em] uppercase text-cream/50 truncate",
                sidebarOpen ? "inline" : "hidden lg:inline"
              )}>
                {sidebarSubtitle}
              </span>
            </a>
            <button
              onClick={() => setSidebarOpen(false)}
              className="md:hidden text-cream/60 hover:text-cream"
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          {/* Navigation */}
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
                    const isActive =
                      currentPath === item.href ||
                      (item.href !== "/admin" && currentPath.startsWith(item.href))
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
                      </a>
                    )
                  })}
                </div>
              </div>
            ))}
          </nav>

          {/* User section */}
          <div className="p-2 lg:p-4 border-t border-cream/10">
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
                <p className="text-xs text-cream/50 truncate">
                  {isSuperAdmin ? "Super-admin" : "Venue manager"}
                </p>
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

      {/* Main content */}
      <div className="md:pl-12 lg:pl-64">
        {/* Top bar */}
        <header className="sticky top-0 z-30 bg-cream/95 backdrop-blur-sm border-b border-border">
          <div className="flex items-center justify-between h-16 px-4">
            <button
              onClick={() => setSidebarOpen(true)}
              className="md:hidden text-ink-muted hover:text-ink"
            >
              <Menu className="h-6 w-6" />
            </button>
            <div className="flex items-center gap-4">
              <VenuePicker />
              <a
                href="/"
                className="text-sm text-ink-muted hover:text-ink transition-colors"
              >
                View Site
              </a>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="p-6">{children}</main>
      </div>
    </div>
  )
}
