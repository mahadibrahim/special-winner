import { test, expect } from "@playwright/test";
import { signInAsAdmin, waitForHydration } from "../utils/test-helpers";
// Safe to import for constants only — see the guard at the bottom of
// seed-e2e-tests.ts: importing it does NOT run the seed script.
import { E2E_RENTAL_VENUE_ID } from "@/lib/db/seeds/seed-e2e-tests";

// The /api/admin/venue/today aggregation is heavy and slow against the
// accumulated staging DB used in CI (tens of seconds — same data-bloat caveat
// CLAUDE.md notes for tag-queue; it's fast on prod's co-located DB). Give the
// data-dependent assertions a realistic budget.
test("venue command center renders and opens an activity roster", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await signInAsAdmin(page);
  await page.goto("/admin/venue", { waitUntil: "domcontentloaded" });
  await waitForHydration(page);

  // The page title is server-rendered, so it proves the command-center route
  // loaded (not a redirect/error) without waiting for the data fetch.
  await expect(page).toHaveTitle(/command center/i);

  // NeedsAttentionQueue renders the "Needs attention" h2 once data loads.
  // Target the heading specifically: the "All clear — Nothing needs attention
  // for this location…" empty-state text also matches /needs attention/i, so
  // a plain getByText is a strict-mode violation (2 matches).
  await expect(
    page.getByRole("heading", { name: /needs attention/i }),
  ).toBeVisible({ timeout: 60_000 });

  // ActivityBlock renders with data-activity-block on its root div.
  // Guard with count() so the test passes when the seeded venue has no sessions.
  const block = page.locator("[data-activity-block]").first();
  if ((await block.count()) > 0) {
    // Playwright's default scrollIntoViewIfNeeded aligns the element to the
    // nearest viewport edge, which can land it directly under AdminLayout's
    // sticky top-0 header — the header then intercepts the click. Center the
    // block in the viewport first so the sticky header can't steal the hit.
    await block.evaluate((el) => el.scrollIntoView({ block: "center" }));
    await block.click();

    // ActivityDetailPanel renders as role="dialog".  The × close button
    // (aria-label="Close") is always present when the panel is open.
    const panel = page.getByRole("dialog");
    await expect(panel).toBeVisible({ timeout: 10_000 });
    await expect(
      panel.getByRole("button", { name: /close/i }),
    ).toBeVisible();

    // If the session has open capacity, ActivityDetailPanel renders
    // "Open slot — add walk-in" rows (exact text from ActivityDetailPanel.tsx).
    // This assertion is conditional — it passes on sessions with no open slots.
    const openSlotRow = panel.getByText(/open slot.*add walk-in/i);
    if ((await openSlotRow.count()) > 0) {
      await expect(openSlotRow.first()).toBeVisible();
    }
  }
});

