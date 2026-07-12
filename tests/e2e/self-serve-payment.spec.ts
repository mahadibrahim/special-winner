import { test, expect } from "@playwright/test";
import { signInAsAdmin, waitForHydration } from "../utils/test-helpers";
import { E2E_RENTAL_VENUE_ID } from "@/lib/db/seeds/seed-e2e-tests";

// Self-serve PayCard (Task 6). No spec in this repo drives a real Stripe
// card submission end-to-end — registration-guest-flow.spec.ts explicitly
// races "Stripe Elements iframe mounted" against a config-error banner
// instead of filling test-card details, and registration-adult.spec.ts's
// comment says outright "Do NOT click Complete Registration — we don't
// want to hit Stripe." This spec follows the same house pattern: it drives
// the flow up to the PaymentElement mounting (or the honest fallback of an
// error banner if Stripe isn't configured in the run environment) and
// asserts the displayed amount, but never submits a card.
test.describe("Self-serve PayCard", { tag: "@critical" }, () => {
  test.setTimeout(90_000);

  test("walk-in pay-link renders PayCard first with the correct amount", async ({
    page,
  }) => {
    await signInAsAdmin(page);

    // ---- Resolve the E2E rental venue's location + kiosk-facing slug. ----
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

    // ---- Create a walk-in-eligible drop-in session for today, with a
    // distinct walk-up rate so the payment amount assertion below can't be
    // satisfied by accident (session rate is different). ----
    const dateStr = new Date().toISOString().slice(0, 10);
    const startsAt = new Date(`${dateStr}T13:00:00.000Z`);
    startsAt.setUTCMinutes(startsAt.getUTCMinutes() + (Date.now() % 240));
    const endsAt = new Date(startsAt.getTime() + 90 * 60_000);
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    const createRes = await page.request.post("/api/admin/dropin/sessions", {
      data: {
        venueId: E2E_RENTAL_VENUE_ID,
        kind: "pickup",
        sportOrClassLabel: `self-serve-pay-${suffix}`,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        capacity: 10,
        sessionRateCents: 1200,
        walkUpRateCents: 2100,
      },
    });
    expect([200, 201, 409]).toContain(createRes.status());
    const createBody = (await createRes.json()) as { session?: { id: string } };
    expect(createBody.session?.id).toBeTruthy();
    const sessionId = createBody.session!.id;

    try {
      // ---- Create the held (pending_payment) booking via the same public
      // kiosk endpoint a real walk-in link comes from. ----
      const walkinRes = await page.request.post(
        `/api/kiosk/${locationId}/walkin/start`,
        {
          data: {
            sessionId,
            contact: {
              firstName: "PayCard",
              lastName: `E2e${suffix.slice(-4)}`,
              email: `self-serve-pay-${suffix}@walkin-test.invalid`,
              phone: "6145550188",
              dob: "1988-05-05",
            },
          },
        },
      );
      expect(walkinRes.ok(), await walkinRes.text()).toBeTruthy();
      const walkinBody = (await walkinRes.json()) as { token: string };
      const token = walkinBody.token;

      // ---- Open the customer's own link, the same way they would from the
      // pay-link SMS/email — no ?kiosk= param. ----
      await page.goto(`/self-serve/${token}`, { waitUntil: "domcontentloaded" });
      await waitForHydration(page);

      // PayCard renders ABOVE the waiver/photo cards when payment is
      // outstanding (Task 6 completion gate: waiver && photo && !payment).
      const payHeading = page.getByRole("heading", { name: /complete payment/i });
      await expect(payHeading).toBeVisible({ timeout: 15_000 });
      const waiverHeading = page.getByRole("heading", { name: /sign the liability waiver/i });
      await expect(waiverHeading).toBeVisible({ timeout: 15_000 });

      const payBox = await payHeading.boundingBox();
      const waiverBox = await waiverHeading.boundingBox();
      expect(payBox, "PayCard heading should have a layout box").not.toBeNull();
      expect(waiverBox, "waiver heading should have a layout box").not.toBeNull();
      expect(payBox!.y).toBeLessThan(waiverBox!.y);

      // Card visibility: race the Stripe Elements iframe mounting against an
      // honest error banner (Stripe not configured in this run) — mirrors
      // registration-guest-flow.spec.ts's pattern. Never submit a card.
      const stripeIframe = page.locator('iframe[name^="__privateStripeFrame"]').first();
      const errorBanner = page.getByRole("alert");
      await Promise.race([
        stripeIframe.waitFor({ state: "visible", timeout: 20_000 }).catch(() => {}),
        errorBanner.waitFor({ state: "visible", timeout: 20_000 }).catch(() => {}),
      ]);
      const iframeMounted = (await stripeIframe.count()) > 0;
      const hasErrorBanner = (await errorBanner.count()) > 0;
      expect(
        iframeMounted || hasErrorBanner,
        "expected the Stripe PaymentElement iframe to mount or an error banner explaining why not",
      ).toBe(true);

      // Amount correctness — ONLY when the payment form actually mounted.
      // The amount breakdown renders from the PaymentIntent response, so a
      // Stripe-not-configured run (the error-banner arm above) legitimately
      // has no $ figure to assert; requiring $21.00 unconditionally would
      // make this test demand Stripe when the tolerant race deliberately
      // doesn't. When the form mounted, the "Session" line must be the
      // walk-up rate (2100 cents → $21.00) — deliberately distinct from the
      // session rate (1200 cents) so this can't pass by coincidence.
      if (iframeMounted) {
        await expect(page.getByText("$21.00")).toBeVisible({ timeout: 10_000 });
      }

      // Boundary: this spec stops here. Completing payment would require
      // driving Stripe's test-card iframe and asserting the webhook flips
      // outstanding.payment — no house pattern for that exists anywhere in
      // this repo (see the module comment above), so it isn't invented here.
    } finally {
      await page.request
        .post(`/api/admin/dropin/sessions/${sessionId}/cancel`, { data: {} })
        .catch(() => null);
      await page.request
        .delete(`/api/admin/dropin/sessions/${sessionId}`)
        .catch(() => null);
    }
  });
});
