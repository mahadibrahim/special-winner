"use client"

import { useEffect, useState } from "react"
import { PortalLayout, type PortalBadges, type Breadcrumb } from "@/components/portal/portal-layout"
import { getPortalById } from "@/lib/portal/resolve"

interface CoachLayoutProps {
  children: React.ReactNode
  currentPath: string
  /** True when the signed-in user has more than one portal. */
  multiPortal?: boolean
  breadcrumbs?: Breadcrumb[]
  user: {
    firstName: string | null
    lastName: string | null
    email: string
  } | null
}

/**
 * Portal chrome for the /coach tree. Fetches the unread-inbox badge once on
 * mount from /api/coach/nav-badges (fail-soft), mirroring AdminLayout.
 */
export function CoachLayout({ children, currentPath, multiPortal = false, breadcrumbs, user }: CoachLayoutProps) {
  const portal = getPortalById("coach")!

  const [fetched, setFetched] = useState<PortalBadges | null>(null)
  useEffect(() => {
    let cancelled = false
    fetch("/api/coach/nav-badges")
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

  return (
    <PortalLayout
      currentPath={currentPath}
      navGroups={portal.nav}
      homeHref={portal.homeHref}
      subtitle="Coach"
      roleLabel="Coach"
      showPortalSwitch={multiPortal}
      badges={fetched ?? undefined}
      breadcrumbs={breadcrumbs}
      user={user}
    >
      {children}
    </PortalLayout>
  )
}
