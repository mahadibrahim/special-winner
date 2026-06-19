import { describe, it, expect } from "vitest";
import { setMarketingEdgeCache } from "@/lib/http/edge-cache";

function ctx(method: string) {
  return {
    request: new Request("https://example.test/", { method }),
    response: { headers: new Headers() },
  };
}

describe("setMarketingEdgeCache", () => {
  it("sets edge and browser cache directives on GET", () => {
    const c = ctx("GET");
    setMarketingEdgeCache(c);
    expect(c.response.headers.get("Netlify-CDN-Cache-Control")).toBe(
      "public, s-maxage=60, stale-while-revalidate=86400",
    );
    expect(c.response.headers.get("Cache-Control")).toBe(
      "public, max-age=0, must-revalidate",
    );
  });

  it("is a no-op for non-GET requests", () => {
    const c = ctx("POST");
    setMarketingEdgeCache(c);
    expect(c.response.headers.get("Netlify-CDN-Cache-Control")).toBeNull();
    expect(c.response.headers.get("Cache-Control")).toBeNull();
  });
});
