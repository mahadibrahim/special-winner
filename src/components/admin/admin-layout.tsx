"use client"

import { useState } from "react"
import { Menu, X, LogOut } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { getSidebarForRole } from "@/lib/admin/sidebar-for-role"

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
          "fixed inset-y-0 left-0 z-50 w-64 bg-navy-deep transform transition-transform duration-200 ease-in-out lg:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="flex items-center justify-between h-16 px-4 bg-navy">
            <a href={homeHref} className="flex items-center gap-3">
              <img src="/images/logo.svg" alt="Aspire Sports" className="h-8 w-auto" />
              <span className="text-[11px] font-semibold tracking-[0.15em] uppercase text-cream/50">
                {sidebarSubtitle}
              </span>
            </a>
            <button
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden text-cream/60 hover:text-cream"
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-2 py-4 overflow-y-auto">
            {navGroups.map((group, gi) => (
              <div key={gi} className={gi === 0 ? "" : "mt-4"}>
                {group.name && (
                  <div className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-cream/40">
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
                        className={cn(
                          "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                          isActive
                            ? "bg-navy text-cream"
                            : "text-cream/60 hover:bg-navy hover:text-cream"
                        )}
                      >
                        <item.icon className="h-5 w-5 flex-shrink-0" />
                        <span className="flex-1 truncate">{item.name}</span>
                      </a>
                    )
                  })}
                </div>
              </div>
            ))}
          </nav>

          {/* User section */}
          <div className="p-4 border-t border-cream/10">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-navy flex items-center justify-center text-cream font-medium">
                {user?.firstName?.[0] || user?.email[0].toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
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
                className="w-full justify-start text-cream/60 hover:text-cream hover:bg-navy"
              >
                <LogOut className="h-4 w-4 mr-2" />
                Sign out
              </Button>
            </form>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="lg:pl-64">
        {/* Top bar */}
        <header className="sticky top-0 z-30 bg-cream/95 backdrop-blur-sm border-b border-border">
          <div className="flex items-center justify-between h-16 px-4">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden text-ink-muted hover:text-ink"
            >
              <Menu className="h-6 w-6" />
            </button>
            <div className="flex items-center gap-4">
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
