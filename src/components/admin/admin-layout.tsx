"use client"

import { useState } from "react"
import {
  LayoutDashboard,
  Trophy,
  MapPin,
  Calendar,
  Users,
  Users2,
  CreditCard,
  Settings,
  Menu,
  X,
  ChevronDown,
  LogOut,
  Dumbbell,
  Building2,
  RefreshCcw,
  BookOpen,
  CalendarDays,
  Megaphone,
  Tag,
  ListOrdered,
  BarChart3,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface AdminLayoutProps {
  children: React.ReactNode
  currentPath: string
  user: {
    firstName: string | null
    lastName: string | null
    email: string
  } | null
}

const navigation = [
  { name: "Dashboard", href: "/admin", icon: LayoutDashboard },
  { name: "Organizations", href: "/admin/organizations", icon: Building2 },
  { name: "Sports", href: "/admin/sports", icon: Trophy },
  { name: "Locations", href: "/admin/locations", icon: MapPin },
  { name: "Venues", href: "/admin/venues", icon: MapPin },
  { name: "Programs", href: "/admin/programs", icon: Dumbbell },
  { name: "Seasons", href: "/admin/seasons", icon: Calendar },
  { name: "Age Groups", href: "/admin/age-groups", icon: Users },
  { name: "Teams", href: "/admin/teams", icon: Users2 },
  { name: "Games", href: "/admin/games", icon: CalendarDays },
  { name: "Curriculum", href: "/admin/curriculum", icon: BookOpen },
  { name: "Registrations", href: "/admin/registrations", icon: Users },
  { name: "Waitlist", href: "/admin/waitlist", icon: ListOrdered },
  { name: "Refunds", href: "/admin/refunds", icon: RefreshCcw },
  { name: "Payments", href: "/admin/payments", icon: CreditCard },
  { name: "Discount Codes", href: "/admin/discount-codes", icon: Tag },
  { name: "Users", href: "/admin/users", icon: Users },
  { name: "Announcements", href: "/admin/announcements", icon: Megaphone },
  { name: "Reports", href: "/admin/reports", icon: BarChart3 },
  { name: "Settings", href: "/admin/settings", icon: Settings },
]

export function AdminLayout({ children, currentPath, user }: AdminLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-[#0a0a0f]">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-64 bg-gray-900 transform transition-transform duration-200 ease-in-out lg:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="flex items-center justify-between h-16 px-4 bg-gray-800">
            <a href="/admin" className="flex items-center gap-2">
              <Trophy className="h-8 w-8 text-primary" />
              <span className="text-xl font-bold text-white">Aspire Admin</span>
            </a>
            <button
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden text-gray-400 hover:text-white"
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto">
            {navigation.map((item) => {
              const isActive = currentPath === item.href ||
                (item.href !== "/admin" && currentPath.startsWith(item.href))
              return (
                <a
                  key={item.name}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                    isActive
                      ? "bg-gray-800 text-white"
                      : "text-gray-400 hover:bg-gray-800 hover:text-white"
                  )}
                >
                  <item.icon className="h-5 w-5" />
                  {item.name}
                </a>
              )
            })}
          </nav>

          {/* User section */}
          <div className="p-4 border-t border-gray-800">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center text-white font-medium">
                {user?.firstName?.[0] || user?.email[0].toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">
                  {user?.firstName && user?.lastName
                    ? `${user.firstName} ${user.lastName}`
                    : user?.email}
                </p>
                <p className="text-xs text-gray-400 truncate">Administrator</p>
              </div>
            </div>
            <form action="/api/auth/signout" method="POST" className="mt-3">
              <Button
                type="submit"
                variant="ghost"
                size="sm"
                className="w-full justify-start text-gray-400 hover:text-white hover:bg-gray-800"
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
        <header className="sticky top-0 z-30 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
          <div className="flex items-center justify-between h-16 px-4">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-white"
            >
              <Menu className="h-6 w-6" />
            </button>
            <div className="flex items-center gap-4">
              <a
                href="/"
                className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-white"
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
