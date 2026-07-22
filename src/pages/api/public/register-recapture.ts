import type { APIRoute } from "astro";
import { z } from "zod";
import { db } from "@/lib/db";
import { seasons, programs, sports, organizations } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { rateLimit, rateLimitedResponse } from "@/lib/auth/rate-limit";
import { brandFromHost } from "@/lib/organization/soccerone-routing";
import { sendInappRecaptureEmail } from "@/lib/email/send";

const BodySchema = z.object({
  seasonId: z.string().uuid(),
  email: z.string().trim().toLowerCase().email().max(320),
});

// In-app-browser escape banner "email yourself a link" disclosure. The
// visitor is stuck in an Instagram/Facebook webview mid-registration and
// wants a plain link to finish on their own device's browser — no account
// or session required, so this is a public, unauthenticated endpoint.
//
// Always responds { sent: true } on valid input, including when email_logs
// dedupe silently suppressed a resend — the response must never become an
// oracle for "does this email already have an account" or "did we already
// email this address."
export const POST: APIRoute = async ({ request, clientAddress }) => {
  if (!db) {
    return new Response(JSON.stringify({ error: "Database unavailable" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Per-IP throttle: unauthenticated public endpoint that triggers an email
  // send, so it's a spam/abuse surface. 5/min/IP matches the other public
  // recapture-adjacent endpoints (season-interest, guest-checkout).
  const ip = clientAddress || "unknown";
  const ipLimit = rateLimit(`register-recapture:ip:${ip}`, 5, 60_000);
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

  const { seasonId, email } = parsed.data;

  // Storefront the request came through — brands share one org and one
  // Stripe account, so the request host is the only brand signal (mirrors
  // guest-checkout.ts).
  const brand = brandFromHost(request.headers.get("host") ?? "");

  const [row] = await db
    .select({ seasonName: seasons.name, programName: programs.name })
    .from(seasons)
    .innerJoin(programs, eq(seasons.programId, programs.id))
    .innerJoin(sports, eq(programs.sportId, sports.id))
    .innerJoin(organizations, eq(organizations.id, sports.organizationId))
    .where(and(eq(seasons.id, seasonId), eq(organizations.status, "active")))
    .limit(1);

  if (!row) {
    return new Response(JSON.stringify({ error: "Season not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  await sendInappRecaptureEmail({
    email,
    seasonId,
    seasonName: `${row.programName} - ${row.seasonName}`,
    brand,
  });

  // Always { sent: true } — success, failure, and dedupe-suppressed all look
  // identical to the caller (see module doc comment above).
  return new Response(JSON.stringify({ sent: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
