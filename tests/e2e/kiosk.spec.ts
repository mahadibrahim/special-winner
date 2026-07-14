import { test, expect, type Page } from "@playwright/test";
import { signInAsAdmin, waitForHydration } from "../utils/test-helpers";
import { E2E_RENTAL_VENUE_ID } from "@/lib/db/seeds/seed-e2e-tests";

/**
 * The customer-facing kiosk: a MOUNTED, UNATTENDED iPad in a public lobby.
 *
 * The kiosk URL is `/kiosk/<location>`, where <location> is the location's
 * slug OR its UUID (see requireKioskLocation in lib/check-in/kiosk-auth.ts).
 * The E2E seed's location slug is timestamped (`orga-loc-test-<ts>-<rand>`),
 * so it is NOT stable across seed runs — hardcoding it guarantees a rotting
 * spec. Every test here resolves the location UUID at runtime from
 * /api/admin/venues, the same way self-serve-payment.spec.ts does.
 *
 * The properties under test are the ones that cannot be proven by reading a
 * diff:
 *  - the tab NEVER navigates away from /kiosk/<location> (a stranded tab
 *    strands the device until staff notice),
 *  - the find flow takes DIGITS ONLY (a name search on a public kiosk used
 *    to list other customers' names and sessions to whoever was standing
 *    there),
 *  - a BLOCKED CAMERA is visible and recoverable rather than a silent dead
 *    end (the whole reason PhotoCard moved off <input capture="user">).
 */
