/**
 * GET /api/test/messaging-mock?to=<recipient>&channel=<sms|email>&since=<iso>&organizationId=<id>
 * DELETE /api/test/messaging-mock
 *
 * Test-only inspection endpoint for messages recorded by the MESSAGING_MOCK=1
 * dispatch-layer mock (src/lib/messaging/mock.ts). Lets API tests assert on
 * channel / recipient / body content without depending on a real Twilio or
 * Resend send.
 *
 * ONLY available when E2E_TEST_ENDPOINTS=yes (CI / local test runs) — same
 * gate as every other /api/test/** fixture endpoint (see
 * src/pages/api/test/org-fixtures.ts). Returns 404 otherwise.
 *
 * `to` is required on GET: the endpoint returns only messages sent to a
 * caller-known recipient rather than dumping the entire process-wide ring,
 * so one test/org's fixture can't read another's captured sends.
 */
import type { APIRoute } from "astro";
import {
  getMockMessages,
  clearMockMessages,
  isMessagingMockEnabled,
} from "@/lib/messaging/mock";

function notFound() {
  return new Response(JSON.stringify({ error: "Not found" }), {
    status: 404,
    headers: { "Content-Type": "application/json" },
  });
}

export const GET: APIRoute = async ({ url }) => {
  if (process.env.E2E_TEST_ENDPOINTS !== "yes") return notFound();

  const to = url.searchParams.get("to");
  if (!to) {
    return new Response(JSON.stringify({ error: "to param required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const channel = url.searchParams.get("channel") as "sms" | "email" | null;
  const organizationId = url.searchParams.get("organizationId");
  const since = url.searchParams.get("since");

  const messages = getMockMessages({
    to,
    channel: channel ?? undefined,
    organizationId: organizationId ?? undefined,
    since: since ?? undefined,
  });

  return new Response(
    JSON.stringify({ enabled: isMessagingMockEnabled(), messages }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
};

// Clears the process-wide ring. Rarely needed given tests run against a
// fresh dev server per CI run and vitest.config.ts sets fileParallelism:
// false, but available for a test that wants a guaranteed clean slate.
export const DELETE: APIRoute = async () => {
  if (process.env.E2E_TEST_ENDPOINTS !== "yes") return notFound();
  clearMockMessages();
  return new Response(JSON.stringify({ cleared: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
