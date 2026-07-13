import { test, expect } from "@playwright/test";
import { signInAsAdmin, waitForHydration } from "../../tests/utils/test-helpers";
import { createTour, registerVideoCapture } from "../lib/tour";

/**
 * venue-manager — the venue command center's event-day overview: opening a
 * session's roster panel to check drop-in players in or register a walk-in,
 * referee pay, media check-in visibility, and end-of-day reports. Check-in
 * and walk-up used to be their own pages; both are now reached by opening a
 * session's roster panel on the command-center board (see 38cb532d), so
 * this walkthrough drives that panel in place rather than navigating to the
 * old (now-redirecting) /admin/venue/check-in and /admin/venue/walk-up URLs.
 * Note: per-player game attendance for league matches is NOT tracked in-app
 * (ActivityDetailPanel disables check-in for roster_entry rows — "Game
 * attendance not tracked in v1"); a league match's roster shows for
 * reference while the event lead runs the in-person team check-in.
 *
 * act.team_check_in is the closest catalog match — the event lead's
 * in-person team check-in, run against the roster panel's lineup as
 * reference — and is tagged accordingly. The command-center tour itself has
 * no catalog counterpart (it's a cross-activity dashboard, not a single
 * tracked activity) so its own step is untagged.
 *
 * The tour `role` is "event_lead", NOT "venue_manager", deliberately: the
 * Phase 1 deck generator (src/lib/ops-catalog/views/training-deck.ts)
 * places each activity's screenshot slot only in the deck of the role the
 * catalog holds accountable — act.team_check_in's slot is
 * training/screenshots/event_lead/team_check_in.png inside
 * role.event_lead.deck.html. role.venue_manager.deck.html has no
 * team_check_in slot at all (venue_manager is merely "informed" on that
 * activity), so copying the screenshot to a venue_manager/ directory would
 * never be picked up by `catalog:render --embed`. Discovered during Task 14
 * end-to-end verification; the plan's original venue_manager expectation
 * was wrong against the real deck output. `role` only affects the
 * deck-slot copy path (Design Decision 2) — the workflow name, sign-in,
 * and pages toured are unchanged.
 *
 * Three more genuine catalog matches, added while expanding screenshot
 * coverage:
 *  - act.walk_on_registration (accountable role.front_of_house) is exactly
 *    what the roster panel's "Open slot — add walk-in" button starts
 *    (WalkInFlow) — but front_of_house, not event_lead, is this file's Tour
 *    role's opposite:
 *    role.event_lead is merely "informed" on this activity, so a plain
 *    `deckSlug` tag here would copy into a directory role.front_of_house's
 *    deck never reads. `deckRole: "front_of_house"` (see training/lib/tour.ts)
 *    overrides just the copy destination for this one step so the
 *    screenshot lands where role.front_of_house.deck.html actually looks.
 *  - act.ref_stipend_log (accountable role.event_lead) — "event lead logs
 *    the stipend owed for each match... captures the ref's acknowledgment,
 *    and hands off to the platform's payroll integration for payout" is
 *    exactly the fee + Mark paid UI in GameOfficialsDialog (opened from
 *    /admin/games' "Refs" button). Read-only here (no "Mark paid" click) —
 *    toggling paid/unpaid on every re-run would flip the "before" state
 *    each time without adding anything the fee/status badge doesn't already
 *    show.
 *  - act.photographer_check_in (accountable role.photographer, responsible
 *    also includes role.event_lead) — ShootDetail's "Checked in" field
 *    (src/components/media/shoot-detail.tsx, at /admin/media/shoots/[id])
 *    is the event lead's own visibility into that signature. The seeded
 *    shoot fixtures are all `status: "uploaded"` with no checked-in
 *    timestamp, so this captures the "not yet checked in" state — still an
 *    honest illustration of the tracked field.
 */
const WORKFLOW = "venue-manager";
registerVideoCapture(test, WORKFLOW);

