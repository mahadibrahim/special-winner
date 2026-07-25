import { describe, it, expect } from "vitest";
import { resolveOgOrigin, toAbsoluteUrl } from "@/lib/branding/og";

describe("resolveOgOrigin", () => {
  it("uses the real request origin for SSR pages (correct per brand domain)", () => {
    expect(
      resolveOgOrigin(false, "https://www.gosoccerone.com", "https://aspiresportsohio.com"),
    ).toBe("https://www.gosoccerone.com");
    expect(
      resolveOgOrigin(false, "https://aspiresportsohio.com", "https://aspiresportsohio.com"),
    ).toBe("https://aspiresportsohio.com");
  });

  it("falls back to the Aspire canonical origin for prerendered pages", () => {
    // Prerendered pages carry the build-time localhost origin; they are always
    // Aspire, so the fallback must win over the localhost request origin.
    expect(
      resolveOgOrigin(true, "http://localhost:4321", "https://aspiresportsohio.com"),
    ).toBe("https://aspiresportsohio.com");
  });
});

describe("toAbsoluteUrl", () => {
  it("joins a root-relative path to the origin", () => {
    expect(toAbsoluteUrl("/og/aspire-share.jpg", "https://aspiresportsohio.com")).toBe(
      "https://aspiresportsohio.com/og/aspire-share.jpg",
    );
  });

  it("resolves the page path against the origin", () => {
    expect(toAbsoluteUrl("/soccerone/leagues", "https://www.gosoccerone.com")).toBe(
      "https://www.gosoccerone.com/soccerone/leagues",
    );
  });

  it("returns an already-absolute URL unchanged (page override on a CDN)", () => {
    expect(
      toAbsoluteUrl("https://cdn.example.com/custom-og.png", "https://aspiresportsohio.com"),
    ).toBe("https://cdn.example.com/custom-og.png");
  });
});
