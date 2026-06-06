import { describe, it, expect, vi } from "vitest";
import {
  markPublished,
  markSyncError,
  type NotionWritebackConfig,
} from "@/lib/zernio/notionWriteback";

const DS_ID = "074e4309-ad17-46b4-9b65-a70f63305be7";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Build a fake fetch that returns a query result on the data-source query call
 * and records page-update (PATCH) calls.
 */
function makeFetch(queryResults: unknown[]) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchImpl = vi.fn(async (url: string | URL, init?: RequestInit) => {
    const u = String(url);
    calls.push({ url: u, init: init ?? {} });
    if (u.includes("/data_sources/") && u.endsWith("/query")) {
      return jsonResponse({ object: "list", results: queryResults });
    }
    if (u.includes("/pages/")) {
      return jsonResponse({ object: "page", id: "page-123" });
    }
    throw new Error(`unexpected fetch to ${u}`);
  });
  return { fetchImpl, calls };
}

function config(fetchImpl: NotionWritebackConfig["fetchImpl"]): NotionWritebackConfig {
  return { token: "ntn_test_token", dataSourceId: DS_ID, fetchImpl };
}

function row(props: Record<string, unknown>) {
  return { object: "page", id: "page-123", properties: props };
}

describe("markPublished", () => {
  it("queries the data source for the Zernio post ID and PATCHes Live URL + Status=Published", async () => {
    const { fetchImpl, calls } = makeFetch([
      row({ Status: { select: { name: "Loaded" } }, "Live URL": { url: null } }),
    ]);

    const result = await markPublished("post_abc", "https://instagram.com/p/xyz", config(fetchImpl));

    expect(result).toEqual({ matched: true, alreadyPublished: false });

    // First call: query the data source.
    expect(calls[0].url).toContain(`/data_sources/${DS_ID}/query`);
    const queryBody = JSON.parse(String(calls[0].init.body));
    expect(queryBody.filter.property).toBe("Zernio post ID");
    // contains (not equals) so a per-platform JSON-map value still matches.
    expect(queryBody.filter.rich_text.contains).toBe("post_abc");

    // Second call: PATCH the matched page.
    expect(calls[1].url).toContain("/pages/page-123");
    expect(calls[1].init.method).toBe("PATCH");
    const patchBody = JSON.parse(String(calls[1].init.body));
    expect(patchBody.properties["Live URL"].url).toBe("https://instagram.com/p/xyz");
    expect(patchBody.properties.Status.select.name).toBe("Published");
  });

  it("is idempotent: an already-Published row with a Live URL is not re-written", async () => {
    const { fetchImpl, calls } = makeFetch([
      row({
        Status: { select: { name: "Published" } },
        "Live URL": { url: "https://instagram.com/p/xyz" },
      }),
    ]);

    const result = await markPublished("post_abc", "https://instagram.com/p/xyz", config(fetchImpl));

    expect(result).toEqual({ matched: true, alreadyPublished: true });
    // Only the query call — no PATCH.
    expect(calls).toHaveLength(1);
  });

  it("returns {matched:false} without throwing when no row matches", async () => {
    const { fetchImpl, calls } = makeFetch([]);

    const result = await markPublished("post_nope", "https://x", config(fetchImpl));

    expect(result).toEqual({ matched: false });
    expect(calls).toHaveLength(1); // query only
  });

  it("throws when the Notion query fails (non-2xx)", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ message: "rate limited" }, 429));
    await expect(markPublished("post_abc", "https://x", config(fetchImpl))).rejects.toThrow();
  });

  it("throws when the Notion page update fails (non-2xx)", async () => {
    const fetchImpl = vi.fn(async (url: string | URL) => {
      const u = String(url);
      if (u.endsWith("/query")) {
        return jsonResponse({ results: [row({ Status: { select: { name: "Loaded" } }, "Live URL": { url: null } })] });
      }
      return jsonResponse({ message: "conflict" }, 409);
    });
    await expect(markPublished("post_abc", "https://x", config(fetchImpl))).rejects.toThrow();
  });
});

describe("markSyncError", () => {
  it("queries for the Zernio post ID and PATCHes the Sync error text", async () => {
    const { fetchImpl, calls } = makeFetch([
      row({ Status: { select: { name: "Loaded" } }, "Live URL": { url: null } }),
    ]);

    const result = await markSyncError("post_abc", "Instagram auth expired", config(fetchImpl));

    expect(result).toEqual({ matched: true });
    expect(calls[1].url).toContain("/pages/page-123");
    expect(calls[1].init.method).toBe("PATCH");
    const patchBody = JSON.parse(String(calls[1].init.body));
    expect(patchBody.properties["Sync error"].rich_text[0].text.content).toBe(
      "Instagram auth expired",
    );
  });

  it("returns {matched:false} without throwing when no row matches", async () => {
    const { fetchImpl, calls } = makeFetch([]);
    const result = await markSyncError("post_nope", "err", config(fetchImpl));
    expect(result).toEqual({ matched: false });
    expect(calls).toHaveLength(1);
  });
});