// Collision layout: two sessions on the SAME field whose time windows
// deliberately overlap must render side-by-side (Google-Calendar-style
// lanes), not stacked. Before the lane layout, the later block rendered on
// top of the earlier one and silently intercepted clicks meant for
// whichever block was underneath — the historical root cause of flakes in
// the "opens an activity roster" test above. This test drives both blocks
// through a real click and asserts each opens its OWN roster panel.
test("overlapping same-space sessions render side-by-side and both stay clickable", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await signInAsAdmin(page);

  const venuesRes = await page.request.get("/api/admin/venues");
  expect(venuesRes.ok()).toBeTruthy();
  const venuesBody = (await venuesRes.json()) as {
    venues: { id: string; location: { id: string } }[];
  };
  const venue = venuesBody.venues.find((v) => v.id === E2E_RENTAL_VENUE_ID);
  expect(
    venue,
    "E2E rental venue not seeded — run `npm run db:seed:e2e` first",
  ).toBeDefined();

  // Both sessions omit bookableResourceId, so both default to the venue's
  // Field 1 (see sessions/index.ts) — same space column on the board.
  // Jitter the base start time so repeated CI runs on the same calendar day
  // don't collide with other fixtures' ledger slots in this file.
  const dateStr = new Date().toISOString().slice(0, 10);
  const base = new Date(`${dateStr}T14:00:00.000Z`);
  base.setUTCMinutes(base.getUTCMinutes() + (Date.now() % 60));
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  const titleA = `collision-a-${suffix}`;
  const titleB = `collision-b-${suffix}`;
  const startsAtA = base;
  const endsAtA = new Date(base.getTime() + 60 * 60_000);
  const startsAtB = new Date(base.getTime() + 30 * 60_000); // overlaps A
  const endsAtB = new Date(startsAtB.getTime() + 60 * 60_000);

  async function createSession(
    title: string,
    startsAt: Date,
    endsAt: Date,
  ): Promise<string> {
    const res = await page.request.post("/api/admin/dropin/sessions", {
      data: {
        venueId: E2E_RENTAL_VENUE_ID,
        kind: "pickup",
        sportOrClassLabel: title,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        capacity: 10,
      },
    });
    // 409 = session row created but the field-time ledger flagged a
    // conflict — expected here since A and B deliberately overlap on the
    // same field. The session row itself still exists either way (see the
    // held-pay-link-walk-in test above for the same pattern).
    expect([200, 201, 409]).toContain(res.status());
    const body = (await res.json()) as { session?: { id: string } };
    expect(body.session?.id).toBeTruthy();
    return body.session!.id;
  }

  const sessionIdA = await createSession(titleA, startsAtA, endsAtA);
  const sessionIdB = await createSession(titleB, startsAtB, endsAtB);

  // Cleanup in finally regardless of assertion outcome — otherwise a failed
  // run leaks a `collision-*` block onto the shared staging board.
  try {
    await page.goto(`/admin/venue?date=${dateStr}`, {
      waitUntil: "domcontentloaded",
    });
    await waitForHydration(page);

    const blockA = page.locator("[data-activity-block]", { hasText: titleA });
    const blockB = page.locator("[data-activity-block]", { hasText: titleB });
    await expect(blockA).toBeVisible({ timeout: 30_000 });
    await expect(blockB).toBeVisible({ timeout: 30_000 });

    // Center each in the viewport before clicking — same rationale as the
    // "opens an activity roster" test: Playwright's default
    // scrollIntoViewIfNeeded can land an element under AdminLayout's sticky
    // header, which then intercepts the click.
    await blockA.evaluate((el) => el.scrollIntoView({ block: "center" }));
    await blockA.click();
    const panel = page.getByRole("dialog");
    await expect(panel).toBeVisible({ timeout: 10_000 });
    await expect(panel.getByRole("heading", { name: titleA })).toBeVisible();
    await panel.getByRole("button", { name: /close/i }).click();
    await expect(panel).not.toBeVisible();

    await blockB.evaluate((el) => el.scrollIntoView({ block: "center" }));
    await blockB.click();
    await expect(panel).toBeVisible({ timeout: 10_000 });
    await expect(panel.getByRole("heading", { name: titleB })).toBeVisible();
  } finally {
    await page.request
      .delete(`/api/admin/dropin/sessions/${sessionIdA}`)
      .catch(() => null);
    await page.request
      .delete(`/api/admin/dropin/sessions/${sessionIdB}`)
      .catch(() => null);
  }
});

test("venue command center deep link opens the detail panel on load", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await signInAsAdmin(page);

  // Discover a real, currently-seeded session id — don't hardcode a fixture
  // id that can drift out from under the test as seed data changes.
  const today = new Date().toISOString().slice(0, 10);
  const response = await page.request.get(
    `/api/admin/venue/today?date=${today}`,
  );
  expect(response.ok()).toBeTruthy();
  const payload = (await response.json()) as { sessions?: { id: string }[] };
  const sessionId = payload.sessions?.[0]?.id;

  test.skip(!sessionId, "No seeded sessions today — nothing to deep-link to");

  await page.goto(`/admin/venue?date=${today}&session=${sessionId}`, {
    waitUntil: "domcontentloaded",
  });
  await waitForHydration(page);

  const panel = page.getByRole("dialog");
  await expect(panel).toBeVisible({ timeout: 60_000 });
  await expect(
    panel.getByRole("button", { name: /close/i }),
  ).toBeVisible();
});

