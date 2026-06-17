import type { APIRoute } from "astro";
import { db } from "@/lib/db";
import { newsletterSignups } from "@/lib/db/schema";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { rateLimit, rateLimitedResponse } from "@/lib/auth/rate-limit";
import { sendCaptureIncentiveEmail } from "@/lib/email/send";
import { sourceTriggersIncentive } from "@/lib/marketing/capture-incentive";

const BodySchema = z.object({
  email: z.string().trim().toLowerCase().email().max(320),
  firstName: z.string().trim().max(100).optional(),
  audience: z.enum(["parent", "adult"]).optional(),
  locationInterest: z.string().trim().max(100).optional(),
  source: z.string().trim().max(50).optional(),
  brand: z.enum(["aspire", "soccerone"]).optional(),
  src: z.string().trim().max(80).optional(),
});

export const POST: APIRoute = async ({ request, clientAddress, locals }) => {
  if (!db) {
    return new Response(
      JSON.stringify({ error: "Database unavailable" }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    );
  }

  // Per-IP burst limit — this is an unauthenticated public write endpoint;
  // cap it so a script can't flood the signups table.
  const ip = clientAddress || "unknown";
  const ipLimit = rateLimit(`newsletter:ip:${ip}`, 5, 60_000);
  if (!ipLimit.allowed) {
    return rateLimitedResponse(ipLimit.retryAfter ?? 60);
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

  const organization = locals.organization;
  if (!organization) {
    return new Response(
      JSON.stringify({ error: "Organization context required" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const { email, firstName, audience, locationInterest, source, brand, src } =
    parsed.data;
  const notes = src ? `flyer:${src}` : undefined;

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
        notes,
        organizationId: organization.id,
      })
      .onConflictDoUpdate({
        target: newsletterSignups.email,
        set: {
          firstName: sql`COALESCE(EXCLUDED.first_name, ${newsletterSignups.firstName})`,
          audience: sql`COALESCE(EXCLUDED.audience, ${newsletterSignups.audience})`,
          locationInterest: sql`COALESCE(EXCLUDED.location_interest, ${newsletterSignups.locationInterest})`,
          source: sql`COALESCE(EXCLUDED.source, ${newsletterSignups.source})`,
          notes: sql`COALESCE(EXCLUDED.notes, ${newsletterSignups.notes})`,
          organizationId: organization.id,
          updatedAt: new Date(),
        },
      });

    if (sourceTriggersIncentive(source)) {
      // Deliver the discount code (deduped per address inside the helper).
      // Awaited — fire-and-forget promises can be killed when the serverless
      // function returns. Failures are swallowed: the signup is already
      // stored and must not 500 because Resend hiccuped.
      try {
        await sendCaptureIncentiveEmail({ recipientEmail: email, brand });
      } catch (err) {
        console.error("[newsletter] incentive email failed", err);
      }
    }

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
