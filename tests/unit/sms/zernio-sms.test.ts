import { describe, it, expect } from "vitest";
import {
  createZernioSmsClient,
  createZernioSmsClientFromEnv,
  isZernioSmsConfigured,
} from "@/lib/sms/zernio-sms";

interface Captured {
  url?: string;
  init?: { method?: string; headers?: Record<string, string>; body?: string };
}

function fakeFetch(captured: Captured, responseBody: unknown = { id: "sms_1", conversationId: "c1", status: "sent" }, status = 200) {
  return async (url: string, init: Captured["init"]) => {
    captured.url = url;
    captured.init = init;
    return new Response(JSON.stringify(responseBody), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  };
}

describe("Zernio SMS client", () => {
  it("send posts to /sms/messages with bearer auth and from/to/text body, returning the id", async () => {
    const captured: Captured = {};
    const client = createZernioSmsClient({
      apiKey: "test-key",
      from: "+16145550100",
      fetchImpl: fakeFetch(captured) as unknown as typeof fetch,
    });

    const res = await client.send({ to: "+16145550111", text: "Practice at 5pm" });

    expect(captured.url).toBe("https://zernio.com/api/v1/sms/messages");
    expect(captured.init?.method).toBe("POST");
    expect(captured.init?.headers?.["Authorization"]).toBe("Bearer test-key");
    expect(captured.init?.headers?.["Content-Type"]).toBe("application/json");
    expect(JSON.parse(captured.init?.body ?? "{}")).toEqual({
      from: "+16145550100",
      to: "+16145550111",
      text: "Practice at 5pm",
    });
    expect(res).toEqual({ id: "sms_1", conversationId: "c1", status: "sent" });
  });

  it("send includes mediaUrls when provided (MMS)", async () => {
    const captured: Captured = {};
    const client = createZernioSmsClient({
      apiKey: "k",
      from: "+16145550100",
      fetchImpl: fakeFetch(captured) as unknown as typeof fetch,
    });

    await client.send({ to: "+16145550111", text: "flyer", mediaUrls: ["https://x/y.jpg"] });

    expect(JSON.parse(captured.init?.body ?? "{}")).toEqual({
      from: "+16145550100",
      to: "+16145550111",
      text: "flyer",
      mediaUrls: ["https://x/y.jpg"],
    });
  });

  it("send throws with the API error detail on 404 (no SMS-enabled number)", async () => {
    const captured: Captured = {};
    const client = createZernioSmsClient({
      apiKey: "k",
      from: "+16145550100",
      fetchImpl: fakeFetch(captured, { error: "No SMS-enabled number matches from" }, 404) as unknown as typeof fetch,
    });

    await expect(client.send({ to: "+16145550111", text: "hi" })).rejects.toThrow(
      /404.*No SMS-enabled number matches from/,
    );
  });

  it("send throws with the API error detail on 502 (carrier failed)", async () => {
    const captured: Captured = {};
    const client = createZernioSmsClient({
      apiKey: "k",
      from: "+16145550100",
      fetchImpl: fakeFetch(captured, { error: "Carrier send failed" }, 502) as unknown as typeof fetch,
    });

    await expect(client.send({ to: "+16145550111", text: "hi" })).rejects.toThrow(/502.*Carrier send failed/);
  });
});

describe("Zernio SMS config from env", () => {
  it("isZernioSmsConfigured is true only when both API key and from number are present", () => {
    expect(isZernioSmsConfigured({ ZERNIO_API_KEY: "k", ZERNIO_SMS_FROM: "+16145550100" })).toBe(true);
    expect(isZernioSmsConfigured({ ZERNIO_API_KEY: "k" })).toBe(false);
    expect(isZernioSmsConfigured({ ZERNIO_SMS_FROM: "+16145550100" })).toBe(false);
    expect(isZernioSmsConfigured({})).toBe(false);
  });

  it("createZernioSmsClientFromEnv throws a clear error when ZERNIO_API_KEY is missing", () => {
    expect(() => createZernioSmsClientFromEnv({ ZERNIO_SMS_FROM: "+16145550100" })).toThrow(/ZERNIO_API_KEY/);
  });

  it("createZernioSmsClientFromEnv throws a clear error when ZERNIO_SMS_FROM is missing", () => {
    expect(() => createZernioSmsClientFromEnv({ ZERNIO_API_KEY: "k" })).toThrow(/ZERNIO_SMS_FROM/);
  });

  it("createZernioSmsClientFromEnv builds a client that sends with the env-supplied credentials", async () => {
    const captured: Captured = {};
    const client = createZernioSmsClientFromEnv(
      { ZERNIO_API_KEY: "env-key", ZERNIO_SMS_FROM: "+16145550100" },
      fakeFetch(captured) as unknown as typeof fetch,
    );

    await client.send({ to: "+16145550111", text: "hi" });

    expect(captured.init?.headers?.["Authorization"]).toBe("Bearer env-key");
    expect(JSON.parse(captured.init?.body ?? "{}")).toEqual({
      from: "+16145550100",
      to: "+16145550111",
      text: "hi",
    });
  });
});
