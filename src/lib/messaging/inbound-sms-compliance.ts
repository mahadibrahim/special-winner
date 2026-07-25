import { normalizeUsPhone } from "@/lib/sms/send";
import {
  detectComplianceKeyword,
  processStopKeyword,
  processStartKeyword,
  STOP_RESPONSE,
  HELP_RESPONSE,
  START_RESPONSE,
} from "@/lib/sms/compliance";

/**
 * Inbound SMS compliance (STOP / HELP / START) for the Zernio provider.
 *
 * Zernio delivers ALL inbound to one shared webhook (/api/webhooks/zernio),
 * which also carries social-publish confirmations and inbound WhatsApp. Two
 * hard rules drive this module:
 *
 *  1. POSITIVE channel gating. The WhatsApp parser matches any inbound with a
 *     phone + text and has NO channel check, so without a positive "this is
 *     SMS" signal an inbound SMS could be stolen by the WhatsApp path. We only
 *     return a parse when the payload explicitly says channel/type = "sms".
 *  2. Never silently drop. For compliance, a parse miss = a missed opt-out (a
 *     TCPA gap), so the webhook loud-logs anything it can't classify.
 *
 * Field names / envelope shape are UNCONFIRMED in Zernio's public docs (same
 * caveat as the WhatsApp parser). We accept documented candidates and pin them
 * against a real inbound payload captured from the webhook logs.
 *
 * Scope is compliance keywords ONLY — conversational inbound (parent lookup,
 * conversation threading, bot routing) is intentionally deferred.
 */

export interface ParsedInboundSms {
  senderPhone: string;
  body: string;
  /** Provider message id when present; "" is tolerated — a missing id must
   *  never cause us to drop a STOP. */
  externalMessageId: string;
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
}

function hasSmsChannelSignal(
  root: Record<string, unknown>,
  data: Record<string, unknown> | null,
  msg: Record<string, unknown>,
): boolean {
  const candidates = [
    root.channel,
    root.type,
    data?.channel,
    data?.type,
    msg.channel,
    msg.type,
  ];
  return candidates.some(
    (c) => typeof c === "string" && c.toLowerCase() === "sms",
  );
}

/** Locate the message object inside the (unconfirmed) Zernio envelope. */
function extractMessage(
  root: Record<string, unknown>,
  data: Record<string, unknown> | null,
): Record<string, unknown> | null {
  const messagesArr = Array.isArray(root.messages)
    ? root.messages
    : data && Array.isArray(data.messages)
      ? data.messages
      : null;
  return (
    asRecord(root.message) ??
    (data ? asRecord(data.message) : null) ??
    (messagesArr ? asRecord(messagesArr[0]) : null)
  );
}

/**
 * Coarse gate: does this payload look like inbound SMS at all? True when it
 * carries a positive SMS channel signal and is not a social-publish event —
 * regardless of whether it can be fully parsed. The webhook uses this to
 * loud-log an SMS it recognizes but can't extract (a possible missed STOP)
 * instead of letting it fall through to the WhatsApp parser.
 */
export function looksLikeInboundSms(payload: unknown): boolean {
  const root = asRecord(payload);
  if (!root || root.post !== undefined) return false;
  const data = asRecord(root.data);
  const msg = extractMessage(root, data) ?? {};
  return hasSmsChannelSignal(root, data, msg);
}

/**
 * Recognize a 1:1 inbound SMS in a Zernio webhook payload, or return null for
 * anything not positively identifiable as one (social-publish events, WhatsApp
 * inbound, outbound echoes, non-text, malformed).
 */
