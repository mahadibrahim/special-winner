/**
 * POST /api/admin/check-in/send-link
 * Body: { kind, targetId, channel: "email" | "sms" | "qr" }
 *
 * Mints (or reuses) a token, dispatches via Resend / Twilio / returns URL
 * for client-side QR rendering. Returns the URL + masked recipient.
 */
import type { APIRoute } from "astro";
import { requireOrgAdminAccess } from "@/lib/auth/roles";
import { mintToken } from "@/lib/check-in/tokens-db";
import { resolveSigner, type SelfServiceKind } from "@/lib/check-in/resolve-signer";
import { sendSms } from "@/lib/sms/send";
import { sendEmail } from "@/lib/email/index";
import { formatPhone } from "@/lib/phone";

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
  "walkin_session",
];
const VALID_CHANNELS = ["email", "sms", "qr"] as const;
type Channel = (typeof VALID_CHANNELS)[number];

function maskEmail(e: string | null): string | null {
  if (!e) return null;
  const [user, domain] = e.split("@");
  if (!domain) return e;
  return `${user[0] ?? "a"}***@${domain}`;
}
function maskPhone(p: string | null): string | null {
  if (!p) return null;
  const f = formatPhone(p);
  return f.replace(/^(\(\d{3}\)) \d{3}/, "$1 ***");
}

export const POST: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;
  const orgId = auth.organizationId;

  let body: { kind?: string; targetId?: string; channel?: string };
  try {
    body = await context.request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  const kind = body.kind as SelfServiceKind;
  const channel = body.channel as Channel;
  const targetId = body.targetId;
  if (!kind || !VALID_KINDS.includes(kind))
    return json({ error: "kind must be one of: " + VALID_KINDS.join(", ") }, 400);
  if (!VALID_CHANNELS.includes(channel))
    return json({ error: "channel must be email | sms | qr" }, 400);
  if (!targetId) return json({ error: "targetId required" }, 400);

  const signer = await resolveSigner(kind, targetId, orgId);
  if (!signer) return json({ error: "Target not found" }, 404);

  if (channel === "email" && !signer.recipientEmail)
    return json({ error: "No email on file for the signer" }, 422);
  if (channel === "sms" && !signer.recipientPhone)
    return json({ error: "No phone on file for the signer" }, 422);

  // walkin_session is the pay-link kind PayCard actually serves — its hold
  // (and its own original token, minted by walkin/start.ts) both live for
  // 2h, not the default 6h. Pass the same TTL here so a resend that has to
  // mint fresh (the rare case where the original token already expired)
  // doesn't outlive the hold it pays for. mintToken reuses the live token
  // from walkin/start.ts in the ordinary case, so this only matters on the
  // fresh-mint fallback path.
  const token = await mintToken({
    kind,
    targetId,
    organizationId: orgId,
    venueId: null,
    sentVia: channel,
    recipientUserId: signer.recipientUserId,
    recipientEmail: signer.recipientEmail,
    recipientPhone: signer.recipientPhone,
    createdByUserId: auth.user.id,
    ...(kind === "walkin_session" ? { ttlHours: 2 } : {}),
  });

  const appUrl = import.meta.env.PUBLIC_APP_URL ?? "http://localhost:4321";
  const url = `${appUrl}/self-serve/${token.token}`;

  // walkin_session's link collects payment (PayCard) alongside waiver +
  // photo — say so honestly. The other kinds (regular drop-in bookings,
  // field rentals, roster entries) never mint a pending-payment token, so
  // their copy stays waiver/photo-only.
  const isPayLink = kind === "walkin_session";
  // GREET THE PERSON RECEIVING THE MESSAGE, NOT THE PARTICIPANT. For a minor,
  // resolveSigner's `displayName` is the CHILD (it names who the self-serve
  // page is about) while recipientPhone/recipientEmail — where this message is
  // going — belong to the PARENT. `signerName` is the human on the other end
  // of this channel; that's who "Hi <name>" must address.
  const greetName = signer.signerName;
  const emailSubject = isPayLink
    ? "Complete payment to keep your spot"
    : "Finish your booking — quick waiver and photo";
  const emailBody = isPayLink
    ? `<p>Hi ${greetName},</p><p>Your spot is being held. <a href="${url}">Tap here to sign, add a photo, and pay</a> to keep it.</p><p>The hold lasts 2 hours from when it was created — link expires in 2 hours.<br>— Aspire Sports</p>`
    : `<p>Hi ${greetName},</p><p>A few quick items remain for your booking. <a href="${url}">Tap here to finish</a>.</p><p>Link expires in 6 hours.<br>— Aspire Sports</p>`;
  const emailText = isPayLink
    ? `Hi ${greetName},\n\nYour spot is being held. Tap below to sign, add a photo, and pay to keep it:\n${url}\n\nThe hold lasts 2 hours from when it was created — link expires in 2 hours.\n— Aspire Sports`
    : `Hi ${greetName},\n\nA few quick items remain for your booking. Tap below to finish:\n${url}\n\nLink expires in 6 hours.\n— Aspire Sports`;
  const smsBody = isPayLink
    ? `${greetName}: your spot is held for 2 hours — sign, add a photo, and pay here: ${url}`
    : `${greetName}: finish your Aspire Sports booking (waiver + photo): ${url}`;

  if (channel === "email") {
    const r = await sendEmail({
      to: signer.recipientEmail!,
      subject: emailSubject,
      html: emailBody,
      text: emailText,
    });
    if (!r.success) {
      return json(
        { error: r.error ?? "Email send failed" },
        r.error?.includes("not configured") ? 503 : 502,
      );
    }
  } else if (channel === "sms") {
    const smsResult = await sendSms({
      to: signer.recipientPhone!,
      body: smsBody,
      organizationId: orgId,
    });
    if (!smsResult.ok) {
      return json(
        { error: `SMS not sent: ${smsResult.reason}` },
        smsResult.reason === "not_configured" ? 503 : 422,
      );
    }
  }

  return json(
    {
      url,
      expiresAt: token.expiresAt,
      channel,
      recipient:
        channel === "email"
          ? maskEmail(signer.recipientEmail)
          : channel === "sms"
            ? maskPhone(signer.recipientPhone)
            : null,
    },
    200,
  );
};
