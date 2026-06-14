"use client"

import { useEffect, useState } from "react"
import { PortalLayout, type PortalBadges, type Breadcrumb } from "@/components/portal/portal-layout"
import { getPortalById } from "@/lib/portal/resolve"

interface AdminLayoutProps {
  children: React.ReactNode
  currentPath: string
  role: string
  venueLabel?: string
  /** True when the signed-in user has more than one portal. */
  multiPortal?: boolean
  badges?: PortalBadges
  breadcrumbs?: Breadcrumb[]
  user: {
    firstName: string | null
    lastName: string | null
    email: string
  } | null
}

/**
 * Thin compatibility wrapper over PortalLayout for the /admin tree. super_admin
 * resolves to the `admin` portal; every other admin-tier role resolves to the
 * narrower `venue` portal (the safe default for any non-super-admin role).
 *
 * Notification badge counts are fetched once on mount from /api/admin/nav-badges
 * (fail-soft) so every admin page shows live counts without per-page plumbing.
 */
export function AdminLayout({
  children,
  currentPath,
  role,
  venueLabel,
  multiPortal = false,
  badges,
  breadcrumbs,
  user,
}: AdminLayoutProps) {
  const isSuperAdmin = role === "super_admin"
  const portal = getPortalById(isSuperAdmin ? "admin" : "venue")!
  const subtitle = isSuperAdmin ? "Super-admin" : (venueLabel ?? "Venue")
  const roleLabel = isSuperAdmin ? "Super-admin" : "Venue manager"

  const [fetched, setFetched] = useState<PortalBadges | null>(null)
  useEffect(() => {
    let cancelled = false
    fetch("/api/admin/nav-badges")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data) setFetched(data as PortalBadges)
      })
      .catch(() => {
        /* fail-soft: no badges */
      })
    return () => {
      cancelled = true
    }
  }, [])

  const mergedBadges: PortalBadges | undefined = fetched ?? badges

  return (
    <PortalLayout
      currentPath={currentPath}
      navGroups={portal.nav}
      homeHref={portal.homeHref}
      subtitle={subtitle}
      roleLabel={roleLabel}
      showPortalSwitch={multiPortal}
      showVenuePicker
      badges={mergedBadges}
      breadcrumbs={breadcrumbs}
      user={user}
    >
      {children}
    </PortalLayout>
  )
}
