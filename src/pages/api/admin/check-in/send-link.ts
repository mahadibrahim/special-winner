/**
 * POST /api/admin/check-in/send-link
 * Body: { kind, targetId, channel: "email" | "sms" | "qr" }
 *
 * Mints (or reuses) a token, dispatches via Resend / Twilio / returns URL
 * for client-side QR rendering. Returns the URL + masked recipient.
 */
import type { APIRoute } from "astro";
import { requireAdminAccess } from "@/lib/auth/roles";
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
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) return auth.response;
  const orgId = context.locals.organization?.id;
  if (!orgId) return json({ error: "No organization context" }, 400);

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
  });

  const appUrl = import.meta.env.PUBLIC_APP_URL ?? "http://localhost:4321";
  const url = `${appUrl}/self-serve/${token.token}`;

  if (channel === "email") {
    const r = await sendEmail({
      to: signer.recipientEmail!,
      subject: "Finish your booking — quick waiver and photo",
      html: `<p>Hi ${signer.displayName},</p><p>A few quick items remain for your booking. <a href="${url}">Tap here to finish</a>.</p><p>Link expires in 6 hours.<br>— Aspire Sports</p>`,
      text: `Hi ${signer.displayName},\n\nA few quick items remain for your booking. Tap below to finish:\n${url}\n\nLink expires in 6 hours.\n— Aspire Sports`,
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
      body: `${signer.displayName}: finish your Aspire Sports booking (waiver + photo): ${url}`,
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
