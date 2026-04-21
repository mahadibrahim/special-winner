import { useEffect } from "react";

/**
 * Sets `data-hydrated="true"` on <html> once this component has mounted and
 * its first effect has run. Playwright E2E tests can wait for this attribute
 * to know React has hydrated and event handlers are attached, which avoids
 * a whole class of flakes where clicks/keys land on SSR'd DOM before the
 * listeners are live.
 *
 * Use this in the top-level client:load React component on any page that
 * e2e tests interact with. One beacon per page is enough — every client:load
 * component shares the same <html>.
 *
 * In tests:
 *   await waitForHydration(page) // see tests/utils/test-helpers.ts
 */
export function useHydrationBeacon(): void {
  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.setAttribute("data-hydrated", "true");
    }
  }, []);
}
