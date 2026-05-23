import type { APIRoute } from "astro";
import { db } from "@/lib/db";
import { events, locations } from "@/lib/db/schema";
import { eq, and, gte, asc, sql } from "drizzle-orm";

/**
 * Public events feed — upcoming, active events only. Optional `audience`
 * filter ('youth' | 'adult' | 'all'). No auth required. Scoped to the
 * resolved tenant (locals.organization).
 */
export const GET: APIRoute = async ({ url, locals }) => {
  if (!db) {
    return new Response(JSON.stringify({ events: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const organization = locals.organization;
  if (!organization) {
    return new Response(JSON.stringify({ events: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const audience = url.searchParams.get("audience");

  try {
    const now = new Date();
    const conditions = [
      // Tenant scope first
      eq(events.organizationId, organization.id),
      eq(events.active, true),
      gte(events.startsAt, now),
    ];
    if (audience === "youth" || audience === "adult") {
      conditions.push(
        sql`(${events.audience} IS NULL OR ${events.audience} = ${audience} OR ${events.audience} = 'all')`,
      );
    }

    const rows = await db
      .select({
        id: events.id,
        organizationId: events.organizationId, // surfaced for tests + clients
        name: events.name,
        slug: events.slug,
        description: events.description,
        category: events.category,
        audience: events.audience,
        startsAt: events.startsAt,
        endsAt: events.endsAt,
        venueLabel: events.venueLabel,
        registrationUrl: events.registrationUrl,
        priceCents: events.priceCents,
        capacity: events.capacity,
        featured: events.featured,
        imageUrl: events.imageUrl,
        locationName: locations.name,
        locationCity: locations.city,
      })
      .from(events)
      .leftJoin(locations, eq(events.locationId, locations.id))
      .where(and(...conditions))
      .orderBy(asc(events.startsAt));

    return new Response(JSON.stringify({ events: rows }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[events] fetch failed", err);
    return new Response(JSON.stringify({ events: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
};
