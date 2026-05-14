/**
 * Thin typed wrapper over PostHog's global capture. `window.posthog` is
 * installed by src/components/posthog.astro with a noop fallback when no API
 * key is configured, so these calls are always safe to make client-side.
 */
type PosthogLike = { capture: (event: string, props?: Record<string, unknown>) => void };

export function track(event: string, props?: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  const ph = (window as unknown as { posthog?: PosthogLike }).posthog;
  ph?.capture(event, props);
}
