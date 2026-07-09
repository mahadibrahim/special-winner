import { describe, it, expect } from "vitest";
import { dispatchToProvider } from "@/lib/sms/send";

interface Captured {
  url?: string;
  init?: { method?: string; headers?: Record<string, string>; body?: string };
}

function fakeFetch(captured: Captured, responseBody: unknown = { id: "sms_9", status: "sent" }, status = 200) {
  return async (url: string, init: Captured["init"]) => {
    captured.url = url;
    captured.init = init;
    return new Response(JSON.stringify(responseBody), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  };
}

describe("dispatchToProvider", () => {
  it("routes to Zernio and returns the Zernio message id as messageId when SMS_PROVIDER=zernio", async () => {
    const captured: Captured = {};
    const res = await dispatchToProvider(
      { to: "+16145550111", text: "Game moved to 6pm" },
      { SMS_PROVIDER: "zernio", ZERNIO_API_KEY: "k", ZERNIO_SMS_FROM: "+16145550100" },
      fakeFetch(captured) as unknown as typeof fetch,
    );

    expect(captured.url).toBe("https://zernio.com/api/v1/sms/messages");
    expect(JSON.parse(captured.init?.body ?? "{}")).toEqual({
      from: "+16145550100",
      to: "+16145550111",
      text: "Game moved to 6pm",
    });
    expect(res).toEqual({ messageId: "sms_9" });
  });

  it("propagates a Zernio transport error (so sendSms maps it to provider_error)", async () => {
    const captured: Captured = {};
    await expect(
      dispatchToProvider(
        { to: "+16145550111", text: "hi" },
        { SMS_PROVIDER: "zernio", ZERNIO_API_KEY: "k", ZERNIO_SMS_FROM: "+16145550100" },
        fakeFetch(captured, { error: "Carrier send failed" }, 502) as unknown as typeof fetch,
      ),
    ).rejects.toThrow(/502.*Carrier send failed/);
  });
});
