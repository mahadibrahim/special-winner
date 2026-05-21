// src/pages/api/marketing/unsubscribe.ts
import type { APIRoute } from "astro";
import { eq, isNull, and } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import {
  verifyUnsubscribeToken,
  getUnsubscribeSecret,
} from "@/lib/marketing/unsubscribe-token";

export const prerender = false;

/** Minimal branded HTML confirmation/error page. */
function page(title: string, message: string, status: number): Response {
  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title} — Aspire Sports</title></head>
<body style="margin:0;background:#F5EFE3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<div style="max-width:480px;margin:64px auto;padding:32px;background:#FAF7ED;border:1px solid #DBD5C5;border-radius:6px;text-align:center;">
<h1 style="font-size:22px;color:#1B1D27;margin:0 0 12px;">${title}</h1>
<p style="font-size:15px;line-height:1.6;color:#4F5158;margin:0;">${message}</p>
</div></body></html>`;
  return new Response(html, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

/** Opt the user out; idempotent. Returns true if the token was valid. */
async function applyUnsubscribe(token: string | null): Promise<boolean> {
  if (!token) return false;
  const userId = verifyUnsubscribeToken(token, getUnsubscribeSecret());
  if (!userId) return false;
  await getDb()
    .update(users)
    .set({ marketingOptedOutAt: new Date(), updatedAt: new Date() })
    .where(and(eq(users.id, userId), isNull(users.marketingOptedOutAt)));
  return true;
}

// GET — the unsubscribe link clicked from an email.
export const GET: APIRoute = async ({ url }) => {
  const ok = await applyUnsubscribe(url.searchParams.get("token"));
  return ok
    ? page(
        "You're unsubscribed",
        "You won't receive any more marketing emails from Aspire Sports. You'll still get essential emails about your registrations.",
        200,
      )
    : page(
        "Link not valid",
        "This unsubscribe link is invalid or expired. Please use the link from a recent Aspire Sports email.",
        400,
      );
};

// POST — Gmail/Apple one-click (List-Unsubscribe-Post). Body-less; token in query.
export const POST: APIRoute = async ({ url }) => {
  const ok = await applyUnsubscribe(url.searchParams.get("token"));
  return new Response(null, { status: ok ? 200 : 400 });
};
