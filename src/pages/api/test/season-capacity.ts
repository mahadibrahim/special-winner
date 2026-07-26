import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { seasons } from "@/lib/db/schema";

/**
 * Test-only fixture endpoint: set an e2e season's maxParticipants.
 *
 * Why this exists: the shared staging/CI database accumulates registrations
 * forever, and every branch's `db:seed:e2e` re-asserts whatever capacity ITS
 * copy of the seed carries — so a capacity bump in one branch's seed is
 * re-clamped by the next CI run from any other branch. Specs that must
 * exercise the PAID registration path (payment-confirmation.spec.ts) call
 * this in beforeAll to guarantee headroom regardless of which seed ran last.
 *
 * ONLY available when E2E_TEST_ENDPOINTS=yes (CI / local test runs) — same
 * gate as every other /api/test/** fixture endpoint (see org-fixtures.ts).
 * Returns 404 otherwise. Restricted to `e2e-` fixture slugs so it can never
 * touch a real season even on a misconfigured server.
 */
export const POST: APIRoute = async ({ request }) => {
  if (process.env.E2E_TEST_ENDPOINTS !== "yes") {
    return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });
  }

  let body: { slug?: unknown; maxParticipants?: unknown };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400 });
  }

  const slug = typeof body.slug === "string" ? body.slug : "";
  const maxParticipants =
    typeof body.maxParticipants === "number" &&
    Number.isInteger(body.maxParticipants) &&
    body.maxParticipants > 0
      ? body.maxParticipants
      : null;

  if (!slug.startsWith("e2e-") || maxParticipants === null) {
    return new Response(
      JSON.stringify({ error: "slug must start with 'e2e-' and maxParticipants must be a positive integer" }),
      { status: 400 },
    );
  }

  const updated = await getDb()
    .update(seasons)
    .set({ maxParticipants })
    .where(eq(seasons.slug, slug))
    .returning({ id: seasons.id, maxParticipants: seasons.maxParticipants });

  return new Response(JSON.stringify({ updated: updated.length, maxParticipants }), {
    status: 200,
  });
};
