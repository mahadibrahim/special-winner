import { describe, it, expect } from "vitest";
import {
  createZernioClient,
  createZernioClientFromEnv,
  isZernioConfigured,
} from "@/lib/zernio/messaging";

interface Captured {
  url?: string;
  init?: { method?: string; headers?: Record<string, string>; body?: string };
}

/**
 * A fetch stand-in that records the request and returns a canned JSON response.
 * Dependency injection (per TDD guidance) — no global fetch mocking.
 */
function fakeFetch(captured: Captured, responseBody: unknown = { ok: true }, status = 200) {
  return async (url: string, init: Captured["init"]) => {
    captured.url = url;
    captured.init = init;
    return new Response(JSON.stringify(responseBody), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  };
}

describe("Zernio messaging client", () => {
  it("sendInboxMessage posts to the conversation messages endpoint with bearer auth and accountId body", async () => {
    const captured: Captured = {};
    const client = createZernioClient({
      apiKey: "test-key",
      accountId: "acct-1",
      fetchImpl: fakeFetch(captured) as unknown as typeof fetch,
    });

    await client.sendInboxMessage({ conversationId: "conv-9", message: "Hello team!" });

    expect(captured.url).toBe(
      "https://zernio.com/api/v1/inbox/conversations/conv-9/messages",
    );
    expect(captured.init?.method).toBe("POST");
    expect(captured.init?.headers?.["Authorization"]).toBe("Bearer test-key");
    expect(captured.init?.headers?.["Content-Type"]).toBe("application/json");
    expect(JSON.parse(captured.init?.body ?? "{}")).toEqual({
      accountId: "acct-1",
      message: "Hello team!",
    });
  });

  it("createWhatsAppGroup posts the group config and returns normalized groupId + inviteLink", async () => {
    const captured: Captured = {};
    const client = createZernioClient({
      apiKey: "k",
      accountId: "acct-1",
      fetchImpl: fakeFetch(captured, {
        group: { groupId: "g-123", inviteLink: "https://chat.whatsapp.com/abc" },
      }) as unknown as typeof fetch,
    });

    const group = await client.createWhatsAppGroup({
      subject: "Thunder — Parents",
      description: "Team channel",
      joinApprovalMode: "approval_required",
    });

    expect(captured.url).toBe("https://zernio.com/api/v1/whatsapp/wa-groups");
    expect(captured.init?.method).toBe("POST");
    expect(JSON.parse(captured.init?.body ?? "{}")).toEqual({
      accountId: "acct-1",
      subject: "Thunder — Parents",
      description: "Team channel",
      joinApprovalMode: "approval_required",
    });
    expect(group).toEqual({
      groupId: "g-123",
      inviteLink: "https://chat.whatsapp.com/abc",
    });
  });

  it("createWhatsAppGroup tolerates a { data: { group } } response envelope", async () => {
    const captured: Captured = {};
    const client = createZernioClient({
      apiKey: "k",
      accountId: "acct-1",
      fetchImpl: fakeFetch(captured, {
        data: { group: { groupId: "g-9", inviteLink: "https://chat.whatsapp.com/z" } },
      }) as unknown as typeof fetch,
    });

    const group = await client.createWhatsAppGroup({ subject: "X" });

    expect(group).toEqual({ groupId: "g-9", inviteLink: "https://chat.whatsapp.com/z" });
  });

  it("addGroupParticipants chunks into requests of at most 8 participants", async () => {
    const calls: Captured[] = [];
    const fetchImpl = (async (url: string, init: Captured["init"]) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as unknown as typeof fetch;
    const client = createZernioClient({ apiKey: "k", accountId: "acct-1", fetchImpl });
    const phones = Array.from({ length: 9 }, (_, i) => `+1614555000${i}`);

    await client.addGroupParticipants({ groupId: "g-1", phoneNumbers: phones });

    expect(calls.length).toBe(2);
    expect(calls[0].url).toBe(
      "https://zernio.com/api/v1/whatsapp/wa-groups/g-1/participants?accountId=acct-1",
    );
    expect(calls[0].init?.method).toBe("POST");
    expect(JSON.parse(calls[0].init?.body ?? "{}").phoneNumbers).toHaveLength(8);
    expect(JSON.parse(calls[1].init?.body ?? "{}").phoneNumbers).toHaveLength(1);
  });

  it("addGroupParticipants makes no request for an empty list", async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls++;
      return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });
    }) as unknown as typeof fetch;
    const client = createZernioClient({ apiKey: "k", accountId: "acct-1", fetchImpl });

    await client.addGroupParticipants({ groupId: "g-1", phoneNumbers: [] });

    expect(calls).toBe(0);
  });

  it("removeGroupParticipants chunks into DELETE requests of at most 8 participants", async () => {
    const calls: Captured[] = [];
    const fetchImpl = (async (url: string, init: Captured["init"]) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as unknown as typeof fetch;
    const client = createZernioClient({ apiKey: "k", accountId: "acct-1", fetchImpl });
    const phones = Array.from({ length: 9 }, (_, i) => `+1614555000${i}`);

    await client.removeGroupParticipants({ groupId: "g-1", phoneNumbers: phones });

    expect(calls.length).toBe(2);
    expect(calls[0].url).toBe(
      "https://zernio.com/api/v1/whatsapp/wa-groups/g-1/participants?accountId=acct-1",
    );
    expect(calls[0].init?.method).toBe("DELETE");
    expect(JSON.parse(calls[0].init?.body ?? "{}").phoneNumbers).toHaveLength(8);
    expect(JSON.parse(calls[1].init?.body ?? "{}").phoneNumbers).toHaveLength(1);
  });

  it("removeGroupParticipants makes no request for an empty list", async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls++;
      return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });
    }) as unknown as typeof fetch;
    const client = createZernioClient({ apiKey: "k", accountId: "acct-1", fetchImpl });

    await client.removeGroupParticipants({ groupId: "g-1", phoneNumbers: [] });

    expect(calls).toBe(0);
  });

  it("createGroupInviteLink posts to the invite-link endpoint and returns the link", async () => {
    const captured: Captured = {};
    const client = createZernioClient({
      apiKey: "k",
      accountId: "acct-1",
      fetchImpl: fakeFetch(captured, {
        inviteLink: "https://chat.whatsapp.com/new",
      }) as unknown as typeof fetch,
    });

    const link = await client.createGroupInviteLink({ groupId: "g-1" });

    expect(captured.url).toBe(
      "https://zernio.com/api/v1/whatsapp/wa-groups/g-1/invite-link?accountId=acct-1",
    );
    expect(captured.init?.method).toBe("POST");
    expect(link).toBe("https://chat.whatsapp.com/new");
  });
});

