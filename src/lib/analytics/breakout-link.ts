/**
 * Pure builder for the in-app-browser escape banner (Wave 3, Task 3). Given
 * the current page href and a UA string, produces a one-tap "open in real
 * browser" link:
 *  - iOS (Instagram/FB webviews on iPhone/iPad): the `x-safari-` URL scheme
 *    hands the URL straight to Safari.
 *  - Android: an `intent://` URL that opens Chrome, falling back to the
 *    webview's own browser_fallback_url if Chrome isn't installed.
 *  - Anything else (desktop UA, no UA, unparseable/non-https href): no
 *    breakout is offered.
 *
 * No DOM access here — takes href/ua as plain strings so it's trivially unit
 * testable and safe to call during SSR.
 */
export type BreakoutKind = "ios" | "android" | "none";

export interface BreakoutResult {
  kind: BreakoutKind;
  url: string | null;
}

const IOS_UA = /\b(iPhone|iPad|iPod)\b/i;
const ANDROID_UA = /\bAndroid\b/i;

const NONE: BreakoutResult = { kind: "none", url: null };

export function buildBreakoutUrl(currentHref: string, ua?: string): BreakoutResult {
  if (!ua) return NONE;

  let parsed: URL;
  try {
    parsed = new URL(currentHref);
  } catch {
    return NONE;
  }
  if (parsed.protocol !== "https:") return NONE;

  if (IOS_UA.test(ua)) {
    return { kind: "ios", url: `x-safari-${currentHref}` };
  }

  if (ANDROID_UA.test(ua)) {
    const fallback = encodeURIComponent(currentHref);
    const url = `intent://${parsed.host}${parsed.pathname}${parsed.search}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${fallback};end`;
    return { kind: "android", url };
  }

  return NONE;
}
