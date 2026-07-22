/**
 * Meta's in-app webviews (Instagram / Facebook) break autofill, wallet
 * payments and OAuth. We stamp this on registration analytics (PostHog's
 * $browser is unreliable for webviews) and later use it for the escape
 * banner (Wave 3).
 */
const IN_APP_UA = /\b(Instagram|FBAN|FBAV|FB_IAB)\b/i;

export function isInAppBrowser(
  ua: string | undefined = typeof navigator !== "undefined" ? navigator.userAgent : undefined,
): boolean {
  return ua != null && IN_APP_UA.test(ua);
}
