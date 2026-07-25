/**
 * GET /api/test/phone-opt-ins?phone=<E.164>
 *
 * Test-only endpoint that returns the phone_opt_ins rows for a phone number,
 * so API tests can assert the consent-checkbox → opt-in plumbing (see
 * src/lib/sms/opt-in.ts) without direct DB access.
 *
 * ONLY available when E2E_TEST_ENDPOINTS=yes (CI / local test runs).
 * Returns 404 otherwise — same gating rationale as org-fixtures.ts.
 */

import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { phoneOptIns } from "@/lib/db/schema/phone-verifications";
import { normalizeUsPhone } from "@/lib/sms/send";

export const GET: APIRoute = async ({ url }) => {
  if (process.env.E2E_TEST_ENDPOINTS !== "yes") {
    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const phoneParam = url.searchParams.get("phone");
  const phone = phoneParam ? normalizeUsPhone(phoneParam) : null;
  if (!phone) {
    return new Response(
      JSON.stringify({ error: "valid phone param required" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const rows = await getDb()
    .select({
      organizationId: phoneOptIns.organizationId,
      channel: phoneOptIns.channel,
      status: phoneOptIns.status,
      optInSource: phoneOptIns.optInSource,
      optedInAt: phoneOptIns.optedInAt,
      optedOutAt: phoneOptIns.optedOutAt,
    })
    .from(phoneOptIns)
    .where(eq(phoneOptIns.phone, phone));

  return new Response(JSON.stringify({ phone, optIns: rows }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
