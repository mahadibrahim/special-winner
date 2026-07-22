import { describe, it, expect } from "vitest";
import { buildBreakoutUrl } from "@/lib/analytics/breakout-link";

const IOS_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 312.0.0.0.0";
const ANDROID_UA =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/124.0.0.0 Mobile Safari/537.36 Instagram 312.0.0.0.0";
const DESKTOP_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

describe("buildBreakoutUrl", () => {
  it("iOS UA -> kind ios, url is x-safari- prefixed href", () => {
    const result = buildBreakoutUrl("https://aspiresportsohio.com/register/abc123", IOS_UA);
    expect(result).toEqual({
      kind: "ios",
      url: "x-safari-https://aspiresportsohio.com/register/abc123",
    });
  });

  it("iPad UA is treated as iOS", () => {
    const ipadUa =
      "Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram";
    const result = buildBreakoutUrl("https://aspiresportsohio.com/register/abc123", ipadUa);
    expect(result.kind).toBe("ios");
  });

  it("Android UA -> kind android, intent:// url with host+path+search and encoded fallback", () => {
    const href = "https://aspiresportsohio.com/register/abc123?mode=individual&utm_source=ig";
    const result = buildBreakoutUrl(href, ANDROID_UA);
    expect(result.kind).toBe("android");
    expect(result.url).toBe(
      "intent://aspiresportsohio.com/register/abc123?mode=individual&utm_source=ig#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=" +
        encodeURIComponent(href) +
        ";end",
    );
  });

  it("desktop UA -> kind none, url null", () => {
    const result = buildBreakoutUrl("https://aspiresportsohio.com/register/abc123", DESKTOP_UA);
    expect(result).toEqual({ kind: "none", url: null });
  });

  it("preserves query string in the android intent url", () => {
    const href = "https://gosoccerone.com/register/xyz?season=fall&team=abc";
    const result = buildBreakoutUrl(href, ANDROID_UA);
    expect(result.url).toContain("gosoccerone.com/register/xyz?season=fall&team=abc#Intent");
  });

  it("refuses non-https hrefs even with an iOS UA", () => {
    const result = buildBreakoutUrl("http://aspiresportsohio.com/register/abc123", IOS_UA);
    expect(result).toEqual({ kind: "none", url: null });
  });

  it("refuses non-https hrefs even with an Android UA", () => {
    const result = buildBreakoutUrl("http://aspiresportsohio.com/register/abc123", ANDROID_UA);
    expect(result).toEqual({ kind: "none", url: null });
  });

  it("no UA provided -> kind none", () => {
    const result = buildBreakoutUrl("https://aspiresportsohio.com/register/abc123", undefined);
    expect(result).toEqual({ kind: "none", url: null });
  });

  it("malformed href (not a valid URL) -> kind none", () => {
    const result = buildBreakoutUrl("not-a-url", ANDROID_UA);
    expect(result).toEqual({ kind: "none", url: null });
  });
});
