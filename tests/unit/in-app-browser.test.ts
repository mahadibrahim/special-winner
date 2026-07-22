import { describe, it, expect } from "vitest";
import { isInAppBrowser } from "@/lib/analytics/in-app-browser";

const IG = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/21F90 Instagram 334.0.4.32.98";
const FB = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 [FBAN/FBIOS;FBAV/438.0.0.34.116;]";
const SAFARI = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";

describe("isInAppBrowser", () => {
  it("detects Instagram", () => expect(isInAppBrowser(IG)).toBe(true));
  it("detects Facebook (FBAN/FBAV)", () => expect(isInAppBrowser(FB)).toBe(true));
  it("passes real Safari", () => expect(isInAppBrowser(SAFARI)).toBe(false));
  it("is false with no UA (SSR)", () => expect(isInAppBrowser(undefined)).toBe(false));
});
