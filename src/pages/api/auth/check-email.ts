import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { rateLimit } from "@/lib/auth/rate-limit";

// Per-IP rate limit: 10 requests per 60s. The endpoint's only purpose is UX
// hinting, and we fail-open if the limiter trips so the wizard never blocks.
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 10;

const emailSchema = z.string().email();

export const GET: APIRoute = async ({ url, clientAddress }) => {
  const email = url.searchParams.get("email") ?? "";
  const ip = clientAddress || "unknown";

  const limit = rateLimit(`check-email:${ip}`, MAX_PER_WINDOW, WINDOW_MS);
  if (!limit.allowed) {
    // Fail-open on UX endpoint: still return a non-erroring shape, just hint
    // we threw the request away. Caller doesn't surface this.
    return new Response(JSON.stringify({ exists: false }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "x-ratelimit-exceeded": "1",
      },
    });
  }

  const parsed = emailSchema.safeParse(email);
  if (!parsed.success) {
    return new Response(JSON.stringify({ exists: false }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const normalized = parsed.data.toLowerCase().trim();
  const found = await getDb()
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, normalized))
    .limit(1);

  return new Response(JSON.stringify({ exists: found.length > 0 }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
