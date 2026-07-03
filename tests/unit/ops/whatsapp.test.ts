import { describe, it, expect, vi } from "vitest";
import { isOpsWhatsAppReady, postToOpsGroup } from "@/lib/ops/whatsapp";
import type { OrganizationSettings } from "@/lib/db/schema";

const baseSettings = {
  branding: { primaryColor: "#000" },
  contact: {},
  payments: { currency: "usd" },
  registration: {},
  notifications: {},
} as OrganizationSettings;

const envOk = { ZERNIO_API_KEY: "k", ZERNIO_ACCOUNT_ID: "a" };

describe("isOpsWhatsAppReady", () => {
  it("requires credentials AND a provisioned conversation id", () => {
    expect(isOpsWhatsAppReady(baseSettings, envOk)).toBe(false);
    const withGroup = {
      ...baseSettings,
      opsPings: { whatsapp: { groupId: "g1", conversationId: "c1" } },
    } as OrganizationSettings;
    expect(isOpsWhatsAppReady(withGroup, envOk)).toBe(true);
    expect(isOpsWhatsAppReady(withGroup, {})).toBe(false);
  });
});

describe("postToOpsGroup", () => {
  it("sends via the injected client to the stored conversation", async () => {
    const sendInboxMessage = vi.fn().mockResolvedValue({});
    const client = { sendInboxMessage } as any;
    const settings = {
      ...baseSettings,
      opsPings: { whatsapp: { groupId: "g1", conversationId: "c1" } },
    } as OrganizationSettings;

    await postToOpsGroup(settings, "hello group", client);
    expect(sendInboxMessage).toHaveBeenCalledWith({
      conversationId: "c1",
      message: "hello group",
    });
  });

  it("throws when no conversation id is stored", async () => {
    const client = { sendInboxMessage: vi.fn() } as any;
    await expect(postToOpsGroup(baseSettings, "x", client)).rejects.toThrow(
      /not provisioned/i,
    );
  });
});
