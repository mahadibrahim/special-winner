import type { Page } from "@playwright/test";

/**
 * Waits for a page's client-side data fetch to finish rendering before a
 * screenshot is taken.
 *
 * Every admin/coach/media/referee page in this app fetches its real content
 * client-side in a useEffect after mount (roster-table.tsx,
 * coach-dashboard-overview.tsx, attendance-tracker.tsx, the venue command
 * center, ...) — `waitForHydration()` only confirms the top-level React
 * component mounted, not that the fetch resolved. An immediate screenshot
 * after `page.goto()` + `waitForHydration()` reliably catches the app
 * mid-fetch, showing a bare loading placeholder instead of the real screen —
 * confirmed by reviewing this exact defect in the first "Using the system"
 * product-tour capture pass. Two different loading idioms show up across
 * this codebase, so both are checked: Lucide's spinning `Loader2` icon
 * (always rendered with the `animate-spin` Tailwind class — coach dashboard,
 * attendance tracker), and the shared `<LoadingSkeleton />` component's
 * shimmer bars, marked `aria-busy="true"` per
 * src/components/ui/loading-skeleton.tsx (the venue command center).
 *
 * A plain `waitForSelector(..., { state: "detached" })` resolves immediately
 * (false negative) if called before the loading indicator has even
 * mounted, so this waits a short beat first to let the fetch kick off and
 * the indicator actually appear, then polls for both to fully clear.
 * Fail-soft: if a loading indicator is still present after the timeout (a
 * genuinely slow query, or a page with no indicator at all), this resolves
 * anyway rather than blocking the whole tour — a screenshot with a
 * lingering spinner/skeleton is a real, honest thing to notice and caption
 * around, not a reason to hang the capture run.
 */
export async function waitForContentReady(page: Page, timeoutMs = 10_000): Promise<void> {
  await page.waitForTimeout(600);
  await page
    .waitForFunction(
      () =>
        document.querySelectorAll(".animate-spin").length === 0 &&
        document.querySelectorAll('[aria-busy="true"]').length === 0,
      undefined,
      { timeout: timeoutMs },
    )
    .catch(() => {});
}
