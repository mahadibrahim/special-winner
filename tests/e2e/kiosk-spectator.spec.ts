import { test, expect, type Page } from "@playwright/test";
import { signInAsAdmin, waitForHydration } from "../utils/test-helpers";
import { E2E_RENTAL_VENUE_ID } from "@/lib/db/seeds/seed-e2e-tests";

/**
 * The kiosk's THIRD option: "Spectator waiver" — someone walking in to WATCH,
 * not to play or check in to a booking. No session, no capacity, no payment.
 *
 * The whole feature rests on one doctrine (see SpectatorFlow.tsx and
 * spectator/sign.ts): an unauthenticated, unattended kiosk can capture
 * INTENT, but only a VERIFIED ACT (an email click, an SMS OTP) grants
 * CONSENT. These tests prove the customer-facing surface honours it:
 *
 *   - the waiver is a condition of entry; consent is NOT (declining every
 *     box still admits you — the separability rule),
 *   - every consent checkbox renders UNCHECKED (a pre-checked box is what
 *     got this project's 10DLC registration declined on 2026-07-13),
 *   - the "done" screen NEVER claims a consent that hasn't been verified —
 *     it says "check your email to confirm", never "you're subscribed" /
 *     "you're on the list",
 *   - like the rest of the kiosk subtree, the tab never leaves
 *     /kiosk/<location>.
 *
 * Location resolution follows kiosk.spec.ts: the E2E seed's location slug is
 * timestamped and unstable, so every test resolves the UUID at runtime from
 * /api/admin/venues rather than hardcoding it.
 */