describe("Zernio client config from env", () => {
  it("isZernioConfigured is true only when both API key and account id are present", () => {
    expect(isZernioConfigured({ ZERNIO_API_KEY: "k", ZERNIO_ACCOUNT_ID: "a" })).toBe(true);
    expect(isZernioConfigured({ ZERNIO_API_KEY: "k" })).toBe(false);
    expect(isZernioConfigured({ ZERNIO_ACCOUNT_ID: "a" })).toBe(false);
    expect(isZernioConfigured({})).toBe(false);
  });

  it("createZernioClientFromEnv throws a clear error when ZERNIO_API_KEY is missing", () => {
    expect(() => createZernioClientFromEnv({ ZERNIO_ACCOUNT_ID: "a" })).toThrow(/ZERNIO_API_KEY/);
  });

  it("createZernioClientFromEnv throws a clear error when ZERNIO_ACCOUNT_ID is missing", () => {
    expect(() => createZernioClientFromEnv({ ZERNIO_API_KEY: "k" })).toThrow(/ZERNIO_ACCOUNT_ID/);
  });

  it("createZernioClientFromEnv builds a client that sends with the env-supplied credentials", async () => {
    const captured: Captured = {};
    const client = createZernioClientFromEnv(
      { ZERNIO_API_KEY: "env-key", ZERNIO_ACCOUNT_ID: "env-acct" },
      fakeFetch(captured) as unknown as typeof fetch,
    );

    await client.sendInboxMessage({ conversationId: "c1", message: "hi" });

    expect(captured.init?.headers?.["Authorization"]).toBe("Bearer env-key");
    expect(JSON.parse(captured.init?.body ?? "{}")).toEqual({
      accountId: "env-acct",
      message: "hi",
    });
  });
});
