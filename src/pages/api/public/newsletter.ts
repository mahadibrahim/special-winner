import type { APIRoute } from "astro";
import { db } from "@/lib/db";
import { newsletterSignups } from "@/lib/db/schema";
import { sql } from "drizzle-orm";
import { z } from "zod";

const BodySchema = z.object({
  email: z.string().trim().toLowerCase().email().max(320),
  firstName: z.string().trim().max(100).optional(),
  audience: z.enum(["parent", "adult"]).optional(),
  locationInterest: z.string().trim().max(100).optional(),
  source: z.string().trim().max(50).optional(),
});

export const POST: APIRoute = async ({ request }) => {
  if (!db) {
    return new Response(
      JSON.stringify({ error: "Database unavailable" }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    );
  }

  let parsed;
  try {
    const body = await request.json();
    parsed = BodySchema.safeParse(body);
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid JSON body" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  if (!parsed.success) {
    return new Response(
      JSON.stringify({ error: "Invalid input", issues: parsed.error.issues }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const { email, firstName, audience, locationInterest, source } = parsed.data;

  try {
    // Upsert by email — re-submissions update audience/location, never duplicate.
    await db
      .insert(newsletterSignups)
      .values({
        email,
        firstName,
        audience,
        locationInterest,
        source: source ?? "footer",
      })
      .onConflictDoUpdate({
        target: newsletterSignups.email,
        set: {
          firstName: sql`COALESCE(EXCLUDED.first_name, ${newsletterSignups.firstName})`,
          audience: sql`COALESCE(EXCLUDED.audience, ${newsletterSignups.audience})`,
          locationInterest: sql`COALESCE(EXCLUDED.location_interest, ${newsletterSignups.locationInterest})`,
          source: sql`COALESCE(EXCLUDED.source, ${newsletterSignups.source})`,
          updatedAt: new Date(),
        },
      });

    return new Response(
      JSON.stringify({ ok: true }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[newsletter] insert failed", err);
    return new Response(
      JSON.stringify({ error: "Could not save signup" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
};