test.describe("Kiosk spectator waiver", { tag: "@critical" }, () => {
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

  test("landing shows the spectator option, which reaches the phone keypad without leaving the kiosk URL", async ({
    page,
  }) => {
    const locationId = await resolveLocationId(page);
    const kioskUrl = `/kiosk/${locationId}`;
    await page.goto(kioskUrl, { waitUntil: "domcontentloaded" });
    await waitForHydration(page);
    const urlBefore = page.url();

    // The third option, alongside "find my booking" and "walk-in registration".
    const spectatorBtn = page.getByRole("button", { name: /spectator waiver/i });
    await expect(spectatorBtn).toBeVisible();
    await spectatorBtn.click();

    // Lands on the lookup step: a phone keypad, no free-text field.
    await expect(
      page.getByRole("heading", { level: 1, name: /here to watch/i }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "1", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "0", exact: true })).toBeVisible();

    expect(page.url()).toBe(urlBefore);
    expect(new URL(page.url()).pathname).toBe(kioskUrl);
  });

  test("declining every consent box still signs the waiver and admits the spectator (separability rule)", async ({
    page,
  }) => {
    const locationId = await resolveLocationId(page);
    const kioskUrl = `/kiosk/${locationId}`;
    await page.goto(kioskUrl, { waitUntil: "domcontentloaded" });
    await waitForHydration(page);
    const urlBefore = page.url();

    await page.getByRole("button", { name: /spectator waiver/i }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: /here to watch/i }),
    ).toBeVisible();
    expect(page.url()).toBe(urlBefore);

    // Skip lookup entirely — go straight to a new waiver, the same path a
    // first-time spectator takes.
    await page.getByRole("button", { name: /sign the spectator waiver/i }).click();

    // Step: who's watching.
    await expect(
      page.getByRole("heading", { level: 1, name: /who's watching/i }),
    ).toBeVisible();
    expect(page.url()).toBe(urlBefore);

    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    await page.getByPlaceholder("First name").fill("Spectator");
    await page.getByPlaceholder("Last name").fill(`Decline${suffix.slice(-4)}`);
    await page.getByPlaceholder("Phone").fill("6145550199");
    // Deliberately leave email blank and skip the "under 18" box.
    await page.getByRole("button", { name: /continue to the waiver/i }).click();

    // Step: sign the waiver.
    await expect(
      page.getByRole("heading", { level: 1, name: /sign the waiver/i }),
    ).toBeVisible();
    expect(page.url()).toBe(urlBefore);

    // COMPLIANCE GUARD — every consent box renders UNCHECKED, before we
    // touch any of them. A pre-checked box is what got this project's
    // 10DLC registration declined on 2026-07-13.
    const consentBoxes = page.locator('fieldset input[type="checkbox"]');
    await expect(consentBoxes).toHaveCount(3);
    const boxCount = await consentBoxes.count();
    for (let i = 0; i < boxCount; i++) {
      await expect(consentBoxes.nth(i)).not.toBeChecked();
    }

    // THE SEPARABILITY RULE — sign without ticking a single box. The
    // signature (prefilled from the name just entered) is enough.
    await page.getByRole("button", { name: /^sign & finish$/i }).click();

    // The waiver is still honoured: the done screen confirms entry.
    await expect(
      page.getByRole("heading", { level: 1, name: /you're all set/i }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/enjoy the game/i)).toBeVisible();

    // No follow-up card renders — nothing was opted into, so there is
    // nothing to confirm.
    await expect(page.getByText(/one more step/i)).toHaveCount(0);
    await expect(page.getByText(/confirm (email|text messages|whatsapp)/i)).toHaveCount(0);

    expect(page.url()).toBe(urlBefore);
    expect(new URL(page.url()).pathname).toBe(kioskUrl);
  });

  test("ticking the email consent box tells the truth — never claims subscription before it's verified", async ({
    page,
  }) => {
    const locationId = await resolveLocationId(page);
    const kioskUrl = `/kiosk/${locationId}`;
    await page.goto(kioskUrl, { waitUntil: "domcontentloaded" });
    await waitForHydration(page);
    const urlBefore = page.url();

    await page.getByRole("button", { name: /spectator waiver/i }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: /here to watch/i }),
    ).toBeVisible();

    await page.getByRole("button", { name: /sign the spectator waiver/i }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: /who's watching/i }),
    ).toBeVisible();

    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const email = `kiosk-spectator-${suffix}@e2e-test.invalid`;
    await page.getByPlaceholder("First name").fill("Honesty");
    await page.getByPlaceholder("Last name").fill(`Check${suffix.slice(-4)}`);
    await page.getByPlaceholder("Phone").fill("6145550188");
    await page.getByPlaceholder("Email (optional)").fill(email);
    await page.getByRole("button", { name: /continue to the waiver/i }).click();

    await expect(
      page.getByRole("heading", { level: 1, name: /sign the waiver/i }),
    ).toBeVisible();
    expect(page.url()).toBe(urlBefore);

    // Tick ONLY the email box.
    const emailBox = page.getByRole("checkbox", {
      name: /email me about sessions, leagues and offers/i,
    });
    await expect(emailBox).not.toBeChecked();
    await emailBox.click();
    await expect(emailBox).toBeChecked();

    await page.getByRole("button", { name: /^sign & finish$/i }).click();

    await expect(
      page.getByRole("heading", { level: 1, name: /you're all set/i }),
    ).toBeVisible({ timeout: 20_000 });

    // THE HONESTY ASSERTION. The endpoint is unauthenticated and can only
    // capture intent — a click from inside the mailbox is the verified act
    // that actually subscribes anyone. The done screen must say so honestly:
    // a next step exists, and the customer is NOT on the list until they
    // take it.
    const main = page.locator("main");
    await expect(main).toContainText(
      /check your email.*tap the link to confirm|confirm.*email/i,
    );
    await expect(main).toContainText(/you're not on the list until you do/i);

    // ...and it must NEVER claim consent that hasn't been verified.
    await expect(main).not.toContainText(/you'?re (now )?subscribed/i);
    await expect(main).not.toContainText(/you'?ve opted in/i);
    // "you're on the list" WITHOUT the negation must not appear anywhere —
    // only the honest, negated form ("you're not on the list") may.
    const bodyText = (await main.textContent()) ?? "";
    expect(bodyText).not.toMatch(/you'?re on the list/i);
    expect(bodyText).toMatch(/you'?re not on the list/i);

    expect(page.url()).toBe(urlBefore);
    expect(new URL(page.url()).pathname).toBe(kioskUrl);
  });
});
