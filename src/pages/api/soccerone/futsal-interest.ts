import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { futsalInterest } from "@/lib/db/schema/futsal-interest";
import { rateLimit, rateLimitedResponse } from "@/lib/auth/rate-limit";

export const prerender = false;

const json = (b: unknown, s: number) =>
  new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const POST: APIRoute = async ({ request, clientAddress, locals }) => {
  // Per-IP burst limit — this is an unauthenticated public write endpoint;
  // cap it so a script can't flood the futsal_interest table.
  const ip = clientAddress || "unknown";
  const ipLimit = rateLimit(`futsal-interest:ip:${ip}`, 5, 60_000);
  if (!ipLimit.allowed) {
    return rateLimitedResponse(ipLimit.retryAfter ?? 60);
  }

  let body: { email?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  const email = (body.email ?? "").trim();
  if (!email || email.length > 320 || !EMAIL_RX.test(email)) {
    return json({ error: "A valid email is required" }, 422);
  }
  await getDb()
    .insert(futsalInterest)
    .values({
      organizationId: locals.organization?.id ?? null,
      email,
      emailCanonical: email.toLowerCase(),
      source: "rent_page",
    })
    .onConflictDoNothing({ target: futsalInterest.emailCanonical });
  return json({ ok: true }, 200);
};
