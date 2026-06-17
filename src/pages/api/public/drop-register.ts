import type { APIRoute } from "astro";
import { db } from "@/lib/db";
import { dropPlayers, dropSeasons } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { rateLimit, rateLimitedResponse } from "@/lib/auth/rate-limit";
import {
  lbsToGrams,
  feetInchesToCm,
  computeBmi,
  isEligibleBmi,
} from "@/lib/drop-league/health";
import { getPostHogServer } from "@/lib/posthog-server";
import { brandFromHost } from "@/lib/organization/soccerone-routing";
import { SERVER_EVENTS } from "@/lib/analytics/events";

const BodySchema = z.object({
  dropSeasonId: z.string().uuid(),
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  email: z.string().trim().toLowerCase().email().max(320),
  phone: z.string().trim().max(32).optional(),
  dob: z.string().trim().optional(), // YYYY-MM-DD
  heightFeet: z.number().int().min(4).max(8),
  heightInches: z.number().int().min(0).max(11),
  weightLbs: z.number().positive().max(600),
  consent: z.literal(true), // must be exactly true
});

export const POST: APIRoute = async ({ request, clientAddress, locals }) => {
  if (!db) {
    return new Response(JSON.stringify({ error: "Database unavailable" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }

  const ip = clientAddress || "unknown";
  const ipLimit = rateLimit(`drop-register:ip:${ip}`, 5, 60_000);
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

  const {
    dropSeasonId,
    firstName,
    lastName,
    email,
    phone,
    dob,
    heightFeet,
    heightInches,
    weightLbs,
  } = parsed.data;

  // Verify the drop season is open AND owned by the resolved tenant.
  // Fetch division at the same time so we can store it on the player row.
  const [season] = await db
    .select({ id: dropSeasons.id, division: dropSeasons.division })
    .from(dropSeasons)
    .where(
      and(
        eq(dropSeasons.id, dropSeasonId),
        eq(dropSeasons.organizationId, organization.id),
        eq(dropSeasons.status, "open"),
      ),
    )
    .limit(1);

  if (!season) {
    return new Response(
      JSON.stringify({ error: "Drop season not available" }),
      { status: 404, headers: { "Content-Type": "application/json" } },
    );
  }

  // Compute BMI from natural-unit inputs. All health values stay server-side.
  const heightCm = feetInchesToCm(heightFeet, heightInches);
  const weightG = lbsToGrams(weightLbs);
  const bmi = computeBmi(weightG, heightCm);

  if (!isEligibleBmi(bmi)) {
    // 422 — write nothing, reveal nothing about the user's measurements.
    return new Response(JSON.stringify({ error: "not_eligible" }), {
      status: 422,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Insert player row. Idempotent on (drop_season_id, lower(email)) via the
  // unique index defined in the schema — onConflictDoNothing makes re-submits
  // return 200 without duplicating the row.
  await db
    .insert(dropPlayers)
    .values({
      dropSeasonId: season.id,
      organizationId: organization.id,
      division: season.division,
      firstName,
      lastName,
      email,
      phone: phone ?? null,
      dob: dob ?? null,
      heightCm,
      seasonStartWeightG: weightG,
      currentWeightG: weightG,
      // numeric column expects a string; pass the rounded decimal string
      bmi: String(bmi),
      consentAt: new Date(),
      // status defaults to 'registered' via the schema default
    })
    .onConflictDoNothing();

  // Fire-and-forget analytics. Never echo health data; never block/fail the
  // registration on an analytics error.
  try {
    const posthog = getPostHogServer();
    posthog.capture({
      distinctId: email,
      event: SERVER_EVENTS.dropRegisterSubmitted,
      properties: {
        drop_season_id: dropSeasonId,
        brand: brandFromHost(request.headers.get("host") ?? ""),
      },
    });
  } catch {
    // analytics must never block or fail registration
  }

  // NEVER echo back weight or bmi in the response — health data is write-only.
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
