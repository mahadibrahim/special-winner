import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "node:crypto";

// Mock the Notion writeback layer — the route is tested in isolation.
vi.mock("@/lib/zernio/notionWriteback", () => ({
  getNotionConfigFromEnv: vi.fn(() => ({ token: "t", dataSourceId: "ds" })),
  markPublished: vi.fn(),
  markSyncError: vi.fn(),
}));

import { POST } from "@/pages/api/webhooks/zernio";
import { markPublished, markSyncError } from "@/lib/zernio/notionWriteback";

const SECRET = "whsec_zernio_route_test";

function makeRequest(payload: unknown, opts: { secret?: string; signature?: string } = {}) {
  const body = JSON.stringify(payload);
  const sig =
    opts.signature ??
    crypto.createHmac("sha256", opts.secret ?? SECRET).update(body, "utf8").digest("hex");
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (sig !== "__omit__") headers["X-Zernio-Signature"] = sig;
  return new Request("http://localhost/api/webhooks/zernio", {
    method: "POST",
    headers,
    body,
  });
}

function call(request: Request) {
  // The route only reads `request` off the context.
  return POST({ request } as unknown as Parameters<typeof POST>[0]);
}

const published = {
  id: "evt_1",
  event: "post.published",
  timestamp: "2026-06-05T18:00:12Z",
  post: { _id: "post_abc", url: "https://instagram.com/p/xyz" },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("ZERNIO_WEBHOOK_SECRET", SECRET);
});

describe("POST /api/webhooks/zernio", () => {
  it("returns 401 when the signature is missing", async () => {
    const res = await call(makeRequest(published, { signature: "__omit__" }));
    expect(res.status).toBe(401);
    expect(markPublished).not.toHaveBeenCalled();
  });

  it("returns 401 when the signature is wrong", async () => {
    const res = await call(makeRequest(published, { signature: "deadbeef" }));
    expect(res.status).toBe(401);
    expect(markPublished).not.toHaveBeenCalled();
  });

  it("on post.published with a matching row, calls markPublished and returns 200", async () => {
    vi.mocked(markPublished).mockResolvedValue({ matched: true, alreadyPublished: false });
    const res = await call(makeRequest(published));
    expect(res.status).toBe(200);
    expect(markPublished).toHaveBeenCalledWith(
      "post_abc",
      "https://instagram.com/p/xyz",
      expect.anything(),
    );
  });

  it("on a duplicate post.published, returns 200 and does not error (idempotent)", async () => {
    vi.mocked(markPublished).mockResolvedValue({ matched: true, alreadyPublished: true });
    const res = await call(makeRequest(published));
    expect(res.status).toBe(200);
    expect(markPublished).toHaveBeenCalledTimes(1);
  });

  it("on an unknown post id, returns 200 (no retry storm) and does not 5xx", async () => {
    vi.mocked(markPublished).mockResolvedValue({ matched: false });
    const res = await call(makeRequest(published));
    expect(res.status).toBe(200);
  });

  it("returns 5xx when the Notion write throws (so Zernio retries)", async () => {
    vi.mocked(markPublished).mockRejectedValue(new Error("Notion query failed (429)"));
    const res = await call(makeRequest(published));
    expect(res.status).toBeGreaterThanOrEqual(500);
  });

  it("on post.failed, calls markSyncError and returns 200", async () => {
    vi.mocked(markSyncError).mockResolvedValue({ matched: true });
    const failed = {
      id: "evt_2",
      event: "post.failed",
      post: { _id: "post_abc", error: "Instagram token expired" },
    };
    const res = await call(makeRequest(failed));
    expect(res.status).toBe(200);
    expect(markSyncError).toHaveBeenCalledWith(
      "post_abc",
      "Instagram token expired",
      expect.anything(),
    );
  });

  it("on an unrelated event (post.scheduled), returns 200 no-op without writing", async () => {
    const scheduled = { id: "evt_3", event: "post.scheduled", post: { _id: "post_abc" } };
    const res = await call(makeRequest(scheduled));
    expect(res.status).toBe(200);
    expect(markPublished).not.toHaveBeenCalled();
    expect(markSyncError).not.toHaveBeenCalled();
  });

  it("returns 400 on a body that is not valid JSON", async () => {
    const body = "not json {";
    const sig = crypto.createHmac("sha256", SECRET).update(body, "utf8").digest("hex");
    const req = new Request("http://localhost/api/webhooks/zernio", {
      method: "POST",
      headers: { "X-Zernio-Signature": sig },
      body,
    });
    const res = await call(req);
    expect(res.status).toBe(400);
  });
});
