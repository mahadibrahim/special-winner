import type { APIRoute } from "astro";
import { db } from "@/lib/db";
import { seasons, programs, sports, locations, ageGroups, registrations, organizations } from "@/lib/db/schema";
import { eq, and, sql, asc } from "drizzle-orm";

export const GET: APIRoute = async ({ url, locals }) => {
  const organization = locals.organization;
  if (!organization) {
    return new Response(JSON.stringify({ seasons: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const locationSlug = url.searchParams.get("location");
  const sportSlug = url.searchParams.get("sport");
  const status = url.searchParams.get("status");
  const audience = url.searchParams.get("audience"); // "youth" | "adult" | null
  const term = url.searchParams.get("term");

  try {
    if (!db) throw new Error("No DB");

    // Build query conditions
    const conditions = [];
    // Tenant scope — must be first.
    conditions.push(eq(organizations.id, organization.id));
    // Status is clamped to a public-safe allowlist. This endpoint backs the
    // marketing catalog, so it must NEVER surface draft/closed/etc. seasons —
    // a draft season carries unannounced future pricing and dates. Callers may
    // narrow to a single safe status (e.g. ?status=open), but any other value
    // (or none) falls back to both publicly visible statuses. Without this an
    // unauthenticated `GET /api/public/seasons?status=draft` would leak the
    // entire draft catalog, and the no-param SoccerOne leagues page would show
    // drafts the moment any exist.
    // 'completed' is allowed ONLY when explicitly requested (?status=completed) —
    // public historical data (final standings). The default fallback below never
    // includes it, so catalog/finders never surface finished seasons.
    const PUBLIC_STATUSES = ["open", "active", "forming", "completed"] as const;
    if (status && (PUBLIC_STATUSES as readonly string[]).includes(status)) {
      conditions.push(eq(seasons.status, status as typeof seasons.status.enumValues[number]));
    } else {
      conditions.push(sql`${seasons.status} IN ('open', 'active', 'forming')`);
    }
    if (locationSlug && locationSlug !== "all") {
      conditions.push(eq(locations.slug, locationSlug));
    }
    if (sportSlug) {
      conditions.push(eq(sports.slug, sportSlug));
    }
    if (term) {
      conditions.push(eq(seasons.termSlug, term));
    }
    // Audience filter: apply age-group bounds when audience is specified.
    // For seasons without an age group we include them in both views (no
    // ageGroupId means the season is open to all).
    if (audience === "youth") {
      // Youth: ageGroup.minAge < 18 (overlaps with kids' ages), OR no ageGroup
      conditions.push(
        sql`(${seasons.ageGroupId} IS NULL OR ${ageGroups.minAge} < 18)`
      );
    } else if (audience === "adult") {
      // Adult: ageGroup.minAge >= 18, OR no ageGroup
      conditions.push(
        sql`(${seasons.ageGroupId} IS NULL OR ${ageGroups.minAge} >= 18)`
      );
    }
    // Always exclude test fixtures from the public catalog. Programs/seasons
    // are flagged via the `is_test` column (backfilled by migration 0009 and
    // set explicitly by the e2e seed). Playwright drives the registration flow
    // through admin endpoints with `?include_test=1`, not the public catalog.
    conditions.push(eq(seasons.isTest, false));
    conditions.push(eq(programs.isTest, false));
    // Defense-in-depth: only surface rows owned by an active organization.
    // CI/test orgs are soft-archived to status='inactive' (see PR #49), so
    // this clause hides leaked fixtures even if their programs/seasons
    // weren't tagged isTest=true.
    conditions.push(eq(organizations.status, "active"));
    // "Live until": an `open` season past its registration close — or, when
    // registration_closes is unset, past its start DAY — is no longer
    // registerable and must not surface anywhere (the Founders' Tournament
    // sat in the catalog for weeks after it started). Only `open` rows are
    // gated: `active` seasons have started by definition and stay visible for
    // informational pages (standings, landing tabs). SQL twin of
    // isRegistrationClosed() in src/lib/programs/registration-window.ts.
    conditions.push(sql`NOT (
      ${seasons.status} = 'open' AND (
        (${seasons.registrationCloses} IS NOT NULL AND ${seasons.registrationCloses} <= now())
        OR (${seasons.registrationCloses} IS NULL AND ${seasons.startDate} < CURRENT_DATE)
      )
    )`);

    const rows = await db
      .select({
        season: seasons,
        program: programs,
        sport: sports,
        location: locations,
        ageGroup: ageGroups,
      })
      .from(seasons)
      .innerJoin(programs, eq(seasons.programId, programs.id))
      .innerJoin(sports, eq(programs.sportId, sports.id))
      .innerJoin(organizations, eq(organizations.id, sports.organizationId))
      .innerJoin(locations, eq(programs.locationId, locations.id))
      .leftJoin(ageGroups, eq(seasons.ageGroupId, ageGroups.id))
      .where(and(...conditions))
      // Secondary sort key: startDate ties (same-day seasons) are common on
      // the shared CI DB, and an unordered tiebreak silently picks a
      // different "featured" row across runs (repo multi-tenant query hazard).
      .orderBy(asc(seasons.startDate), asc(seasons.createdAt));

    // Get registration counts for all seasons
    const seasonIds = rows.map((r) => r.season.id);
    const regCounts = seasonIds.length > 0
      ? await db
          .select({
            seasonId: registrations.seasonId,
            count: sql<number>`count(*)::int`,
          })
          .from(registrations)
          .where(
            and(
              sql`${registrations.seasonId} IN (${sql.join(seasonIds.map(id => sql`${id}`), sql`, `)})`,
              sql`${registrations.status} IN ('pending', 'confirmed')`
            )
          )
          .groupBy(registrations.seasonId)
      : [];

    const countMap = new Map(regCounts.map((r) => [r.seasonId, r.count]));

    const formatted = rows.map((r) => {
      const registeredCount = countMap.get(r.season.id) || 0;
      const spotsLeft = r.season.maxParticipants
        ? Math.max(0, r.season.maxParticipants - registeredCount)
        : null;

      return {
        id: r.season.id,
        name: r.season.name,
        slug: r.season.slug,
        startDate: r.season.startDate,
        endDate: r.season.endDate,
        registrationCloses: r.season.registrationCloses,
        price: r.season.priceCents / 100,
        teamPrice: r.season.teamPriceCents != null ? r.season.teamPriceCents / 100 : null,
        signupModes: r.season.signupModes,
        deposit: r.season.depositCents ? r.season.depositCents / 100 : null,
        allowDeposit: r.season.allowDeposit,
        pricingMode: r.season.pricingMode,
        maxParticipants: r.season.maxParticipants,
        registeredCount,
        spotsLeft,
        scheduleNotes: r.season.scheduleNotes,
        termSlug: r.season.termSlug,
        termLabel: r.season.termLabel,
        divisionGender: r.season.divisionGender,
        skillLevel: r.season.skillLevel,
        dayOfWeek: r.season.dayOfWeek,
        startTime: r.season.startTime,
        endTime: r.season.endTime,
        status: r.season.status,
        signupMode: r.season.status === "forming" ? "interest" : "register",
        minAge: r.season.minAge,
        maxAge: r.season.maxAge,
        program: {
          id: r.program.id,
          name: r.program.name,
          slug: r.program.slug,
          programType: r.program.programType,
          audienceType: r.program.audienceType,
        },
        sport: {
          id: r.sport.id,
          name: r.sport.name,
          slug: r.sport.slug,
          icon: r.sport.icon,
          color: r.sport.color,
        },
        location: {
          id: r.location.id,
          name: r.location.name,
          slug: r.location.slug,
          city: r.location.city,
          state: r.location.state,
        },
        ageGroup: r.ageGroup
          ? {
              id: r.ageGroup.id,
              name: r.ageGroup.name,
              minAge: r.ageGroup.minAge,
              maxAge: r.ageGroup.maxAge,
            }
          : null,
      };
    });

    const ordered = [...formatted].sort((a, b) => {
      if (a.signupMode !== b.signupMode) {
        return a.signupMode === "register" ? -1 : 1;
      }
      return 0;
    });

    return new Response(JSON.stringify({ seasons: ordered }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        // Catalog changes a few times per season; let browsers reuse it
        // across page views for 5 min instead of refetching on every
        // marketing-page visit, and let the CDN absorb bursts for 10.
        // Cache key is the full URL incl. host, so tenants never share
        // entries; Netlify skips caching responses with Set-Cookie.
        "Cache-Control": "public, max-age=300, s-maxage=600",
      },
    });
  } catch (err) {
    console.error("Error fetching seasons:", err);
    return new Response(JSON.stringify({ seasons: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
};
