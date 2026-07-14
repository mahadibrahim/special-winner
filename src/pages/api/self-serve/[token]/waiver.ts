/**
 * POST /api/self-serve/[token]/waiver
 *
 * Body: { acceptedName: string }
 *
 * Marks the waiver accepted on the underlying booking/rental row, then
 * appends a consents audit row when a family_member is available AND the
 * token carries a recipientUserId (both NOT NULL in the consents schema).
 *
 * For adult drop-in, rental, and walk-in paths the waiverSigned* columns
 * on the booking/rental row are the authoritative audit record. The
 * consents table insert is for roster_entry minors only in v1.
 */
import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { dropInBookings } from "@/lib/db/schema/drop-in";
import { fieldRentals } from "@/lib/db/schema/field-rentals";
import { consents } from "@/lib/db/schema/consents";
import { verifyToken } from "@/lib/check-in/tokens-db";
import { resolveSigner, asSelfServiceKind } from "@/lib/check-in/resolve-signer";

export const prerender = false;

const json = (b: unknown, s: number) =>
  new Response(JSON.stringify(b), {
    status: s,
    headers: { "Content-Type": "application/json" },
  });

export const POST: APIRoute = async ({ params, request }) => {
  const tokenValue = params.token;
  if (!tokenValue) return json({ error: "Token required" }, 400);

  const v = await verifyToken(tokenValue);
  if (!v.ok) {
    const status =
      v.reason === "expired" || v.reason === "consumed" ? 410 : 404;
    return json({ error: v.reason }, status);
  }
  const tok = v.token;
  // A marketing-consent token is not a waiver target.
  const kind = asSelfServiceKind(tok.kind);
  if (!kind) return json({ error: "not_found" }, 404);

  let body: { acceptedName?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const acceptedName = (body.acceptedName ?? "").trim();
  if (acceptedName.length === 0) {
    return json({ error: "acceptedName is required" }, 422);
  }

  const now = new Date();
  const db = getDb();

  if (tok.kind === "drop_in_booking" || tok.kind === "walkin_session") {
    await db
      .update(dropInBookings)
      .set({
        waiverSigned: true,
        waiverSignedAt: now,
        waiverSignedBy: acceptedName,
        updatedAt: now,
      })
      .where(eq(dropInBookings.id, tok.targetId));
  } else if (tok.kind === "field_rental") {
    await db
      .update(fieldRentals)
      .set({
        waiverSigned: true,
        waiverSignedAt: now,
        waiverSignedBy: acceptedName,
        updatedAt: now,
      })
      .where(eq(fieldRentals.id, tok.targetId));
  } else if (tok.kind === "roster_entry") {
    // Registration-time waiver is already captured at sign-up. Return
    // idempotent success for the v1 UI flow; the consents insert below
    // will fire if a familyMemberId and recipientUserId are resolvable.
  }

  // Append a consents audit row.
  // Both familyMemberId and signedByUserId are NOT NULL in the consents schema,
  // so we gate this insert on both being present.
  try {
    const signer = await resolveSigner(kind, tok.targetId, tok.organizationId);
    const signerUserId = signer?.recipientUserId ?? tok.recipientUserId;
    if (signer?.familyMemberId && signerUserId) {
      // Liability consents expire after 365 days (per the schema comment).
      const expiresAt = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
      await db.insert(consents).values({
        familyMemberId: signer.familyMemberId,
        type: "liability",
        status: "granted",
        signedByUserId: signerUserId,
        signedByName: acceptedName,
        signedAt: now,
        expiresAt,
        contentHash: "v1-liability-2026-05-15",
      });
    }
  } catch (err) {
    // Audit-row failure must not block the user. Log and continue.
    console.error("[self-serve.waiver] consents insert failed", err);
  }

  return json({ ok: true, waiverSignedAt: now.toISOString() }, 200);
};
