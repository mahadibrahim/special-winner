import { describe, it, expect } from "vitest";
import {
  resolveChannelOrder,
  DEFAULT_CHANNEL_ORDER,
  PAYMENT_REMINDER_CHANNEL_ORDER,
  type UserChannelInfo,
} from "@/lib/dropin/messages/dispatch";

function user(overrides: Partial<UserChannelInfo> = {}): UserChannelInfo {
  return {
    id: "u1",
    email: "u1@example.com",
    firstName: "Alex",
    phone: "+16145550000",
    phoneVerified: true,
    telegramChatId: null,
    primaryChannel: null,
    fallbackChannel: null,
    ...overrides,
  };
}

describe("resolveChannelOrder", () => {
  it("defaults to email-first when the user has no explicit preference and no order override", () => {
    const order = resolveChannelOrder(user());
    expect(order[0]).toBe("email");
  });

  it("PAYMENT_REMINDER_CHANNEL_ORDER prefers SMS first when the user has a verified phone", () => {
    const order = resolveChannelOrder(user(), PAYMENT_REMINDER_CHANNEL_ORDER);
    expect(order[0]).toBe("sms");
  });

  it("falls back to email when SMS-first is requested but the user has no verified phone", () => {
    const order = resolveChannelOrder(
      user({ phone: null, phoneVerified: false }),
      PAYMENT_REMINDER_CHANNEL_ORDER,
    );
    expect(order[0]).toBe("email");
  });

  it("an explicit messagingPrimaryChannel preference wins over the SMS-first default", () => {
    const order = resolveChannelOrder(
      user({ primaryChannel: "email" }),
      PAYMENT_REMINDER_CHANNEL_ORDER,
    );
    expect(order[0]).toBe("email");
    // SMS is still reachable — it should appear later in the order, not be dropped.
    expect(order).toContain("sms");
  });

  it("an explicit messagingPrimaryChannel of sms is honored even under the default (email-first) order", () => {
    const order = resolveChannelOrder(user({ primaryChannel: "sms" }));
    expect(order[0]).toBe("sms");
  });

  it("passing PAYMENT_REMINDER_CHANNEL_ORDER does not mutate DEFAULT_CHANNEL_ORDER", () => {
    // Guards the "shared default" contract in the module docstring — the
    // per-message override must never leak into other dispatch call sites.
    expect(DEFAULT_CHANNEL_ORDER).toEqual(["email", "sms", "telegram"]);
    resolveChannelOrder(user(), PAYMENT_REMINDER_CHANNEL_ORDER);
    expect(DEFAULT_CHANNEL_ORDER).toEqual(["email", "sms", "telegram"]);
  });
});
