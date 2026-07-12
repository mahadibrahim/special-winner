import { test, expect } from "@playwright/test";
import { signInAsAdmin, waitForHydration } from "../utils/test-helpers";

/**
 * Pickup mode E2E — create a pickup game + rapid-add an attendee.
 *
 * Thin-seed guard: the StartPickupGame form requires at least one bookable
 * space. If the space dropdown has no options (spaces.length === 0), the form
 * shows a static message instead of the select element and cannot be
 * submitted. In that case we skip the create+roll-call flow and the test
 * passes — it is not a failure, just an empty-seed environment.
 *
 * Cleanup: POST /api/admin/pickup/start creates a real `drop_in_sessions` row
 * anchored to wall-clock "now" (see createPickupSession) — CI's DB is a
 * throwaway container per job, but it's shared across every spec file that
 * runs in the same job, so an uncleaned session here shows up as "today's"
 * data for any other admin/venue spec that runs afterward in the same job
 * (e.g. venue-command-center.spec.ts). We capture the created sessionId from
 * the start-pickup response and cancel it in `finally`, mirroring the
 * restore-shared-state convention in site-announcement.spec.ts.
 *
 * Selector notes (aligned to the actual components):
 *   "Start pickup game"        — button text in VenueCommandCenter header actions
 *   #spg-label                 — label input (htmlFor="spg-label")
 *   #spg-space                 — space select (htmlFor="spg-space")
 *   "Start game"               — submit button text in StartPickupGame
 *   "First name" label         — first-name input in PickupRollCall add row
 *   "Last name" label          — last-name input in PickupRollCall add row
 *   "Mobile" label             — phone input in PickupRollCall add row
 *   "Add"                      — submit button in PickupRollCall add row
 *   [data-pickup-attendee]     — each attendance list row in PickupRollCall
 */
test("pickup mode: create game then rapid-add an attendee", async ({
  page,
}) => {
  test.setTimeout(90_000);

  // Populated once the start-pickup API responds; cleaned up in `finally`
  // regardless of whether the rest of the test passes.
  let createdSessionId: string | null = null;

  try {
    // ── 1. Sign in + navigate to venue command center ───────────────────────
    await signInAsAdmin(page);
    await page.goto("/admin/venue", { waitUntil: "domcontentloaded" });
    await waitForHydration(page);

    // ── 2. Open the Start pickup game sheet ─────────────────────────────────
    // .first() — on an empty day the empty-state quick actions render a second
    // "Start pickup game" button below the header one; either opens the sheet,
    // but the strict-mode locator needs a single target (broke post-merge on
    // CI, where the seeded day board is empty).
    await page
      .getByRole("button", { name: "Start pickup game" })
      .first()
      .click();

    // Wait for the sheet to open — the SheetTitle text appears
    await expect(
      page.getByRole("heading", { name: /start a pickup game/i }),
    ).toBeVisible({ timeout: 15_000 });

    // ── 3. Thin-seed guard: check whether a space select is present ─────────
    // If spaces.length === 0, StartPickupGame renders a paragraph instead of a
    // <select>. We detect this by looking for the #spg-space element.
    const spaceSelect = page.locator("#spg-space");
    const hasSpaces = (await spaceSelect.count()) > 0;

    if (!hasSpaces) {
      // No bookable spaces seeded — cannot create a pickup game.
      // Close the sheet and pass gracefully.
      const cancelBtn = page
        .getByRole("button", { name: /cancel/i })
        .first();
      await cancelBtn.click();
      // eslint-disable-next-line no-console
      console.warn(
        "[pickup-mode.spec] No bookable spaces in seed — skipping create+roll-call flow.",
      );
      return;
    }

    // ── 4. Fill the form ─────────────────────────────────────────────────────
    const labelInput = page.locator("#spg-label");
    await labelInput.fill("E2E Pickup Test");

    // Space: select the first option (already pre-selected by default, but be
    // explicit to make the intent clear).
    await spaceSelect.selectOption({ index: 0 });

    // ── 5. Submit ─────────────────────────────────────────────────────────────
    // Capture the created sessionId from the response so `finally` can cancel
    // it — POST /api/admin/pickup/start returns 201 { sessionId }.
    const [startResponse] = await Promise.all([
      page.waitForResponse((res) => res.url().includes("/api/admin/pickup/start")),
      page.getByRole("button", { name: /start game/i }).click(),
    ]);
    if (startResponse.ok()) {
      const body = (await startResponse.json()) as { sessionId?: string };
      createdSessionId = body.sessionId ?? null;
    }

    // ── 6. Roll call panel opens ─────────────────────────────────────────────
    // PickupRollCall renders as role="dialog" with aria-modal="true".
    const rollCall = page.getByRole("dialog");
    await expect(rollCall).toBeVisible({ timeout: 60_000 });

    // The panel header kicker text contains "Pickup · Roll Call"
    await expect(rollCall.getByText(/pickup.*roll call/i)).toBeVisible({
      timeout: 10_000,
    });

    // ── 7. Add an attendee ───────────────────────────────────────────────────
    // Inputs are plain <input> elements with visible <label> siblings (not
    // htmlFor-linked — they use wrapping label text). Use getByLabel which matches
    // the label text content regardless of the association mechanism.
    await rollCall.getByLabel("First name").fill("Jane");
    await rollCall.getByLabel("Last name").fill("Testwalk");
    await rollCall.getByLabel("Mobile").fill("6145550199");

    await rollCall.getByRole("button", { name: /^add$/i }).click();

    // ── 8. Assert the attendee row appears ───────────────────────────────────
    // PickupRollCall adds the row after the server responds. We allow up to 60 s
    // because the API creates a booking + fires SMS, which can be slow on staging.
    await expect(
      page.locator("[data-pickup-attendee]").first(),
    ).toBeVisible({ timeout: 60_000 });
  } finally {
    // Cancel (not hard-delete — the attendee added above leaves a booking, and
    // DELETE refuses sessions with active bookings) so this run's session
    // doesn't linger as "today's" data for specs that run after this one
    // against the same CI job's shared DB (e.g. venue-command-center.spec.ts).
    if (createdSessionId) {
      await page
        .request.post(`/api/admin/dropin/sessions/${createdSessionId}/cancel`)
        .catch(() => {
          /* best-effort cleanup; don't fail the test on cleanup errors */
        });
    }
  }
});
