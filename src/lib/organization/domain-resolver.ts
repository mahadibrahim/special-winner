import { db } from "@/lib/db"
import {
  organizations,
  locations,
  domainMappings,
  type Organization,
  type Location,
} from "@/lib/db/schema/organizations"
import { eq, and, or } from "drizzle-orm"

// ============================================
// TYPES
// ============================================

export interface ResolvedOrganization {
  organization: Organization
  location: Location | null
  matchedDomain: string | null
  matchType: "custom_domain" | "subdomain" | "default"
}

// ============================================
// CACHING (simple in-memory cache)
// ============================================

const cache = new Map<string, { data: ResolvedOrganization | null; expiry: number }>()
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

function getCached(key: string): ResolvedOrganization | null | undefined {
  const cached = cache.get(key)
  if (!cached) return undefined
  if (Date.now() > cached.expiry) {
    cache.delete(key)
    return undefined
  }
  return cached.data
}

function setCache(key: string, data: ResolvedOrganization | null) {
  cache.set(key, { data, expiry: Date.now() + CACHE_TTL })
}

// ============================================
// DOMAIN RESOLUTION
// ============================================

/**
 * Resolve organization from hostname
 *
 * Priority:
 * 1. Custom domain mapping (e.g., aspiresportspowell.com)
 * 2. Subdomain pattern (e.g., powell.aspiresports.com)
 * 3. Default organization (for main domain)
 */
export async function resolveOrganizationFromHost(
  host: string
): Promise<ResolvedOrganization | null> {
  if (!db) return null

  // Normalize host (remove port)
  const hostname = host.split(":")[0].toLowerCase()

  // Check cache
  const cached = getCached(hostname)
  if (cached !== undefined) return cached

  try {
    // Try custom domain first
    const customDomainResult = await resolveByCustomDomain(hostname)
    if (customDomainResult) {
      setCache(hostname, customDomainResult)
      return customDomainResult
    }

    // Try subdomain pattern
    const subdomainResult = await resolveBySubdomain(hostname)
    if (subdomainResult) {
      setCache(hostname, subdomainResult)
      return subdomainResult
    }

    // Fall back to default organization
    const defaultResult = await resolveDefaultOrganization()
    setCache(hostname, defaultResult)
    return defaultResult
  } catch (error) {
    console.error("Error resolving organization from host:", error)
    return null
  }
}

/**
 * Resolve by custom domain mapping
 */
async function resolveByCustomDomain(hostname: string): Promise<ResolvedOrganization | null> {
  if (!db) return null

  const [mapping] = await db
    .select({
      domain: domainMappings,
      organization: organizations,
      location: locations,
    })
    .from(domainMappings)
    .innerJoin(organizations, eq(domainMappings.organizationId, organizations.id))
    .leftJoin(locations, eq(domainMappings.locationId, locations.id))
    .where(
      and(
        eq(domainMappings.domain, hostname),
        or(
          eq(domainMappings.status, "active"),
          eq(domainMappings.status, "ssl_active")
        )
      )
    )
    .limit(1)

  if (!mapping) return null

  return {
    organization: mapping.organization,
    location: mapping.location,
    matchedDomain: hostname,
    matchType: "custom_domain",
  }
}

/**
 * Resolve by subdomain pattern (e.g., powell.aspiresports.com)
 */
async function resolveBySubdomain(hostname: string): Promise<ResolvedOrganization | null> {
  if (!db) return null

  // Extract subdomain from known base domains
  const baseDomains = [
    "aspiresports.com",
    "aspiresportsohio.com",
    "aspire-sports.netlify.app",
    "localhost",
  ]

  let subdomain: string | null = null
  for (const baseDomain of baseDomains) {
    if (hostname.endsWith(`.${baseDomain}`) || hostname.endsWith(`.${baseDomain.split(".")[0]}`)) {
      subdomain = hostname.replace(`.${baseDomain}`, "").replace(`.${baseDomain.split(".")[0]}`, "")
      break
    }
  }

  if (!subdomain || subdomain === "www") return null

  // Try to find organization by slug
  const [orgResult] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.slug, subdomain))
    .limit(1)

  if (orgResult) {
    return {
      organization: orgResult,
      location: null,
      matchedDomain: hostname,
      matchType: "subdomain",
    }
  }

  // Try to find location by slug (within default org)
  const [locationResult] = await db
    .select({
      organization: organizations,
      location: locations,
    })
    .from(locations)
    .innerJoin(organizations, eq(locations.organizationId, organizations.id))
    .where(eq(locations.slug, subdomain))
    .limit(1)

  if (locationResult) {
    return {
      organization: locationResult.organization,
      location: locationResult.location,
      matchedDomain: hostname,
      matchType: "subdomain",
    }
  }

  return null
}

/**
 * Resolve default organization (usually HQ or first active org)
 */
async function resolveDefaultOrganization(): Promise<ResolvedOrganization | null> {
  if (!db) return null

  // Look for headquarters first
  const [hq] = await db
    .select()
    .from(organizations)
    .where(
      and(
        eq(organizations.organizationType, "headquarters"),
        eq(organizations.status, "active")
      )
    )
    .limit(1)

  if (hq) {
    return {
      organization: hq,
      location: null,
      matchedDomain: null,
      matchType: "default",
    }
  }

  // Fall back to first active organization
  const [firstOrg] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.status, "active"))
    .limit(1)

  if (firstOrg) {
    return {
      organization: firstOrg,
      location: null,
      matchedDomain: null,
      matchType: "default",
    }
  }

  return null
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Get organization by ID
 */
export async function getOrganizationById(id: string): Promise<Organization | null> {
  if (!db) return null

  const [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, id))
    .limit(1)

  return org ?? null
}

/**
 * Get organization by slug
 */
export async function getOrganizationBySlug(slug: string): Promise<Organization | null> {
  if (!db) return null

  const [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.slug, slug))
    .limit(1)

  return org ?? null
}

/**
 * Get locations for an organization
 */
export async function getOrganizationLocations(organizationId: string): Promise<Location[]> {
  if (!db) return []

  return db
    .select()
    .from(locations)
    .where(
      and(
        eq(locations.organizationId, organizationId),
        eq(locations.active, true)
      )
    )
    .orderBy(locations.sortOrder)
}

/**
 * Clear the domain cache (useful after domain mapping changes)
 */
export function clearDomainCache(domain?: string) {
  if (domain) {
    cache.delete(domain.toLowerCase())
  } else {
    cache.clear()
  }
}
