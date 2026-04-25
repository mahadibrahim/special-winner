import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";

// Per-IP rate limiter: 10 requests per 60s, in-memory.
// Process-local; that's fine — the endpoint's only purpose is UX hinting,
// and we fail-open if rate-limited so the wizard never blocks on this.
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 10;
const buckets = new Map<string, number[]>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const arr = (buckets.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (arr.length >= MAX_PER_WINDOW) {
    buckets.set(ip, arr);
    return true;
  }
  arr.push(now);
  buckets.set(ip, arr);
  return false;
}

const emailSchema = z.string().email();

export const GET: APIRoute = async ({ url, clientAddress }) => {
  const email = url.searchParams.get("email") ?? "";
  const ip = clientAddress || "unknown";

  if (isRateLimited(ip)) {
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
