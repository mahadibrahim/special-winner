import type { APIRoute } from "astro";
import { db } from "@/lib/db";
import {
  seasonInterest,
  newsletterSignups,
  seasons,
  programs,
  sports,
  organizations,
} from "@/lib/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { rateLimit, rateLimitedResponse } from "@/lib/auth/rate-limit";
import { getPostHogServer } from "@/lib/posthog-server";
import { SERVER_EVENTS } from "@/lib/analytics/events";
import { sendSeasonInterestOpsAlert } from "@/lib/email/send";

const BodySchema = z.object({
  seasonId: z.string().uuid(),
  email: z.string().trim().toLowerCase().email().max(320),
  firstName: z.string().trim().max(100).optional(),
});

export const POST: APIRoute = async ({ request, clientAddress, locals }) => {
  if (!db) {
    return new Response(JSON.stringify({ error: "Database unavailable" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }

  const ip = clientAddress || "unknown";
  const ipLimit = rateLimit(`season-interest:ip:${ip}`, 5, 60_000);
  if (!ipLimit.allowed) {
    return rateLimitedResponse(ipLimit.retryAfter ?? 60);
  }

  let parsed;
  try {
    parsed = BodySchema.safeParse(await request.json());
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ error: "Invalid input", issues: parsed.error.issues }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const organization = locals.organization;
  if (!organization) {
    return new Response(
      JSON.stringify({ error: "Organization context required" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const { seasonId, email, firstName } = parsed.data;

  // Verify the season is forming AND owned by the resolved tenant. The season's
  // org is reached via program → sport → organization. Anything else → 404
  // (don't leak existence).
  const owned = await db
    .select({
      id: seasons.id,
      seasonName: seasons.name,
      termLabel: seasons.termLabel,
      programName: programs.name,
    })
    .from(seasons)
    .innerJoin(programs, eq(seasons.programId, programs.id))
    .innerJoin(sports, eq(programs.sportId, sports.id))
    .innerJoin(organizations, eq(organizations.id, sports.organizationId))
    .where(
      and(
        eq(seasons.id, seasonId),
        eq(seasons.status, "forming"),
        eq(organizations.id, organization.id),
        eq(organizations.status, "active"),
      ),
    )
    .limit(1);

  if (owned.length === 0) {
    return new Response(JSON.stringify({ error: "Season not available" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Per-division interest — idempotent on (season, lower(email)).
  // `returning` distinguishes a genuinely new hand-raise from a repeat
  // submit: analytics and the ops ping fire only for new rows, so a
  // double-click can't double-notify or inflate the demand signal (#543).
  const inserted = await db
    .insert(seasonInterest)
    .values({ seasonId, organizationId: organization.id, email, firstName })
    .onConflictDoNothing()
    .returning({ id: seasonInterest.id });

  if (inserted.length > 0) {
    const season = owned[0];

    // Fire-and-forget analytics — same shape as drop-register's server
    // capture. Never block or fail the submission on an analytics error.
    try {
      getPostHogServer().capture({
        distinctId: email,
        event: SERVER_EVENTS.seasonInterestSubmitted,
        properties: {
          season_id: seasonId,
          season_name: season.seasonName,
          term: season.termLabel,
          program_name: season.programName,
        },
      });
    } catch {
      // analytics must never block the submission
    }

    // Ops ping (#543: interest was write-only — stored, surfaced nowhere).
    // Fire-and-forget for the same reason.
    try {
      const [{ count }] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(seasonInterest)
        .where(eq(seasonInterest.seasonId, seasonId));
      await sendSeasonInterestOpsAlert({
        email,
        firstName: firstName ?? null,
        seasonName: season.seasonName,
        programName: season.programName,
        seasonInterestTotal: count,
      });
    } catch (err) {
      console.error("[season-interest] ops alert failed (submission stored):", err);
    }
  }

  // Also feed the general marketing list (unique on email → upsert).
  await db
    .insert(newsletterSignups)
    .values({
      organizationId: organization.id,
      email,
      firstName,
      source: "interest-list",
    })
    .onConflictDoUpdate({
      target: newsletterSignups.email,
      set: {
        firstName: sql`COALESCE(EXCLUDED.first_name, ${newsletterSignups.firstName})`,
        updatedAt: sql`now()`,
      },
    });

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
