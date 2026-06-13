/**
 * Shared public-filter queries — the sports and locations that have at least
 * one open/active, non-test season attached. Scoped to the resolved tenant
 * (Phase 0 — 2026-05-22). Used by /api/public/filters AND by the /sports
 * and /locations index pages so neither has to make an HTTP round-trip to
 * itself.
 */
import { db } from "@/lib/db";
import { sports, locations, programs, seasons, organizations } from "@/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";

export interface PublicSport {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  color: string | null;
}

export interface PublicLocation {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  city: string | null;
  state: string | null;
  latitude: string | null;
  longitude: string | null;
  sortOrder: number | null;
}

/** Sports with at least one open/active, non-test season for the given org. */
export async function getPublicSports(orgId: string): Promise<PublicSport[]> {
  try {
    if (!db) throw new Error("No DB");
    return await db
      .selectDistinct({
        id: sports.id,
        name: sports.name,
        slug: sports.slug,
        icon: sports.icon,
        color: sports.color,
      })
      .from(sports)
      .innerJoin(organizations, eq(organizations.id, sports.organizationId))
      .innerJoin(programs, eq(programs.sportId, sports.id))
      .innerJoin(seasons, eq(seasons.programId, programs.id))
      .where(
        and(
          eq(organizations.id, orgId),
          eq(organizations.status, "active"),
          eq(programs.active, true),
          eq(programs.isTest, false),
          eq(seasons.isTest, false),
          sql`${seasons.status} IN ('open', 'active', 'forming')`,
        ),
      );
  } catch (err) {
    console.error("getPublicSports failed:", err);
    return [];
  }
}

/** Locations with at least one open/active, non-test season for the given org. */
export async function getPublicLocations(orgId: string): Promise<PublicLocation[]> {
  try {
    if (!db) throw new Error("No DB");
    return await db
      .selectDistinct({
        id: locations.id,
        name: locations.name,
        slug: locations.slug,
        description: locations.description,
        city: locations.city,
        state: locations.state,
        latitude: locations.latitude,
        longitude: locations.longitude,
        sortOrder: locations.sortOrder,
      })
      .from(locations)
      .innerJoin(organizations, eq(organizations.id, locations.organizationId))
      .innerJoin(programs, eq(programs.locationId, locations.id))
      .innerJoin(seasons, eq(seasons.programId, programs.id))
      .where(
        and(
          eq(organizations.id, orgId),
          eq(organizations.status, "active"),
          eq(locations.active, true),
          eq(programs.active, true),
          eq(programs.isTest, false),
          eq(seasons.isTest, false),
          sql`${seasons.status} IN ('open', 'active', 'forming')`,
        ),
      )
      .orderBy(locations.sortOrder, locations.name);
  } catch (err) {
    console.error("getPublicLocations failed:", err);
    return [];
  }
}
