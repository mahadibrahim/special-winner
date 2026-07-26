/**
 * Thin typed wrapper over PostHog's global capture. `window.posthog` is
 * installed by src/components/posthog.astro with a noop fallback when no API
 * key is configured, so these calls are always safe to make client-side.
 */
type PosthogLike = {
  capture: (event: string, props?: Record<string, unknown>) => void;
  get_session_id?: () => string | undefined;
};

export function track(event: string, props?: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  const ph = (window as unknown as { posthog?: PosthogLike }).posthog;
  ph?.capture(event, props);
}

/**
 * Header carrying the browser's PostHog session id, to spread into fetch()
 * headers on checkout-adjacent API calls. Server routes read it
 * (X-PostHog-Session-Id) and stamp $session_id on their posthog-node
 * captures — and thread it through Stripe metadata to the webhook — so
 * server-fired funnel events land in the same session as the client's.
 * Empty object when PostHog isn't loaded (noop-safe, like track()).
 */
export function phSessionHeader(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const ph = (window as unknown as { posthog?: PosthogLike }).posthog;
  const sessionId = ph?.get_session_id?.();
  return sessionId ? { "X-PostHog-Session-Id": sessionId } : {};
}
