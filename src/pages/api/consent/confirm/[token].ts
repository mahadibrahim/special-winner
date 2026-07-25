/**
 * GET /api/consent/confirm/[token]
 *
 * THE VERIFIED ACT for email — the exact counterpart of the SMS OTP.
 *
 * A kiosk tick captures INTENT: an `email_opt_ins` row written `pending`, with
 * its evidence (source + the literal sentence shown + when). It authorises
 * nothing, because a mounted iPad in a public lobby cannot know that the address
 * typed into it belongs to the person typing. The confirmation link is the proof
 * it does — it was delivered to that mailbox, so whoever clicks it holds it.
 *
 * Clicking therefore does three things, and nothing more:
 *   1. sets users.email_verified — marketing selects on it, so until now the
 *      address was structurally incapable of entering a list;
 *   2. promotes the captured intent, pending → opted_in;
 *   3. clears users.marketing_opted_out_at — but ONLY if (2) actually promoted
 *      something. Nothing granted, nothing cleared.
 *
 * THE GUARD (tests/api/consent/double-opt-in.test.ts). The promotion is scoped
 * to `status = 'pending'` AND the surface that captured it. Holding a mailbox is
 * not the same as withdrawing an unsubscribe: a link minted off a row that had
 * already opted OUT must not resurrect it. Same doctrine as
 * promotePendingPhoneConsents — a valid OTP does not undo a STOP.
 */
import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema/users";
import { verifyToken, consumeToken } from "@/lib/check-in/tokens-db";
import {
  promotePendingEmailConsents,
  KIOSK_SPECTATOR_SOURCE,
} from "@/lib/consents/marketing";

export const prerender = false;

type Status = "ok" | "expired" | "invalid";

const landing = (redirect: (path: string) => Response, status: Status) =>
  redirect(`/consent/confirmed?status=${status}`);

export const GET: APIRoute = async ({ params, redirect, clientAddress }) => {
  const value = params.token ?? "";
  const result = await verifyToken(value);

  if (!result.ok) {
    // A consumed token means the work below already ran — the customer clicking
    // their link twice is confirmed, not broken.
    if (result.reason === "consumed") return landing(redirect, "ok");
    return landing(redirect, result.reason === "expired" ? "expired" : "invalid");
  }

  const token = result.token;
  // Kind is what a polymorphic token table is scoped by — a check-in token must
  // not double as a consent grant.
  if (token.kind !== "email_consent" || !token.recipientEmail) {
    return landing(redirect, "invalid");
  }

  const db = getDb();

  const promoted = await promotePendingEmailConsents({
    db,
    organizationId: token.organizationId,
    email: token.recipientEmail,
    source: KIOSK_SPECTATOR_SOURCE,
  });

  if (token.recipientUserId) {
    // The click proves the mailbox is theirs, whatever the consent row says —
    // so the address is verified either way. The UNSUBSCRIBE is a different
    // question: it is only cleared when this click actually granted something.
    await db
      .update(users)
      .set({
        emailVerified: true,
        ...(promoted > 0 ? { marketingOptedOutAt: null } : {}),
        updatedAt: new Date(),
      })
      .where(eq(users.id, token.recipientUserId));
  }

  await consumeToken(token.id, clientAddress || null);

  return landing(redirect, "ok");
};
