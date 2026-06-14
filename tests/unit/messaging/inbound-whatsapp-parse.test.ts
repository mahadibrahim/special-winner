import { describe, it, expect } from "vitest";
import { parseInboundWhatsAppMessage } from "@/lib/messaging/inbound-whatsapp";

/**
 * The exact Zernio inbound-message webhook envelope is UNCONFIRMED in their
 * public docs (same caveat as the social-publish payload in webhooks/zernio.ts).
 * The parser is deliberately defensive: it accepts the documented candidate
 * shapes/field names and refuses anything it can't positively identify as a 1:1
 * inbound text message, so the live social-publish path is never disturbed.
 */
describe("parseInboundWhatsAppMessage", () => {
  it("parses a flat { message } inbound event", () => {
    const out = parseInboundWhatsAppMessage({
      event: "message.received",
      message: { from: "+16145550182", text: "Is practice still on tonight?", id: "wamid.ABC" },
    });
    expect(out).toEqual({
      senderPhone: "+16145550182",
      body: "Is practice still on tonight?",
      externalMessageId: "wamid.ABC",
    });
  });

  it("parses a Meta-style nested text.body shape", () => {
    const out = parseInboundWhatsAppMessage({
      messages: [{ from: "16145550182", type: "text", text: { body: "Hi" }, id: "wamid.X" }],
    });
    expect(out).toEqual({
      senderPhone: "16145550182",
      body: "Hi",
      externalMessageId: "wamid.X",
    });
  });

  it("tolerates alternate field names (sender / body / messageId)", () => {
    const out = parseInboundWhatsAppMessage({
      data: { message: { sender: "+16145550182", body: "yes", messageId: "m-1" } },
    });
    expect(out).toEqual({
      senderPhone: "+16145550182",
      body: "yes",
      externalMessageId: "m-1",
    });
  });

  it("returns null for a social-publish event (has a `post` field)", () => {
    expect(
      parseInboundWhatsAppMessage({ event: "post.published", post: { _id: "p1", url: "x" } }),
    ).toBeNull();
  });

  it("returns null for a WhatsApp group message (JID ends in @g.us)", () => {
    expect(
      parseInboundWhatsAppMessage({
        message: { from: "123456789-987@g.us", text: "team chatter", id: "g-1" },
      }),
    ).toBeNull();
  });

  it("returns null for an explicit group id field", () => {
    expect(
      parseInboundWhatsAppMessage({
        message: { from: "+16145550182", text: "x", id: "1", groupId: "g-9" },
      }),
    ).toBeNull();
  });

  it("returns null for an outbound echo (fromMe / direction outbound)", () => {
    expect(
      parseInboundWhatsAppMessage({
        message: { from: "+16145550182", text: "x", id: "1", fromMe: true },
      }),
    ).toBeNull();
    expect(
      parseInboundWhatsAppMessage({
        message: { from: "+16145550182", text: "x", id: "1", direction: "outbound" },
      }),
    ).toBeNull();
  });

  it("returns null for a non-text message with no extractable body", () => {
    expect(
      parseInboundWhatsAppMessage({
        message: { from: "+16145550182", type: "image", id: "1" },
      }),
    ).toBeNull();
  });

  it("returns null when sender or id is missing", () => {
    expect(parseInboundWhatsAppMessage({ message: { text: "hi", id: "1" } })).toBeNull();
    expect(parseInboundWhatsAppMessage({ message: { from: "+1614", text: "hi" } })).toBeNull();
  });

  it("returns null for empty/garbage input", () => {
    expect(parseInboundWhatsAppMessage(null)).toBeNull();
    expect(parseInboundWhatsAppMessage("nope")).toBeNull();
    expect(parseInboundWhatsAppMessage({})).toBeNull();
  });

  it("trims surrounding whitespace from the body", () => {
    const out = parseInboundWhatsAppMessage({
      message: { from: "+16145550182", text: "  hello  ", id: "m" },
    });
    expect(out?.body).toBe("hello");
  });
});
