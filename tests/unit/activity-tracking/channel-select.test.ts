import { describe, it, expect } from "vitest";
import { workerChannelsConfigured } from "@/lib/activity-tracking/dispatch";

describe("workerChannelsConfigured", () => {
  it("returns email + telegram + sms for fully-configured worker", () => {
    expect(
      workerChannelsConfigured({
        email: "x@t.com",
        telegramChatId: "tc1",
        phone: "+15551234567",
      }).sort(),
    ).toEqual(["email", "sms", "telegram"]);
  });

  it("excludes telegram when telegramChatId is null", () => {
    expect(
      workerChannelsConfigured({
        email: "x@t.com",
        telegramChatId: null,
        phone: "+15551234567",
      }),
    ).not.toContain("telegram");
  });

  it("excludes sms when phone is null", () => {
    expect(
      workerChannelsConfigured({
        email: "x@t.com",
        telegramChatId: null,
        phone: null,
      }),
    ).toEqual(["email"]);
  });
});
