import type { APIRoute } from "astro"
import { resolveOrganizationFromHost, getOrganizationLocations } from "@/lib/organization/domain-resolver"

export const GET: APIRoute = async ({ request }) => {
  try {
    const host = request.headers.get("host") || "localhost"
    const resolved = await resolveOrganizationFromHost(host)

    if (!resolved) {
      return new Response(
        JSON.stringify({
          organization: null,
          location: null,
          locations: [],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      )
    }

    // Get all locations for this organization
    const locations = await getOrganizationLocations(resolved.organization.id)

    return new Response(
      JSON.stringify({
        organization: {
          id: resolved.organization.id,
          name: resolved.organization.name,
          slug: resolved.organization.slug,
          logoUrl: resolved.organization.logoUrl,
          faviconUrl: resolved.organization.faviconUrl,
          settings: resolved.organization.settings,
          features: resolved.organization.features,
          organizationType: resolved.organization.organizationType,
        },
        location: resolved.location
          ? {
              id: resolved.location.id,
              name: resolved.location.name,
              slug: resolved.location.slug,
              city: resolved.location.city,
              state: resolved.location.state,
              settings: resolved.location.settings,
            }
          : null,
        locations: locations.map((loc) => ({
          id: loc.id,
          name: loc.name,
          slug: loc.slug,
          city: loc.city,
          state: loc.state,
        })),
        matchType: resolved.matchType,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    )
  } catch (error) {
    console.error("Error getting current organization:", error)
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    )
  }
}
