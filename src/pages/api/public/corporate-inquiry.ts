import type { APIRoute } from "astro";
import { db } from "@/lib/db";
import { corporateInquiries } from "@/lib/db/schema";
import { z } from "zod";
import { rateLimit, rateLimitedResponse } from "@/lib/auth/rate-limit";

const BodySchema = z.object({
  companyName: z.string().trim().min(1).max(255),
  contactName: z.string().trim().min(1).max(200),
  contactEmail: z.string().trim().toLowerCase().email().max(320),
  contactPhone: z.string().trim().max(30).optional(),
  companySize: z.enum(["1-10", "11-50", "51-200", "200+"]).optional(),
  estimatedTeams: z.number().int().min(1).max(1000).optional(),
  sportInterest: z.string().trim().max(100).optional(),
  preferredLocation: z.string().trim().max(100).optional(),
  preferredStart: z.string().trim().max(100).optional(),
  notes: z.string().trim().max(2000).optional(),
});

export const POST: APIRoute = async ({ request, clientAddress }) => {
  if (!db) {
    return new Response(
      JSON.stringify({ error: "Database unavailable" }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    );
  }

  // Per-IP burst limit — this is an unauthenticated public write endpoint;
  // cap it so a script can't flood the inquiries table.
  const ip = clientAddress || "unknown";
  const ipLimit = rateLimit(`corporate-inquiry:ip:${ip}`, 5, 60_000);
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

  try {
    await db.insert(corporateInquiries).values({
      ...parsed.data,
      status: "new",
    });

    return new Response(
      JSON.stringify({ ok: true }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[corporate-inquiry] insert failed", err);
    return new Response(
      JSON.stringify({ error: "Could not save inquiry" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
};
