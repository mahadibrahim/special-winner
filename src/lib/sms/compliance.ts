import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { phoneOptIns } from "@/lib/db/schema/phone-verifications";

/**
 * SMS compliance helpers for 10DLC / TCPA.
 *
 * Handles STOP / HELP / UNSUBSCRIBE keyword detection, opt-out processing,
 * and the associated audit trail. These functions must run BEFORE any other
 * inbound message logic — opted-out parents should never see their messages
 * classified or routed to staff.
 */

const STOP_KEYWORDS = new Set([
  "STOP",
  "UNSUBSCRIBE",
  "CANCEL",
  "END",
  "QUIT",
  "STOPALL",
  "REVOKE",
]);

const HELP_KEYWORDS = new Set(["HELP", "INFO"]);

const START_KEYWORDS = new Set(["START", "YES", "UNSTOP"]);

export type ComplianceMatch =
  | { kind: "stop"; keyword: string }
  | { kind: "help"; keyword: string }
  | { kind: "start"; keyword: string }
  | { kind: "none" };

/**
 * Identify whether an inbound message is a compliance keyword.
 * Only the first word of the message is checked (case-insensitive) — the
 * TCPA-mandated keywords are always single-word responses.
 */
export function detectComplianceKeyword(body: string): ComplianceMatch {
  const firstWord = (body.trim().split(/\s+/)[0] || "").toUpperCase();
  if (STOP_KEYWORDS.has(firstWord)) return { kind: "stop", keyword: firstWord };
  if (HELP_KEYWORDS.has(firstWord)) return { kind: "help", keyword: firstWord };
  if (START_KEYWORDS.has(firstWord)) return { kind: "start", keyword: firstWord };
  return { kind: "none" };
}

/**
 * Process a STOP keyword — marks the phone as opted_out for SMS in every org
 * that has it on file. Returns the number of records updated.
 *
 * An SMS STOP opts the sender out of SMS. It does NOT revoke WhatsApp consent
 * — they are distinct consents under distinct regimes, and a person who
 * texted STOP has not said anything about WhatsApp. A WhatsApp opt-out
 * arrives on the WhatsApp inbound path and scopes itself the same way.
 * (Cross-org is deliberate and pre-existing: STOP to our number means stop.)
 */
export async function processStopKeyword(
  phone: string,
  keyword: string,
): Promise<number> {
  const db = getDb();
  const now = new Date();

  const result = await db
    .update(phoneOptIns)
    .set({
      status: "opted_out",
      optedOutAt: now,
      stopKeywordTriggered: keyword,
      updatedAt: now,
    })
    .where(and(eq(phoneOptIns.phone, phone), eq(phoneOptIns.channel, "sms")))
    .returning({ id: phoneOptIns.id });

  return result.length;
}

/**
 * Process a START keyword — re-opts the phone in for SMS in every org that has
 * it on file. Like STOP, it is scoped to the SMS channel: a text message says
 * nothing about the sender's WhatsApp consent.
 */
export async function processStartKeyword(
  phone: string,
  keyword: string,
): Promise<number> {
  const db = getDb();
  const now = new Date();

  const result = await db
    .update(phoneOptIns)
    .set({
      status: "opted_in",
      optedInAt: now,
      optedOutAt: null,
      stopKeywordTriggered: null,
      optInSource: "welcome_reply_yes",
      updatedAt: now,
    })
    .where(and(eq(phoneOptIns.phone, phone), eq(phoneOptIns.channel, "sms")))
    .returning({ id: phoneOptIns.id });

  return result.length;
}

/**
 * Find the pending SMS opt-in record for this phone (used when a parent replies
 * YES via text to a welcome message that admin just sent). Scoped to the SMS
 * channel — an SMS reply can only grant SMS consent.
 */
export async function findPendingOptIn(phone: string): Promise<{
  id: string;
  organizationId: string;
} | null> {
  const db = getDb();
  const rows = await db
    .select({
      id: phoneOptIns.id,
      organizationId: phoneOptIns.organizationId,
    })
    .from(phoneOptIns)
    .where(
      and(
        eq(phoneOptIns.phone, phone),
        eq(phoneOptIns.channel, "sms"),
        eq(phoneOptIns.status, "pending"),
      ),
    )
    // Deterministic pick on the shared CI/staging DB (multi-tenant hazard).
    .orderBy(asc(phoneOptIns.createdAt))
    .limit(1);

  return rows[0] ?? null;
}

export const STOP_RESPONSE =
  "You've been unsubscribed from Aspire Sports messages and won't receive further texts. Reply START to opt back in.";

export const HELP_RESPONSE =
  "Aspire Sports: youth sports program updates, schedules, and coach messages. Msg freq varies. Msg&data rates may apply. Reply STOP to unsubscribe. Contact: hello@aspiresportsohio.com";

export const START_RESPONSE =
  "You're opted back in to Aspire Sports messages. We'll keep you posted on schedules and updates. Reply STOP anytime to opt out.";
