/**
 * POST /api/kiosk/[locationSlug]/token-for-target
 * Body: { kind, targetId }
 *
 * Unauthenticated kiosk endpoint. Resolves the facility from the slug,
 * looks up who the signer is (via resolveSigner), mints (or reuses) a
 * self-service token, and returns { token, url, expiresAt }. The kiosk tab
 * never navigates: it consumes `token` and renders the self-serve cards
 * inline (see KioskRoot). `url` is kept for back-compat with off-device
 * callers (e.g. a texted/emailed link) and has no current in-kiosk consumer.
 */
import type { APIRoute } from "astro";
import { requireKioskLocation } from "@/lib/check-in/kiosk-auth";
import { resolveSigner, type SelfServiceKind } from "@/lib/check-in/resolve-signer";
import { mintToken } from "@/lib/check-in/tokens-db";
import { rateLimit, rateLimitedResponse } from "@/lib/auth/rate-limit";

export const prerender = false;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const VALID_KINDS: SelfServiceKind[] = [
  "drop_in_booking",
  "field_rental",
  "roster_entry",
];

export const POST: APIRoute = async ({ params, request, clientAddress, locals }) => {
  const slug = params.locationSlug ?? "";

  // Unauthenticated, on the public internet, and it MINTS A REAL SELF-SERVE
  // TOKEN for any targetId — a token that can sign that person's waiver and
  // write their photo. Throttle per IP+location, same helper and 429 shape as
  // the walk-in endpoints. (In-memory/fail-open limiter — see rate-limit.ts.)
  //
  // WHY 60/min AND NOT LOWER: a facility is ONE egress IP, so this bucket is
  // shared by the whole building — the limit is customers-per-minute for the
  // lobby, not per person. At 10/min a 6pm check-in queue trips it and the
  // kiosk dead-ends at "Couldn't open (429)" for the person at the front of
  // the line. The anti-enumeration value lives in /search — that is the
  // endpoint an attacker must walk to DISCOVER a targetId in the first place,
  // and its limit stays tight. Throttling this one hard buys little and costs
  // real customers. Do not "harden" it back down.
  const ip = clientAddress || "unknown";
  const ipLimit = rateLimit(`kiosk-token-for-target:${slug}:${ip}`, 60, 60_000);
  if (!ipLimit.allowed) {
    return rateLimitedResponse(ipLimit.retryAfter ?? 60);
  }

  const kioskResult = await requireKioskLocation(
    slug,
    locals.organization?.id ?? null,
  );
  if (!kioskResult.ok) return kioskResult.response;
  const { location } = kioskResult;

  let body: { kind?: string; targetId?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const kind = body.kind as SelfServiceKind;
  const targetId = body.targetId;

  if (!kind || !VALID_KINDS.includes(kind)) {
    return json({ error: "kind must be one of: " + VALID_KINDS.join(", ") }, 400);
  }
  if (!targetId) {
    return json({ error: "targetId required" }, 400);
  }

  const signer = await resolveSigner(kind, targetId, location.organizationId);
  if (!signer) return json({ error: "Target not found" }, 404);

  const token = await mintToken({
    kind,
    targetId,
    organizationId: location.organizationId,
    // The kiosk is facility-scoped — the token carries no single venue.
    venueId: null,
    sentVia: "kiosk_search",
    recipientUserId: signer.recipientUserId,
    recipientEmail: signer.recipientEmail,
    recipientPhone: signer.recipientPhone,
    createdByUserId: null,
  });

  // Relative path on purpose: the kiosk tab redirects within the same
  // origin it is served from. An absolute PUBLIC_APP_URL would send the
  // customer to the wrong host in any non-prod environment (and force a
  // needless apex/www hop in prod). Links delivered off-device — SMS or
  // email — are built absolutely by the send-link endpoint instead.
  const url = `/self-serve/${token.token}`;

  // `token` is what the kiosk actually consumes now — it renders the
  // self-serve cards INLINE rather than navigating the tab to `url`. `url`
  // stays for back-compat with any caller that still wants a link.
  return json({ token: token.token, url, expiresAt: token.expiresAt }, 200);
};
