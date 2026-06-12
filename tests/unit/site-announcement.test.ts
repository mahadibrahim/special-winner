import { describe, expect, it } from "vitest"
import { getActiveSiteAnnouncement } from "@/lib/marketing/site-announcement"
import type { OrganizationSiteAnnouncement } from "@/lib/db/schema/organizations"

const FUTURE = "2099-01-01T00:00:00.000Z"
const PAST = "2020-01-01T00:00:00.000Z"

function ann(over: Partial<OrganizationSiteAnnouncement> = {}): OrganizationSiteAnnouncement {
  return {
    title: "Summer 7v7 League",
    detail: "Registration closes June 30 — 4 spots left",
    linkUrl: "/adult/leagues",
    linkLabel: "Claim a spot",
    audience: "all",
    expiresAt: FUTURE,
    ...over,
  }
}

function orgWith(a: OrganizationSiteAnnouncement | undefined) {
  return a === undefined
    ? ({ settings: {} } as any)
    : ({ settings: { siteAnnouncement: a } } as any)
}

describe("getActiveSiteAnnouncement", () => {
  it("returns the announcement for a matching surface", () => {
    expect(getActiveSiteAnnouncement(orgWith(ann()), "home")?.title).toBe("Summer 7v7 League")
  })

  it("returns null when none set / org null / settings null", () => {
    expect(getActiveSiteAnnouncement(orgWith(undefined), "home")).toBeNull()
    expect(getActiveSiteAnnouncement(null, "home")).toBeNull()
    expect(getActiveSiteAnnouncement({ settings: null } as any, "home")).toBeNull()
  })

  it("expired → null; no expiry → active", () => {
    expect(getActiveSiteAnnouncement(orgWith(ann({ expiresAt: PAST })), "home")).toBeNull()
    expect(getActiveSiteAnnouncement(orgWith(ann({ expiresAt: undefined })), "home")).not.toBeNull()
  })

  it("malformed expiry treated as expired (fail closed)", () => {
    expect(getActiveSiteAnnouncement(orgWith(ann({ expiresAt: "not-a-date" })), "home")).toBeNull()
  })

  it("audience targeting: home shows everything; hubs filter", () => {
    const adultOnly = orgWith(ann({ audience: "adult" }))
    expect(getActiveSiteAnnouncement(adultOnly, "home")).not.toBeNull()
    expect(getActiveSiteAnnouncement(adultOnly, "adult")).not.toBeNull()
    expect(getActiveSiteAnnouncement(adultOnly, "youth")).toBeNull()
    const allAud = orgWith(ann({ audience: "all" }))
    expect(getActiveSiteAnnouncement(allAud, "youth")).not.toBeNull()
  })

  it("blank title → null (incomplete config never renders)", () => {
    expect(getActiveSiteAnnouncement(orgWith(ann({ title: "  " })), "home")).toBeNull()
  })
})