export function parseInboundSms(payload: unknown): ParsedInboundSms | null {
  const root = asRecord(payload);
  if (!root) return null;
  // Social-publish events always carry `post` — never inbound.
  if (root.post !== undefined) return null;

  const data = asRecord(root.data);
  const msg = extractMessage(root, data);
  if (!msg) return null;

  // POSITIVE gate: only claim this payload if it explicitly says it's SMS.
  if (!hasSmsChannelSignal(root, data, msg)) return null;

  // Skip outbound echoes.
  if (msg.fromMe === true || msg.from_me === true) return null;
  if (
    typeof msg.direction === "string" &&
    msg.direction.toLowerCase() === "outbound"
  ) {
    return null;
  }

  const senderRaw = msg.from ?? msg.sender ?? msg.phone ?? msg.msisdn ?? msg.author;
  if (typeof senderRaw !== "string" || senderRaw.length === 0) return null;
  const senderPhone = senderRaw.replace(/@.*$/, "");
  if (!senderPhone) return null;

  let body: string | null = null;
  if (typeof msg.text === "string") {
    body = msg.text;
  } else {
    const textObj = asRecord(msg.text);
    if (textObj && typeof textObj.body === "string") body = textObj.body;
    else if (typeof msg.body === "string") body = msg.body;
    else if (typeof msg.message === "string") body = msg.message;
  }
  if (body === null) return null;
  body = body.trim();
  if (!body) return null;

  const idRaw = msg.id ?? msg._id ?? msg.messageId;
  const externalMessageId =
    typeof idRaw === "string" && idRaw.length > 0 ? idRaw : "";

  return { senderPhone, body, externalMessageId };
}

export type ComplianceKind = "stop" | "help" | "start" | "none";

export interface InboundSmsComplianceResult {
  kind: ComplianceKind;
  /** Whether an opt-in/opt-out state change was written. */
  recorded: boolean;
  /** Whether a confirmation reply was actually sent. */
  replied: boolean;
}

export interface InboundSmsComplianceDeps {
  processStop: (phone: string, keyword: string) => Promise<number>;
  processStart: (phone: string, keyword: string) => Promise<unknown>;
  sendReply: (to: string, body: string) => Promise<void>;
  /**
   * Whether to send our own STOP/HELP/START confirmation. Default OFF pending
   * confirmation of whether Zernio/the carrier already auto-sends it — sending
   * our own on top would double-text (and texting after STOP is legally
   * fraught). Flip via SMS_COMPLIANCE_AUTO_REPLY=yes once confirmed.
   */
  autoReply: boolean;
}

/** Default reply transport: the active Zernio SMS number, provider-direct. The
 *  single post-STOP confirmation is legally permitted, so it bypasses the
 *  opt-in bookkeeping in sendSms(). Only reached when autoReply is on. */
async function defaultSendReply(to: string, body: string): Promise<void> {
  const { createZernioSmsClientFromEnv } = await import("@/lib/sms/zernio-sms");
  await createZernioSmsClientFromEnv().send({ to, text: body });
}

/**
 * Run compliance for one parsed inbound SMS: detect the keyword, record the
 * opt-out/opt-in, and (only if autoReply is enabled) send the confirmation.
 */
export async function handleInboundSmsCompliance(
  parsed: ParsedInboundSms,
  deps: Partial<InboundSmsComplianceDeps> = {},
): Promise<InboundSmsComplianceResult> {
  const processStop = deps.processStop ?? processStopKeyword;
  const processStart = deps.processStart ?? processStartKeyword;
  const sendReply = deps.sendReply ?? defaultSendReply;
  const autoReply =
    deps.autoReply ?? process.env.SMS_COMPLIANCE_AUTO_REPLY === "yes";

  const normalized = normalizeUsPhone(parsed.senderPhone) ?? parsed.senderPhone;
  const match = detectComplianceKeyword(parsed.body);

  let recorded = false;
  let replyBody: string | null = null;

  switch (match.kind) {
    case "stop":
      await processStop(normalized, match.keyword);
      recorded = true;
      replyBody = STOP_RESPONSE;
      break;
    case "start":
      await processStart(normalized, match.keyword);
      recorded = true;
      replyBody = START_RESPONSE;
      break;
    case "help":
      replyBody = HELP_RESPONSE;
      break;
    case "none":
      return { kind: "none", recorded: false, replied: false };
  }

  let replied = false;
  if (replyBody && autoReply) {
    await sendReply(normalized, replyBody);
    replied = true;
  }

  return { kind: match.kind, recorded, replied };
}
