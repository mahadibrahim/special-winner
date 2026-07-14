import type { APIRoute } from "astro";
import { Webhook } from "svix";
import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema/users";
import {
  conversations,
  conversationMessages,
} from "@/lib/db/schema/conversations";
import { phoneOptIns } from "@/lib/db/schema/phone-verifications";
import { routeInboundMessage } from "@/lib/messaging/inbound-pipeline";

/**
 * POST /api/messaging/inbound/email
 *
 * Resend sends inbound email here via webhook. This route:
 *  1. Verifies the webhook signature (using RESEND_INBOUND_WEBHOOK_SECRET)
 *  2. Parses the email payload (sender, subject, text body, headers)
 *  3. Finds the parent user by From email address
 *  4. Resolves or creates a conversation
 *  5. Records the inbound message
 *  6. Hands off to the inbound pipeline for classification
 *
 * Notes on threading: Resend's inbound webhook provides the raw email. We
 * look at the In-Reply-To and References headers to reconstruct which
 * existing conversation this is a reply to. If no match, we create a new
 * conversation.
 */

export const prerender = false;

interface ResendInboundPayload {
  type?: string;
  data?: {
    from?: { email?: string; name?: string };
    to?: Array<{ email?: string }>;
    subject?: string;
    text?: string;
    html?: string;
    headers?: Record<string, string>;
    message_id?: string;
  };
}

export const POST: APIRoute = async ({ request }) => {
  // 1. Signature verification
  const rawBody = await request.text();
  if (!verifyResendSignature(request, rawBody)) {
    return new Response("Forbidden: invalid webhook signature", {
      status: 403,
    });
  }

  // 2. Parse payload
  let payload: ResendInboundPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response("Bad Request: invalid JSON", { status: 400 });
  }

  const data = payload.data ?? {};
  const fromEmail = data.from?.email?.toLowerCase().trim();
  const body = data.text || stripHtml(data.html || "");
  const externalMessageId = data.message_id ?? "";
  const inReplyTo = data.headers?.["in-reply-to"] ?? data.headers?.["In-Reply-To"];

  if (!fromEmail || !body) {
    return new Response(JSON.stringify({ ok: true, skipped: "missing from or body" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // 3. Look up parent by email
  const db = getDb();
  const parent = await db
    .select()
    .from(users)
    .where(eq(users.email, fromEmail))
    .limit(1);

  if (parent.length === 0) {
    console.warn(`Inbound email from unknown sender ${fromEmail}`);
    return new Response(
      JSON.stringify({ ok: true, skipped: "unknown sender" }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  const parentUser = parent[0];

  // 4. Resolve conversation. Try reply-threading first via In-Reply-To header.
  const conversationInfo = await resolveConversation(
    parentUser.id,
    inReplyTo,
  );
  if (!conversationInfo) {
    console.warn(
      `Cannot resolve organization for parent ${parentUser.id} — email ignored`,
    );
    return new Response(
      JSON.stringify({ ok: true, skipped: "no organization context" }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  // 5. Record the inbound message
  const [msgRow] = await db
    .insert(conversationMessages)
    .values({
      conversationId: conversationInfo.conversationId,
      organizationId: conversationInfo.organizationId,
      direction: "inbound",
      channel: "email",
      senderType: "parent",
      senderUserId: parentUser.id,
      externalMessageId,
      body: body.trim(),
      bodyHtml: data.html ?? null,
      deliveredAt: new Date(),
    })
    .returning({ id: conversationMessages.id });

  await db
    .update(conversations)
    .set({
      lastMessageAt: new Date(),
      lastInboundAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(conversations.id, conversationInfo.conversationId));

  // 6. Hand off to the inbound pipeline (fire and forget)
  routeInboundMessage({
    conversationId: conversationInfo.conversationId,
    organizationId: conversationInfo.organizationId,
    parentUserId: parentUser.id,
    messageId: msgRow.id,
    messageBody: body.trim(),
    channel: "email",
  }).catch((err) => {
    console.error("Email inbound pipeline error:", err);
  });

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------

function verifyResendSignature(request: Request, rawBody: string): boolean {
  const secret = import.meta.env.RESEND_INBOUND_WEBHOOK_SECRET;
  if (!secret) {
    // In dev, allow unsigned requests with a warning. In prod, refuse.
    if (!import.meta.env.PROD) {
      console.warn(
        "[email webhook] RESEND_INBOUND_WEBHOOK_SECRET not set — skipping signature verification (dev only)",
      );
      return true;
    }
    console.error(
      "[email webhook] RESEND_INBOUND_WEBHOOK_SECRET required in production. Refusing request.",
    );
    return false;
  }

  // Resend webhooks are signed via Svix. The signature is computed over
  // `${svix-id}.${svix-timestamp}.${body}` and delivered as
  // `v1,<base64>` (possibly multiple space-separated tokens) in the
  // `svix-signature` header. Use the svix package so we get correct
  // base64 handling, timestamp tolerance, and timing-safe comparison.
  const headers = {
    "svix-id": request.headers.get("svix-id") ?? "",
    "svix-timestamp": request.headers.get("svix-timestamp") ?? "",
    "svix-signature": request.headers.get("svix-signature") ?? "",
  };
  if (!headers["svix-id"] || !headers["svix-timestamp"] || !headers["svix-signature"]) {
    return false;
  }

  try {
    const wh = new Webhook(secret);
    wh.verify(rawBody, headers);
    return true;
  } catch (err) {
    console.error("Resend signature validation error:", err);
    return false;
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

async function resolveConversation(
  parentUserId: string,
  inReplyTo?: string,
): Promise<{ conversationId: string; organizationId: string } | null> {
  const db = getDb();

  // 1. Try to match the In-Reply-To header to a prior outbound message's
  //    external_message_id. If found, return that conversation.
  if (inReplyTo) {
    const normalized = inReplyTo.replace(/[<>]/g, "").trim();
    const match = await db
      .select({
        conversationId: conversationMessages.conversationId,
        organizationId: conversationMessages.organizationId,
      })
      .from(conversationMessages)
      .where(eq(conversationMessages.externalMessageId, normalized))
      .limit(1);
    if (match.length > 0) return match[0];
  }

  // 2. Fall back to the active conversation for this parent
  const active = await db
    .select({
      id: conversations.id,
      organizationId: conversations.organizationId,
    })
    .from(conversations)
    .where(
      and(
        eq(conversations.parentUserId, parentUserId),
        eq(conversations.status, "active"),
      ),
    )
    .limit(1);

  if (active.length > 0) {
    return {
      conversationId: active[0].id,
      organizationId: active[0].organizationId,
    };
  }

  // 3. No conversation yet — create one. Infer org via phone_opt_ins or
  //    return null if we can't figure it out.
  // Org resolution only — not a consent gate, so any channel's row will do.
  // Deterministic pick now that a user can hold several rows (one per channel).
  const optIn = await db
    .select({ orgId: phoneOptIns.organizationId })
    .from(phoneOptIns)
    .where(eq(phoneOptIns.userId, parentUserId))
    .orderBy(asc(phoneOptIns.createdAt))
    .limit(1);

  if (optIn.length === 0) return null;

  const [row] = await db
    .insert(conversations)
    .values({
      organizationId: optIn[0].orgId,
      parentUserId,
      status: "active",
      assignmentRole: "bot",
    })
    .returning({ id: conversations.id });

  return { conversationId: row.id, organizationId: optIn[0].orgId };
}
