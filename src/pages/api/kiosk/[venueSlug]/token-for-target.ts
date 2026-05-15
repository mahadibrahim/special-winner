/**
 * POST /api/kiosk/[venueSlug]/token-for-target
 * Body: { kind, targetId }
 *
 * Unauthenticated kiosk endpoint. Resolves the venue from the slug,
 * looks up who the signer is (via resolveSigner), mints (or reuses) a
 * self-service token, and returns the URL + expiry. The kiosk tab then
 * opens the URL for the customer to self-serve on.
 */
import type { APIRoute } from "astro";
import { requireKioskVenue } from "@/lib/check-in/kiosk-auth";
import { resolveSigner, type SelfServiceKind } from "@/lib/check-in/resolve-signer";
import { mintToken } from "@/lib/check-in/tokens-db";

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

export const POST: APIRoute = async ({ params, request }) => {
  const slug = params.venueSlug ?? "";
  const kioskResult = await requireKioskVenue(slug);
  if (!kioskResult.ok) return kioskResult.response;
  const { venue } = kioskResult;

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

  const signer = await resolveSigner(kind, targetId);
  if (!signer) return json({ error: "Target not found" }, 404);

  const token = await mintToken({
    kind,
    targetId,
    organizationId: venue.organizationId,
    venueId: venue.id,
    sentVia: "kiosk_search",
    recipientUserId: signer.recipientUserId,
    recipientEmail: signer.recipientEmail,
    recipientPhone: signer.recipientPhone,
    createdByUserId: null,
  });

  const appUrl = import.meta.env.PUBLIC_APP_URL ?? "http://localhost:4321";
  const url = `${appUrl}/self-serve/${token.token}`;

  return json({ url, expiresAt: token.expiresAt }, 200);
};