test(`${WORKFLOW} walkthrough`, async ({ page }) => {
  test.setTimeout(120_000);
  const tour = createTour({ workflow: WORKFLOW, role: "event_lead" });

  await signInAsAdmin(page);

  await tour.step(page, "Venue command center — today's overview", async () => {
    await page.goto("/admin/venue", { waitUntil: "domcontentloaded" });
    await waitForHydration(page);
  });

  // /admin/venue/check-in and /admin/venue/walk-up (the routes these two
  // steps used to page.goto() straight to) 308-redirect to /admin/venue as
  // of 38cb532d — check-in and walk-up are no longer separate pages, they're
  // both reached by opening a session's roster panel on this same board. The
  // steps below open the panel in-place instead of navigating away, so the
  // captured screenshots show the real current UI rather than two duplicate
  // captures of the board (which is what a naive goto() would now produce).
  const activityBlock = page.locator("[data-activity-block]").first();
  if ((await activityBlock.count()) > 0) {
    await tour.step(
      page,
      "Open a session's roster panel — drop-in players check in here; a league match shows its roster for reference (per-player game attendance isn't tracked in-app)",
      async () => {
        await activityBlock.click();
      },
      { deckSlug: "team_check_in" },
    );

    const addWalkInButton = page.getByText("Open slot — add walk-in").first();
    await addWalkInButton.waitFor({ state: "visible", timeout: 5_000 }).catch(() => {});
    if ((await addWalkInButton.count()) > 0) {
      await tour.step(
        page,
        "Start the walk-in flow from an open slot",
        async () => {
          await addWalkInButton.click();
        },
        { deckSlug: "walk_on_registration", deckRole: "front_of_house" },
      );
    }
    // If the first activity block has no open slots (e.g. it's a league
    // game rather than a dropin/class/camp), the walk-in step above is
    // skipped rather than failing — same defensive pattern the refsButton/
    // shootLink steps below use for fixture-dependent UI.
  }

  await tour.step(page, "Games — cross-season list", async () => {
    await page.goto("/admin/games", { waitUntil: "domcontentloaded" });
    await waitForHydration(page);
  });

  // Accessible name comes from the button's visible text ("Refs"), not its
  // title tooltip ("Manage referees") — the title attribute only supplies
  // the accessible name when there's no text content.
  const refsButton = page.getByRole("button", { name: "Refs" }).first();
  // The cross-season games list fetches a shared CI database's full games
  // table (accumulates over time — hundreds of rows, see the "Multi-tenant
  // query hazards" note in the repo's CLAUDE.md) and renders one Card per
  // row before this button exists, so give it more room than the usual
  // 15s conditional-locator wait used elsewhere in this file.
  await refsButton.waitFor({ state: "visible", timeout: 30_000 }).catch(() => {});
  if ((await refsButton.count()) > 0) {
    await tour.step(
      page,
      "Referee assignment and stipend log for a match",
      async () => {
        await refsButton.click();
        await expect(page.getByText(/Assign a referee/i)).toBeVisible({ timeout: 10_000 });
      },
      { deckSlug: "ref_stipend_log" },
    );
    await page.getByRole("button", { name: "Close" }).click();
  }

  await tour.step(page, "Media shoots list", async () => {
    await page.goto("/admin/media/shoots", { waitUntil: "domcontentloaded" });
    await waitForHydration(page);
  });

  const shootLink = page.getByRole("link", { name: "View", exact: true }).first();
  await shootLink.waitFor({ state: "visible", timeout: 15_000 }).catch(() => {});
  if ((await shootLink.count()) > 0) {
    await tour.step(
      page,
      "Photographer check-in status for a shoot",
      async () => {
        await shootLink.click();
        await expect(page.getByText(/Checked in/i)).toBeVisible({ timeout: 10_000 });
      },
      { deckSlug: "photographer_check_in" },
    );
  }

  await tour.step(page, "End-of-day reports", async () => {
    await page.goto("/admin/venue/reports", { waitUntil: "domcontentloaded" });
    await waitForHydration(page);
  });

  await tour.finish();
});
