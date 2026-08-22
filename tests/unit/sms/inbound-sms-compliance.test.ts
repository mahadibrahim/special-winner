import { describe, it, expect, vi } from "vitest";
import {
  parseInboundSms,
  handleInboundSmsCompliance,
  looksLikeInboundSms,
} from "@/lib/messaging/inbound-sms-compliance";

/**
 * Inbound SMS compliance (STOP/HELP/START) for the Zernio provider.
 *
 * Zernio delivers inbound to the single shared webhook (/api/webhooks/zernio),
 * which also carries social-publish confirmations and inbound WhatsApp. The SMS
 * parser must be POSITIVELY gated to the SMS channel so it never steals a
 * WhatsApp message (the WhatsApp parser has no channel check), and never
 * matches a social-publish event.
 *
 * For compliance, a parse miss = a missed opt-out (a TCPA gap). These tests pin
 * the channel gating and the keyword→action dispatch.
 */

describe("parseInboundSms — positively gated to the SMS channel", () => {
  it("parses an inbound SMS carrying an sms channel signal", () => {
    expect(
      parseInboundSms({
        channel: "sms",
        message: { from: "+15712256138", text: "STOP", id: "m1" },
      }),
    ).toEqual({ senderPhone: "+15712256138", body: "STOP", externalMessageId: "m1" });
  });

  it("returns null for a non-SMS (WhatsApp) inbound so the WhatsApp path keeps it", () => {
    expect(
      parseInboundSms({
        channel: "whatsapp",
        message: { from: "+15712256138", text: "hi", id: "m2" },
      }),
    ).toBeNull();
    // No channel signal at all → also null (can't positively call it SMS).
    expect(
      parseInboundSms({ message: { from: "+15712256138", text: "hi", id: "m3" } }),
    ).toBeNull();
  });

  it("returns null for a social-publish event (carries `post`)", () => {
    expect(
      parseInboundSms({ channel: "sms", event: "post.published", post: { _id: "p1" } }),
    ).toBeNull();
  });

  it("returns null for an outbound echo", () => {
    expect(
      parseInboundSms({
        channel: "sms",
        message: { from: "+1", text: "hi", id: "m4", direction: "outbound" },
      }),
    ).toBeNull();
  });

  it("returns null when the body is missing or empty", () => {
    expect(
      parseInboundSms({ channel: "sms", message: { from: "+1", id: "m5" } }),
    ).toBeNull();
    expect(
      parseInboundSms({ channel: "sms", message: { from: "+1", text: "   ", id: "m6" } }),
    ).toBeNull();
  });
});

describe("looksLikeInboundSms — coarse gate so unparsed SMS is loud-logged, not misrouted", () => {
  it("is true for an SMS-channel payload even when it can't be fully parsed", () => {
    // sms channel present but message has no text → parseInboundSms returns null;
    // the webhook must still recognize it as SMS and loud-log (possible STOP).
    expect(looksLikeInboundSms({ channel: "sms", message: { from: "+1" } })).toBe(true);
    expect(parseInboundSms({ channel: "sms", message: { from: "+1" } })).toBeNull();
  });

  it("is false for WhatsApp inbound and social-publish events", () => {
    expect(looksLikeInboundSms({ channel: "whatsapp", message: { from: "+1", text: "hi" } })).toBe(false);
    expect(looksLikeInboundSms({ channel: "sms", post: { _id: "p1" } })).toBe(false);
    expect(looksLikeInboundSms({ message: { from: "+1", text: "hi" } })).toBe(false);
  });
});

describe("handleInboundSmsCompliance — records opt-out/in, reply held by default", () => {
  const parsed = (body: string) => ({
    senderPhone: "5712256138",
    body,
    externalMessageId: "m1",
  });

  it("STOP records the opt-out against the normalized E.164 and does NOT reply by default", async () => {
    const processStop = vi.fn().mockResolvedValue(1);
    const processStart = vi.fn();
    const sendReply = vi.fn();

    const res = await handleInboundSmsCompliance(parsed("STOP"), {
      processStop,
      processStart,
      sendReply,
    });

    expect(processStop).toHaveBeenCalledWith("+15712256138", "STOP");
    expect(res).toMatchObject({ kind: "stop", recorded: true, replied: false });
    expect(sendReply).not.toHaveBeenCalled();
  });

  it("START with a pending welcome scopes the opt-in to THAT org (#402)", async () => {
    const processStart = vi.fn().mockResolvedValue(1);
    const findPending = vi
      .fn()
      .mockResolvedValue({ id: "row-1", organizationId: "org-a" });
    const res = await handleInboundSmsCompliance(parsed("YES"), {
      processStop: vi.fn(),
      processStart,
      findPending,
      sendReply: vi.fn(),
    });
    // The org whose welcome text this YES answers — never org-wide, which
    // would promote pending rows in orgs that never contacted this person.
    expect(processStart).toHaveBeenCalledWith("+15712256138", "YES", {
      organizationId: "org-a",
    });
    expect(res).toMatchObject({ kind: "start", recorded: true });
  });

  it("START with no pending welcome passes no org — restore-only semantics", async () => {
    const processStart = vi.fn().mockResolvedValue(1);
    const res = await handleInboundSmsCompliance(parsed("START"), {
      processStop: vi.fn(),
      processStart,
      findPending: vi.fn().mockResolvedValue(null),
      sendReply: vi.fn(),
    });
    expect(processStart).toHaveBeenCalledWith("+15712256138", "START", {});
    expect(res).toMatchObject({ kind: "start", recorded: true });
  });

  it("HELP is detected but records nothing and doesn't mutate state", async () => {
    const processStop = vi.fn();
    const processStart = vi.fn();
    const res = await handleInboundSmsCompliance(parsed("HELP"), {
      processStop,
      processStart,
      sendReply: vi.fn(),
    });
    expect(res).toMatchObject({ kind: "help", recorded: false });
    expect(processStop).not.toHaveBeenCalled();
    expect(processStart).not.toHaveBeenCalled();
  });

  it("a non-keyword message is a no-op (kind:none)", async () => {
    const res = await handleInboundSmsCompliance(parsed("what time is practice?"), {
      processStop: vi.fn(),
      processStart: vi.fn(),
      sendReply: vi.fn(),
    });
    expect(res).toMatchObject({ kind: "none", recorded: false, replied: false });
  });

  it("sends the confirmation only when autoReply is explicitly enabled", async () => {
    const sendReply = vi.fn().mockResolvedValue(undefined);
    const res = await handleInboundSmsCompliance(parsed("STOP"), {
      processStop: vi.fn().mockResolvedValue(1),
      processStart: vi.fn(),
      sendReply,
      autoReply: true,
    });
    expect(sendReply).toHaveBeenCalledTimes(1);
    expect(sendReply.mock.calls[0][0]).toBe("+15712256138");
    expect(res).toMatchObject({ kind: "stop", replied: true });
  });
});
