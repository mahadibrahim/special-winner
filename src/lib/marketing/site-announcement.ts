import type { Organization, OrganizationSiteAnnouncement } from "@/lib/db/schema/organizations"

export type AnnouncementSurface = "home" | "adult" | "youth"

/**
 * Resolve the active site announcement for a public surface, or null.
 * Owns all display logic: presence, non-blank title, expiry (malformed
 * dates fail closed), audience targeting (home shows every audience —
 * it's the only page both customers share).
 */
export function getActiveSiteAnnouncement(
  org: Pick<Organization, "settings"> | null,
  surface: AnnouncementSurface,
): OrganizationSiteAnnouncement | null {
  const a = org?.settings?.siteAnnouncement
  if (!a || !a.title?.trim()) return null

  if (a.expiresAt !== undefined) {
    const t = Date.parse(a.expiresAt)
    if (Number.isNaN(t) || t <= Date.now()) return null
  }

  if (surface !== "home" && a.audience !== "all" && a.audience !== surface) return null

  return a
}
