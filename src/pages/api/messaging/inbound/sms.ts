import type { APIRoute } from "astro";
import twilio from "twilio";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema/users";
import {
  conversations,
  conversationMessages,
} from "@/lib/db/schema/conversations";
import { normalizeUsPhone, sendSms } from "@/lib/sms/send";
import {
  detectComplianceKeyword,
  processStartKeyword,
  processStopKeyword,
  findPendingOptIn,
  STOP_RESPONSE,
  HELP_RESPONSE,
  START_RESPONSE,
} from "@/lib/sms/compliance";
import { routeInboundMessage } from "@/lib/messaging/inbound-pipeline";

/**
 * POST /api/messaging/inbound/sms
 *
 * Twilio sends inbound SMS here via webhook. This route:
 *  1. Verifies the Twilio request signature
 *  2. Parses From + Body
 *  3. Handles STOP / HELP / START keywords FIRST (TCPA compliance)
 *  4. Normalizes the phone number
 *  5. Looks up the parent user by phone
 *  6. Creates a conversation_messages record (direction=inbound, channel=sms)
 *  7. Hands off to the inbound pipeline for classification and action dispatch
 *
 * Returns a TwiML response for immediate replies (compliance keywords) and
 * an empty response for normal messages (the bot replies asynchronously via
 * the outbound messaging gateway).
 */

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  // 1. Parse form data (Twilio webhooks are application/x-www-form-urlencoded)
  const formData = await request.formData();
  const params = Object.fromEntries(formData.entries());

  // 2. Verify Twilio signature (prevents webhook spoofing)
  if (!verifyTwilioSignature(request, params)) {
    return new Response("Forbidden: invalid Twilio signature", { status: 403 });
  }

  const from = String(params.From || "");
  const body = String(params.Body || "");
  const externalMessageId = String(params.MessageSid || "");

  if (!from || !body) {
    return twimlResponse("");
  }

  const normalized = normalizeUsPhone(from) ?? from;

  // 3. Compliance keywords FIRST, before any parent lookup
  const compliance = detectComplianceKeyword(body);
  if (compliance.kind === "stop") {
    await processStopKeyword(normalized, compliance.keyword);
    return twimlResponse(STOP_RESPONSE);
  }
  if (compliance.kind === "help") {
    return twimlResponse(HELP_RESPONSE);
  }
  if (compliance.kind === "start") {
    // Check if this is a reply to a pending opt-in welcome
    const pending = await findPendingOptIn(normalized);
    if (pending) {
      await processStartKeyword(normalized, compliance.keyword);
      return twimlResponse(
        "You're all set. We'll send schedule updates and reminders here. Ask anything.",
      );
    }
    // Otherwise it's a general re-opt-in
    await processStartKeyword(normalized, compliance.keyword);
    return twimlResponse(START_RESPONSE);
  }

  // 4. Look up parent user by phone
  const db = getDb();
  const parent = await db
    .select()
    .from(users)
    .where(eq(users.phone, normalized))
    .limit(1);

  if (parent.length === 0) {
    // Unknown phone — could be someone we don't have in the system yet.
    // Log it into an "unknown" bucket, reply politely, and route to admin.
    console.warn(`Inbound SMS from unknown phone ${normalized}: ${body.slice(0, 80)}`);
    return twimlResponse(
      "Hi — this number isn't linked to an Aspire account yet. An admin will follow up shortly.",
    );
  }

  const parentUser = parent[0];

  // 5. Resolve or create conversation for this parent
  const conversationId = await resolveOrCreateConversation(
    parentUser.id,
    parent[0],
  );
  if (!conversationId) {
    // Parent isn't linked to any organization — unusual but possible.
    return twimlResponse(
      "Thanks for your message. An admin will follow up shortly.",
    );
  }

  // 6. Record the inbound message
  const [msgRow] = await db
    .insert(conversationMessages)
    .values({
      conversationId: conversationId.conversationId,
      organizationId: conversationId.organizationId,
      direction: "inbound",
      channel: "sms",
      senderType: "parent",
      senderUserId: parentUser.id,
      externalMessageId,
      body,
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
    .where(eq(conversations.id, conversationId.conversationId));

  // 7. Hand off to the inbound pipeline for classification + action dispatch.
  // This runs async — the Twilio webhook response is returned immediately,
  // and the bot replies (if any) via the outbound gateway.
  routeInboundMessage({
    conversationId: conversationId.conversationId,
    organizationId: conversationId.organizationId,
    parentUserId: parentUser.id,
    messageId: msgRow.id,
    messageBody: body,
    channel: "sms",
  }).catch((err) => {
    console.error("Inbound pipeline error:", err);
  });

  // Return empty TwiML — the bot reply (if any) goes out through Twilio's
  // outbound API via the gateway, not the webhook response.
  return twimlResponse("");
};

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------

function verifyTwilioSignature(
  request: Request,
  params: Record<string, unknown>,
): boolean {
  const authToken =
    import.meta.env.TWILIO_WEBHOOK_AUTH_TOKEN ||
    import.meta.env.TWILIO_AUTH_TOKEN;

  if (!authToken) {
    // In dev / CI, signature verification is skipped with a warning
    if (!import.meta.env.PROD) {
      console.warn(
        "[sms webhook] TWILIO_AUTH_TOKEN not set — skipping signature verification (dev only)",
      );
      return true;
    }
    console.error(
      "[sms webhook] TWILIO_AUTH_TOKEN required in production. Refusing request.",
    );
    return false;
  }

  const signature = request.headers.get("X-Twilio-Signature");
  if (!signature) return false;

  // Reconstruct the URL Twilio signed (must match exactly what they see)
  const url = request.url;

  try {
    return twilio.validateRequest(
      authToken,
      signature,
      url,
      params as Record<string, string>,
    );
  } catch (err) {
    console.error("Twilio signature validation error:", err);
    return false;
  }
}

function twimlResponse(body: string): Response {
  const twiml = body
    ? `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapeXml(body)}</Message></Response>`
    : `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`;
  return new Response(twiml, {
    status: 200,
    headers: { "Content-Type": "text/xml" },
  });
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

async function resolveOrCreateConversation(
  parentUserId: string,
  parent: typeof users.$inferSelect,
): Promise<{ conversationId: string; organizationId: string } | null> {
  // We need the parent's organization. For Phase 1 pilot (single-org), we can
  // find it via the family_member_parents → family_members → registrations →
  // seasons → organizations chain, or more simply look up any existing
  // conversation.
  const db = getDb();

  // First, try to find an existing active conversation
  const existing = await db
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

  if (existing.length > 0) {
    return {
      conversationId: existing[0].id,
      organizationId: existing[0].organizationId,
    };
  }

  // No conversation yet — we need to infer the org. For the single-org pilot,
  // take the first organization we can find for this parent.
  const org = await inferOrganizationForParent(parentUserId);
  if (!org) {
    console.warn(
      `Cannot resolve organization for parent ${parentUserId} — no conversation created`,
    );
    return null;
  }

  const [row] = await db
    .insert(conversations)
    .values({
      organizationId: org,
      parentUserId,
      status: "active",
      assignmentRole: "bot",
    })
    .returning({ id: conversations.id });

  return { conversationId: row.id, organizationId: org };
}

async function inferOrganizationForParent(
  parentUserId: string,
): Promise<string | null> {
  const db = getDb();
  // Look for any phone_opt_ins row for this user — it's the most direct
  // indicator of which org they belong to.
  const { phoneOptIns } = await import("@/lib/db/schema/phone-verifications");

  const rows = await db
    .select({ orgId: phoneOptIns.organizationId })
    .from(phoneOptIns)
    .where(eq(phoneOptIns.userId, parentUserId))
    .limit(1);

  return rows[0]?.orgId ?? null;
}
