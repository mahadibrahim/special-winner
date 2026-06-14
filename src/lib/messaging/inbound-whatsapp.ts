import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema/users";
import {
  conversations,
  conversationMessages,
} from "@/lib/db/schema/conversations";
import { phoneOptIns } from "@/lib/db/schema/phone-verifications";
import { normalizePhone } from "@/lib/phone";
import { resolveOrCreateConversation } from "./conversations-helper";
import { routeInboundMessage } from "./inbound-pipeline";

/**
 * WhatsApp (Zernio) inbound handling — the WhatsApp peer of the SMS / email /
 * Telegram inbound entry points. Zernio delivers inbound messages to the single
 * registered webhook (`/api/webhooks/zernio`); that handler calls
 * parseInboundWhatsAppMessage to recognize a 1:1 text message and, if it is
 * one, hands it to handleInboundWhatsApp, which records it and routes it through
 * the shared inbound pipeline (classifier → bot/route), exactly like Telegram.
 *
 * Unlike Telegram there is no /start magic-link binding step: WhatsApp inbound
 * carries the sender's phone number, and we already store phones on `users`, so
 * the sender is identified by phone match. Group messages are intentionally NOT
 * handled here — the bot classifier is a 1:1 concern; group chatter is left to
 * the group lifecycle, not auto-classified.
 */

export interface ParsedInboundWhatsApp {
  senderPhone: string;
  body: string;
  externalMessageId: string;
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
}

/**
 * Recognize a 1:1 inbound WhatsApp text message in a Zernio webhook payload.
 *
 * Returns null for anything it can't positively identify as one — social
 * publish events (which always carry `post`), group messages (JID ends in
 * `@g.us` or an explicit group field), outbound echoes, non-text messages, and
 * malformed payloads. This conservatism is deliberate: the webhook endpoint is
 * shared with the prod-live social-publish path, so a false positive must be
 * impossible.
 *
 * Field names / envelope shape are UNCONFIRMED in Zernio's public docs (same
 * caveat as extractGroup / the social payload). Accept the documented
 * candidates; pin them against a live inbound test payload.
 */
export function parseInboundWhatsAppMessage(
  payload: unknown,
): ParsedInboundWhatsApp | null {
  const root = asRecord(payload);
  if (!root) return null;
  // Social-publish events always carry `post` — never treat them as inbound.
  if (root.post !== undefined) return null;

  const data = asRecord(root.data);
  const messagesArr = Array.isArray(root.messages)
    ? root.messages
    : data && Array.isArray(data.messages)
      ? data.messages
      : null;
  const msg =
    asRecord(root.message) ??
    (data ? asRecord(data.message) : null) ??
    (messagesArr ? asRecord(messagesArr[0]) : null);
  if (!msg) return null;

  // Skip outbound echoes.
  if (msg.fromMe === true || msg.from_me === true) return null;
  if (
    typeof msg.direction === "string" &&
    msg.direction.toLowerCase() === "outbound"
  ) {
    return null;
  }

  // Sender phone (or JID).
  const senderRaw = msg.from ?? msg.sender ?? msg.phone ?? msg.wa_id ?? msg.author;
  if (typeof senderRaw !== "string" || senderRaw.length === 0) return null;
  // Group messages: WhatsApp group JIDs end in @g.us, or an explicit group field.
  if (senderRaw.includes("@g.us")) return null;
  if (
    msg.groupId !== undefined ||
    msg.group !== undefined ||
    root.groupId !== undefined
  ) {
    return null;
  }
  // Strip a 1:1 JID suffix (@c.us / @s.whatsapp.net) if present.
  const senderPhone = senderRaw.replace(/@.*$/, "");
  if (!senderPhone) return null;

  // Body — flat `text` string, Meta `text.body`, or documented alternates.
  let body: string | null = null;
  if (typeof msg.text === "string") {
    body = msg.text;
  } else {
    const textObj = asRecord(msg.text);
    if (textObj && typeof textObj.body === "string") body = textObj.body;
    else if (typeof msg.body === "string") body = msg.body;
    else if (typeof msg.message === "string") body = msg.message;
    else if (typeof msg.caption === "string") body = msg.caption;
  }
  if (body === null) return null;
  body = body.trim();
  if (!body) return null;

  // External message id.
  const idRaw = msg.id ?? msg._id ?? msg.messageId;
  if (typeof idRaw !== "string" || idRaw.length === 0) return null;

  return { senderPhone, body, externalMessageId: idRaw };
}

export type InboundWhatsAppResult =
  | { ok: true; conversationId: string; parentUserId: string }
  | { ok: false; reason: "unknown_sender" | "no_org_context" };

/**
 * Record a parsed 1:1 inbound WhatsApp message and route it through the inbound
 * pipeline. Mirrors the Telegram inbound flow: resolve the sender (by phone),
 * resolve their org, resolve/create the conversation, persist the inbound row,
 * then fire the pipeline.
 *
 * Returns a structured outcome rather than throwing — an unknown sender or a
 * missing org context is an expected, non-fatal condition the webhook logs and
 * acks (we don't auto-reply to strangers; business-initiated WhatsApp replies
 * are template-gated anyway).
 */
export async function handleInboundWhatsApp(
  parsed: ParsedInboundWhatsApp,
): Promise<InboundWhatsAppResult> {
  const db = getDb();

  // Identify the sender by phone. Stored phones are 10 US digits; the inbound
  // sender is E.164 — normalize both sides to compare.
  const normalized = normalizePhone(parsed.senderPhone);
  if (!normalized) return { ok: false, reason: "unknown_sender" };

  const [parent] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.phone, normalized))
    // Deterministic pick on the shared CI DB if a phone somehow repeats.
    .orderBy(users.createdAt)
    .limit(1);
  if (!parent) return { ok: false, reason: "unknown_sender" };

  // Resolve org via the parent's opt-in record (mirrors the Telegram path).
  const [optIn] = await db
    .select({ orgId: phoneOptIns.organizationId })
    .from(phoneOptIns)
    .where(eq(phoneOptIns.userId, parent.id))
    .orderBy(phoneOptIns.createdAt)
    .limit(1);
  if (!optIn) return { ok: false, reason: "no_org_context" };

  const conversationId = await resolveOrCreateConversation(parent.id, optIn.orgId);

  const [msgRow] = await db
    .insert(conversationMessages)
    .values({
      conversationId,
      organizationId: optIn.orgId,
      direction: "inbound",
      channel: "whatsapp",
      senderType: "parent",
      senderUserId: parent.id,
      externalMessageId: parsed.externalMessageId,
      body: parsed.body,
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
    .where(eq(conversations.id, conversationId));

  // Fire-and-forget — the bot reply goes back out via the gateway. Mirrors the
  // Telegram inbound path; keeps the caller (the shared Zernio webhook) within
  // Zernio's ~5s ack budget. Pipeline errors are caught internally
  // (escalateOnFailure) with this as a backstop log.
  void routeInboundMessage({
    conversationId,
    organizationId: optIn.orgId,
    parentUserId: parent.id,
    messageId: msgRow.id,
    messageBody: parsed.body,
    channel: "whatsapp",
  }).catch((err) => {
    console.error("WhatsApp inbound pipeline error:", err);
  });

  return { ok: true, conversationId, parentUserId: parent.id };
}