// Held (pending_payment) pay-link walk-ins must surface in the roster with
// resend-link / cancel-hold actions (Task 6). The fixture booking is created
// the same way a real kiosk pay-link hold is created in production — via
// POST /api/admin/dropin/sessions (real admin action) then
// POST /api/kiosk/{locationId}/walkin/start — mirroring
// tests/api/venue-hold-visibility.test.ts rather than driving the full
// walk-in UI flow.
test("held pay-link walk-in shows in the roster with resend/cancel actions", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await signInAsAdmin(page);

  // ---- Resolve the E2E rental venue's location. This venue is guaranteed
  // to have field-time-ledger resources set up (ensureVenueResources runs
  // for it in seed-e2e-tests.ts), so creating a session against it via the
  // real admin endpoint won't fail resolving a field-1 resource. ----
  const venuesRes = await page.request.get("/api/admin/venues");
  expect(venuesRes.ok()).toBeTruthy();
  const venuesBody = (await venuesRes.json()) as {
    venues: { id: string; location: { id: string } }[];
  };
  const venue = venuesBody.venues.find((v) => v.id === E2E_RENTAL_VENUE_ID);
  expect(
    venue,
    "E2E rental venue not seeded — run `npm run db:seed:e2e` first",
  ).toBeDefined();
  const locationId = venue!.location.id;

  // ---- Create a walk-in-eligible drop-in session that is still RUNNING. ----
  //
  // Anchored to `now`, NEVER to a fixed UTC hour. walkin/start rejects a session
  // that has already ended (422) — a customer must not be able to pay for this
  // morning's 9am session at 8pm. Pinned to `${dateStr}T12:00:00Z` this fixture
  // was over by 13:30Z, so it 422'd on every CI run after that. That is exactly
  // how it broke main: the full Playwright job only runs POST-merge, so the PR
  // gate never saw it.
  //
  // The jitter is still here — it keeps concurrent CI runs off the same field-1
  // ledger slot. It just jitters forward from `now` instead of from noon.
  const startsAt = new Date(Date.now() + 2 * 60_000 + (Date.now() % 20) * 60_000);
  const endsAt = new Date(startsAt.getTime() + 90 * 60_000);
  // Derived from startsAt, not from `new Date()` — the board is opened at
  // ?date=<dateStr>, and near midnight UTC the jittered start can land on the
  // next day. Deriving it keeps the board's day and the session's day in lockstep.
  const dateStr = startsAt.toISOString().slice(0, 10);
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  const createRes = await page.request.post("/api/admin/dropin/sessions", {
    data: {
      venueId: E2E_RENTAL_VENUE_ID,
      kind: "pickup",
      sportOrClassLabel: `command-center-held-${suffix}`,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      capacity: 10,
      walkUpRateCents: 1500,
    },
  });
  // 409 means the session was created but the field-time ledger had a
  // conflicting block (see cancel-hold's session.ts comment) — the session
  // row itself still exists and is usable for this test.
  expect([200, 201, 409]).toContain(createRes.status());
  const createBody = (await createRes.json()) as { session?: { id: string } };
  expect(createBody.session?.id).toBeTruthy();
  const sessionId = createBody.session!.id;

  // Everything from here runs inside try/finally so the fixture session is
  // cleaned up even when an assertion mid-test fails — otherwise each failed
  // run leaks one `command-center-held-*` block onto the shared staging board.
  try {
    // ---- Create the held (pending_payment) booking via the kiosk API — the
    // same way a real pay-link walk-in hold is created in production. ----
    const walkinRes = await page.request.post(
      `/api/kiosk/${locationId}/walkin/start`,
      {
        data: {
          sessionId,
          contact: {
            firstName: "Held",
            lastName: `Walkin${suffix.slice(-4)}`,
            email: `command-center-held-${suffix}@walkin-test.invalid`,
            phone: "6145550199",
            dob: "1990-01-01",
          },
        },
      },
    );
    expect(walkinRes.ok(), await walkinRes.text()).toBeTruthy();

    // ---- Open the session panel via Find booking (Task 7): land on the board
    // with no deep link, search for the held walk-in's unique name, and click
    // the result row through to the same roster panel a deep link would open.
    // Exercises the FindBookingPanel → onOpenSession → ActivityDetailPanel path
    // end-to-end instead of just deep-linking around it. ----
    await page.goto(`/admin/venue?date=${dateStr}`, {
      waitUntil: "domcontentloaded",
    });
    await waitForHydration(page);

    await page.getByRole("button", { name: /find booking/i }).click();
    const searchSheet = page.getByRole("dialog", { name: /find booking/i });
    await expect(searchSheet).toBeVisible({ timeout: 10_000 });

    // Search matches firstName OR lastName individually (ilike per-column, not
    // a concatenated full-name match) — query on the unique last name only.
    const searchQuery = `Walkin${suffix.slice(-4)}`;
    await searchSheet.getByPlaceholder(/name or last 4 of phone/i).fill(searchQuery);

    const heldRowName = new RegExp(`Held Walkin${suffix.slice(-4)}`, "i");
    const resultRow = searchSheet.getByRole("button", { name: heldRowName });
    await expect(resultRow).toBeVisible({ timeout: 10_000 });
    await resultRow.click();

    // Search panel closes, session roster panel opens with the same booking.
    await expect(searchSheet).not.toBeVisible();
    const panel = page.getByRole("dialog");
    await expect(panel).toBeVisible({ timeout: 60_000 });
    await expect(panel.getByText(/awaiting payment/i)).toBeVisible({
      timeout: 15_000,
    });
    await expect(panel.getByText(heldRowName)).toBeVisible();
    await expect(
      panel.getByRole("button", { name: /resend pay link/i }),
    ).toBeVisible();

    // ---- Cancel the hold and confirm the row disappears. ----
    await panel.getByRole("button", { name: /cancel hold/i }).click();
    await expect(panel.getByText(heldRowName)).not.toBeVisible({
      timeout: 15_000,
    });

    // ---- Walk-in flow validation (Task 9): submitting the empty form must
    // surface the aggregated missing-fields ErrorBanner — not be silently
    // blocked by native browser tooltips (the form is noValidate). The panel
    // is still open on a capacity-10 session, so open-slot rows are present.
    const openSlotRow = panel
      .getByRole("button", { name: /open slot — add walk-in/i })
      .first();
    await expect(openSlotRow).toBeVisible({ timeout: 15_000 });
    await openSlotRow.click();

    // WalkInFlow overlay is open (heading "Add to <session title>").
    await expect(
      panel.getByRole("heading", { name: /add to /i }),
    ).toBeVisible({ timeout: 10_000 });

    // With no contact entered, the auto-correct effect lands on kiosk self-pay;
    // /create booking/i matches the submit button in every method variant.
    // The form defaults to adult mode, and DOB is optional for adults (owner
    // decision 2026-07-12) — so the aggregated banner lists name/email but
    // must NOT list "date of birth" here.
    await panel.getByRole("button", { name: /create booking/i }).click();
    await expect(panel.getByRole("alert")).toContainText(/Missing:/, {
      timeout: 10_000,
    });
    await expect(panel.getByRole("alert")).not.toContainText(/date of birth/i);
    await expect(panel.getByRole("alert")).toContainText(/first name/i);
  } finally {
    // ---- Fixture cleanup: cancel releases any still-active hold (satisfying
    // the DELETE endpoint's "no active bookings" guard on failure paths where
    // the UI cancel never ran), then hard-delete the session. Best-effort —
    // cleanup failure must not mask the assertions above. ----
    await page.request
      .post(`/api/admin/dropin/sessions/${sessionId}/cancel`, { data: {} })
      .catch(() => null);
    await page.request
      .delete(`/api/admin/dropin/sessions/${sessionId}`)
      .catch(() => null);
  }
});
