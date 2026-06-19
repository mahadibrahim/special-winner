import type { APIRoute } from "astro";
import { z } from "zod";
import { rateLimit, rateLimitedResponse } from "@/lib/auth/rate-limit";
import { sendEmail, fromForBrand, isEmailConfigured } from "@/lib/email";
import { SOCCERONE_CONTACT_EMAIL } from "@/lib/soccerone/contact";

const BodySchema = z.object({
  businessName: z.string().trim().min(1).max(255),
  contactName: z.string().trim().min(1).max(200),
  contactEmail: z.string().trim().toLowerCase().email().max(320),
  contactPhone: z.string().trim().max(30).optional(),
  website: z.string().trim().max(500).optional(),
  tierInterest: z
    .enum([
      "supporter",
      "sideline",
      "center-circle",
      "title",
      "team-kit",
      "tournament",
      "not-sure",
    ])
    .optional(),
  facility: z.enum(["worthington", "downtown", "both", "no-preference"]).optional(),
  message: z.string().trim().max(2000).optional(),
});

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export const POST: APIRoute = async ({ request, clientAddress }) => {
  // Per-IP burst limit — unauthenticated public endpoint that triggers an
  // outbound email; cap it so a script can't spam the inbox.
  const ip = clientAddress || "unknown";
  const ipLimit = rateLimit(`sponsor-inquiry:ip:${ip}`, 5, 60_000);
  if (!ipLimit.allowed) {
    return rateLimitedResponse(ipLimit.retryAfter ?? 60);
  }

  let parsed;
  try {
    const body = await request.json();
    parsed = BodySchema.safeParse(body);
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  if (!parsed.success) {
    return jsonResponse({ error: "Invalid input", issues: parsed.error.issues }, 400);
  }

  const data = parsed.data;
  const inbox =
    (import.meta.env.SOCCERONE_INQUIRY_INBOX as string | undefined) ||
    SOCCERONE_CONTACT_EMAIL;

  // No email creds locally / in CI — accept the submit so dev + tests pass,
  // but log it so a misconfigured prod is visible.
  if (!isEmailConfigured()) {
    console.warn("[sponsor-inquiry] email not configured — inquiry not delivered", {
      businessName: data.businessName,
      contactEmail: data.contactEmail,
    });
    return jsonResponse({ ok: true }, 200);
  }

  const rows: Array<[string, string | undefined]> = [
    ["Business", data.businessName],
    ["Contact", data.contactName],
    ["Email", data.contactEmail],
    ["Phone", data.contactPhone],
    ["Website", data.website],
    ["Tier interest", data.tierInterest],
    ["Facility", data.facility],
    ["Message", data.message],
  ];
  const present = rows.filter(([, v]) => v && v.length > 0) as Array<[string, string]>;

  const text = present.map(([k, v]) => `${k}: ${v}`).join("\n");
  const html =
    `<h2>New SoccerOne sponsor inquiry</h2><table cellpadding="6">` +
    present
      .map(
        ([k, v]) =>
          `<tr><td style="font-weight:600">${escapeHtml(k)}</td><td>${escapeHtml(v)}</td></tr>`,
      )
      .join("") +
    `</table>`;

  const result = await sendEmail({
    from: fromForBrand("soccerone"),
    to: inbox,
    replyTo: data.contactEmail,
    subject: `New SoccerOne sponsor inquiry — ${data.businessName}`,
    html,
    text,
  });

  if (!result.success) {
    console.error("[sponsor-inquiry] email send failed", result.error);
    return jsonResponse({ error: "Could not send inquiry. Please email us directly." }, 502);
  }

  return jsonResponse({ ok: true }, 200);
};