test.describe("Kiosk", { tag: "@critical" }, () => {
  test.setTimeout(120_000);

  /** The E2E rental venue's location UUID — a valid kiosk URL segment. */
  async function resolveLocationId(page: Page): Promise<string> {
    await signInAsAdmin(page);
    const res = await page.request.get("/api/admin/venues");
    expect(res.ok()).toBeTruthy();
    const body = (await res.json()) as {
      venues: { id: string; location: { id: string } }[];
    };
    const venue = body.venues.find((v) => v.id === E2E_RENTAL_VENUE_ID);
    expect(
      venue,
      "E2E rental venue not seeded — run `npm run db:seed:e2e` first",
    ).toBeDefined();
    return venue!.location.id;
  }

  /**
   * A scheduled drop-in session for TODAY at the E2E rental venue, so the
   * walk-in wizard's session step has something to pick. The label is unique
   * per run — the staging DB accumulates sessions from every past CI run, so
   * a generic locator would match somebody else's row.
   *
   * The date is computed in the facility's timezone (Eastern), not UTC: the
   * kiosk's sessions endpoint uses dayBoundsInTz, so a session pinned to the
   * UTC date falls outside "today at the facility" late in the evening.
   */
  async function createTodaySession(page: Page) {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const label = `kiosk-e2e-${suffix}`;
    const etDate = new Date().toLocaleDateString("en-CA", {
      timeZone: "America/New_York",
    });

    // The venue rejects an overlapping session with a 409 — and the specs in
    // this file run in parallel against ONE seeded venue, on top of whatever
    // sessions past CI runs left on today's date. So pick a random 20-minute
    // slot inside the facility's local day and retry on collision rather than
    // pinning a fixed hour (two workers picking the same hour is not a bug in
    // the app, and must not read as one).
    let lastStatus = 0;
    let lastBody = "";
    for (let attempt = 0; attempt < 8; attempt++) {
      // 12:00Z (8am ET) + 0..9h40m — every slot lands inside the Eastern day.
      const startsAt = new Date(`${etDate}T12:00:00.000Z`);
      startsAt.setUTCMinutes(
        startsAt.getUTCMinutes() + Math.floor(Math.random() * 29) * 20,
      );
      const endsAt = new Date(startsAt.getTime() + 20 * 60_000);

      const res = await page.request.post("/api/admin/dropin/sessions", {
        data: {
          venueId: E2E_RENTAL_VENUE_ID,
          kind: "pickup",
          sportOrClassLabel: label,
          startsAt: startsAt.toISOString(),
          endsAt: endsAt.toISOString(),
          capacity: 10,
          sessionRateCents: 1200,
          walkUpRateCents: 2100,
        },
      });
      lastStatus = res.status();
      if (lastStatus === 200 || lastStatus === 201) {
        const body = (await res.json()) as { session?: { id: string } };
        expect(body.session?.id).toBeTruthy();
        return { sessionId: body.session!.id, label, suffix };
      }
      lastBody = await res.text();
      // 409 = the slot is taken. Anything else is a real failure.
      if (lastStatus !== 409) break;
    }
    throw new Error(
      `Could not create a drop-in session (last status ${lastStatus}): ${lastBody}`,
    );
  }

  async function cleanupSession(page: Page, sessionId: string) {
    await page.request
      .post(`/api/admin/dropin/sessions/${sessionId}/cancel`, { data: {} })
      .catch(() => null);
    await page.request
      .delete(`/api/admin/dropin/sessions/${sessionId}`)
      .catch(() => null);
  }

  /** Drive the walk-in wizard from the landing screen to a minted token. */
  async function walkInThroughWizard(page: Page, label: string, suffix: string) {
    await page.getByRole("button", { name: /walk-in registration/i }).click();
    await page.getByRole("button", { name: new RegExp(label) }).click();

    await expect(
      page.getByRole("heading", { name: /your details/i }),
    ).toBeVisible();

    await page.getByPlaceholder("First name").fill("Kiosk");
    await page.getByPlaceholder("Last name").fill(`E2e${suffix.slice(-4)}`);
    await page.getByPlaceholder("Email", { exact: true }).fill(`kiosk-${suffix}@walkin-test.invalid`);
    await page.getByPlaceholder("Phone", { exact: true }).fill("6145550143");
    // Adult DOB — a minor would open the parent/guardian sub-form.
    await page.locator('input[type="date"]').fill("1990-04-04");
    await page.getByRole("button", { name: /^continue$/i }).click();
  }

  test("landing shows the brand, the facility, and the Aspire attribution", async ({
    page,
  }) => {
    const locationId = await resolveLocationId(page);
    await page.goto(`/kiosk/${locationId}`, { waitUntil: "domcontentloaded" });
    await waitForHydration(page);

    // Masthead — brand wordmark (the kiosk serves both brands; localhost
    // resolves the Aspire brand) plus the facility name.
    const masthead = page.locator("main > div.border-b").first();
    await expect(masthead).toContainText("Aspire Sports");

    // The facility's own name is the landing headline.
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    // Both entry paths.
    await expect(
      page.getByRole("button", { name: /find my booking/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /walk-in registration/i }),
    ).toBeVisible();

    // "Powered by Aspire Sports" attribution strip.
    const footer = page.locator("footer");
    await expect(footer).toContainText(/powered by/i);
    await expect(footer).toContainText("Aspire Sports");
  });

  test("find-my-booking is digits-only and never leaves the kiosk URL", async ({
    page,
  }) => {
    const locationId = await resolveLocationId(page);
    const kioskUrl = `/kiosk/${locationId}`;
    await page.goto(kioskUrl, { waitUntil: "domcontentloaded" });
    await waitForHydration(page);
    const urlBefore = page.url();

    await page.getByRole("button", { name: /find my booking/i }).click();
    await expect(
      page.getByRole("heading", { name: /find your booking/i }),
    ).toBeVisible();

    // PRIVACY REGRESSION GUARD. The find flow must expose NO free-text field
    // at all — a 2-character name query used to list other customers' names
    // and sessions to whoever was standing at the kiosk. The only input is an
    // on-screen numeric keypad, so the search can only ever be phone digits.
    await expect(page.locator("main input")).toHaveCount(0);
    await expect(page.locator("main textarea")).toHaveCount(0);
    await expect(
      page.getByText(/we only search by phone number/i),
    ).toBeVisible();

    // Enter 4 digits by tapping the keypad — the same path a customer's
    // finger takes. Element clicks, not keyboard events (the keypad is a
    // grid of <button>s; there is nothing listening for keystrokes).
    for (const digit of ["6", "1", "4", "5"]) {
      await page.getByRole("button", { name: digit, exact: true }).click();
    }
    await expect(page.getByText("6145")).toBeVisible();

    // The search runs (debounced 250ms) and reports honestly. Either arm is
    // fine — what matters is that the page responded without navigating.
    await expect(
      page
        .getByText(/no bookings match that number today|today's matches/i)
        .first(),
    ).toBeVisible({ timeout: 15_000 });

    // THE DEFINING PROPERTY: the tab is still on the kiosk URL.
    expect(page.url()).toBe(urlBefore);
    expect(new URL(page.url()).pathname).toBe(kioskUrl);
  });

  test("walk-in reaches the contact step without leaving the kiosk URL", async ({
    page,
  }) => {
    const locationId = await resolveLocationId(page);
    const { sessionId, label } = await createTodaySession(page);
    try {
      const kioskUrl = `/kiosk/${locationId}`;
      await page.goto(kioskUrl, { waitUntil: "domcontentloaded" });
      await waitForHydration(page);
      const urlBefore = page.url();

      await page.getByRole("button", { name: /walk-in registration/i }).click();

      // The session we just created is listed and pickable.
      const sessionBtn = page.getByRole("button", { name: new RegExp(label) });
      await expect(sessionBtn).toBeVisible({ timeout: 15_000 });
      await sessionBtn.click();

      // Step 2 — contact.
      await expect(
        page.getByRole("heading", { name: /your details/i }),
      ).toBeVisible();
      await expect(page.getByPlaceholder("First name")).toBeVisible();
      await expect(page.getByPlaceholder("Email", { exact: true })).toBeVisible();

      expect(page.url()).toBe(urlBefore);
    } finally {
      await cleanupSession(page, sessionId);
    }
  });

  /**
   * THE DEAD-END GUARD — the single most consequential behavior in the kiosk
   * branch. PhotoCard used to be an <input capture="user">, which on iOS
   * bounces to the Camera app and, when the camera is blocked by MDM or a
   * denied permission, emits NO error event at all: the customer taps, sees
   * nothing happen, and is stranded on an unattended iPad with no way
   * forward. The getUserMedia rewrite exists so a denial becomes VISIBLE and
   * RECOVERABLE. This test denies the camera and asserts both halves: the
   * error is shown, AND the device-upload fallback is still enabled.
   *
   * Nothing here is stubbed but the camera itself. `outstanding.photo` comes
   * off the real server: buildSelfServeContext now sets it for a person with
   * no photo on file, which a freshly-minted walk-in customer always is. (It
   * used to be initialized false and never assigned — PhotoCard had never
   * rendered for anyone — and this test carried a page.route stub to flip the
   * flag. The stub is gone; if the server regressed, this test fails first.)
   */
  test("a blocked camera is visible and recoverable — never a dead end", async ({
    page,
  }) => {
    const locationId = await resolveLocationId(page);
    const { sessionId, label, suffix } = await createTodaySession(page);
    try {
      // Deny the camera the way a locked-down iPad does: getUserMedia
      // rejects with NotAllowedError. Installed before any page script runs.
      await page.addInitScript(() => {
        Object.defineProperty(navigator, "mediaDevices", {
          configurable: true,
          value: {
            getUserMedia: () =>
              Promise.reject(
                new DOMException("Permission denied", "NotAllowedError"),
              ),
          },
        });
      });

      const kioskUrl = `/kiosk/${locationId}`;
      await page.goto(kioskUrl, { waitUntil: "domcontentloaded" });
      await waitForHydration(page);
      const urlBefore = page.url();

      await walkInThroughWizard(page, label, suffix);

      // The self-serve cards now render inline on the kiosk.
      await expect(
        page.getByRole("heading", { name: /add your photo/i }),
      ).toBeVisible({ timeout: 30_000 });

      const takePhoto = page.getByRole("button", { name: /take a photo/i });
      const fallback = page.getByRole("button", { name: /choose from device/i });
      await expect(takePhoto).toBeEnabled();
      await takePhoto.click();

      // 1. The denial is SEEN. (capture="user" showed nothing at all.)
      await expect(
        page.getByText(/camera access is blocked on this device/i),
      ).toBeVisible({ timeout: 15_000 });

      // 2. The customer is NOT stranded — the fallback is still there and
      //    still usable. This assertion is the entire point of the rewrite.
      await expect(fallback).toBeVisible();
      await expect(fallback).toBeEnabled();

      // The failure did not knock the kiosk off its URL either.
      expect(page.url()).toBe(urlBefore);
    } finally {
      await cleanupSession(page, sessionId);
    }
  });
});
