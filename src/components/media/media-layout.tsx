"use client"

import { useEffect, useState } from "react"
import { PortalLayout, type PortalBadges, type Breadcrumb } from "@/components/portal/portal-layout"
import { getPortalById } from "@/lib/portal/resolve"
import { getMediaNav } from "@/lib/admin/nav-media"

interface MediaLayoutProps {
  children: React.ReactNode
  currentPath: string
  /** The signed-in user's role names — drives the role-filtered nav. */
  roleNames: string[]
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
 * Portal chrome for the /media tree. Renders a role-filtered nav (staff vs
 * editor) and fetches the tagging-queue badge once on mount (fail-soft).
 */
export function MediaLayout({ children, currentPath, roleNames, multiPortal = false, breadcrumbs, user }: MediaLayoutProps) {
  const portal = getPortalById("media")!

  const [fetched, setFetched] = useState<PortalBadges | null>(null)
  useEffect(() => {
    let cancelled = false
    fetch("/api/media/nav-badges")
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
      navGroups={getMediaNav(roleNames)}
      homeHref={portal.homeHref}
      subtitle="Media"
      roleLabel="Media"
      showPortalSwitch={multiPortal}
      badges={fetched ?? undefined}
      breadcrumbs={breadcrumbs}
      user={user}
    >
      {children}
    </PortalLayout>
  )
}
