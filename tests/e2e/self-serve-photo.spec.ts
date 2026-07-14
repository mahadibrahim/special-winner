import { test, expect } from "@playwright/test";
import { signInAsAdmin, waitForHydration } from "../utils/test-helpers";
import { E2E_RENTAL_VENUE_ID } from "@/lib/db/seeds/seed-e2e-tests";

/**
 * The self-serve photo step — OFFERED, never REQUIRED.
 *
 * Two properties, both of which were broken or absent before:
 *
 *  1. THE CARD IS REACHABLE AT ALL. `outstanding.photo` was initialized to
 *     false in buildSelfServeContext and never assigned, so PhotoCard — which
 *     SelfServe gates on that flag — had never rendered for a single customer
 *     in production. Nothing here stubs the context: the flag comes off the
 *     real server, for a real booking whose customer has no photo on file.
 *
 *  2. IT CAN NEVER HANG THE FLOW. The photo is optional by the owner's call,
 *     and "optional" only means something if there is an explicit way past it
 *     — otherwise the completion gate would simply wait forever on a step the
 *     customer declined. This drives the decline path end to end and asserts
 *     the customer still reaches the checked-in screen.
 *
 * The fixture is a FREE walk-up booking (session rates set to $0, so the
 * front-desk endpoint's free path creates a confirmed booking with no Stripe
 * involvement). That leaves exactly waiver + photo outstanding — no payment
 * to drive, which is what makes the terminal screen reachable in a test.
 */
test.describe("Self-serve photo step", { tag: "@critical" }, () => {
  test.setTimeout(120_000);

  test("a customer can decline the photo and still reach the checked-in screen", async ({
    page,
  }) => {
    await signInAsAdmin(page);

    const venuesRes = await page.request.get("/api/admin/venues");
    expect(venuesRes.ok()).toBeTruthy();
    const venuesBody = (await venuesRes.json()) as {
      venues: { id: string }[];
    };
    expect(
      venuesBody.venues.find((v) => v.id === E2E_RENTAL_VENUE_ID),
      "E2E rental venue not seeded — run `npm run db:seed:e2e` first",
    ).toBeDefined();

    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    // A $0 session — the walk-up endpoint's free path then confirms the
    // booking outright instead of minting a card-present PaymentIntent.
    // Retry on 409 (the venue rejects overlapping sessions and this venue is
    // shared with every other spec + past CI runs).
    let sessionId = "";
    for (let attempt = 0; attempt < 8 && !sessionId; attempt++) {
      const startsAt = new Date();
      startsAt.setUTCHours(12, 0, 0, 0);
      startsAt.setUTCMinutes(Math.floor(Math.random() * 29) * 20);
      const endsAt = new Date(startsAt.getTime() + 20 * 60_000);
      const res = await page.request.post("/api/admin/dropin/sessions", {
        data: {
          venueId: E2E_RENTAL_VENUE_ID,
          kind: "pickup",
          sportOrClassLabel: `photo-skip-${suffix}`,
          startsAt: startsAt.toISOString(),
          endsAt: endsAt.toISOString(),
          capacity: 10,
          sessionRateCents: 0,
          walkUpRateCents: 0,
        },
      });
      if (res.status() === 409) continue;
      expect(res.ok(), await res.text()).toBeTruthy();
      const body = (await res.json()) as { session?: { id: string } };
      expect(body.session?.id).toBeTruthy();
      sessionId = body.session!.id;
    }
    expect(sessionId, "could not create a $0 drop-in session").toBeTruthy();

    try {
      // Front-desk walk-up for a brand-new account — a person with no photo
      // on file, which is precisely who the server should offer the card to.
      const walkUpRes = await page.request.post(
        `/api/admin/dropin/sessions/${sessionId}/walk-up`,
        {
          data: {
            newAccount: {
              firstName: "Photo",
              lastName: `Skip${suffix.slice(-4)}`,
              email: `photo-skip-${suffix}@walkin-test.invalid`,
              phone: "6145550177",
            },
          },
        },
      );
      expect(walkUpRes.ok(), await walkUpRes.text()).toBeTruthy();
      const walkUpBody = (await walkUpRes.json()) as {
        paymentRequired: boolean;
        bookingId?: string;
      };
      expect(
        walkUpBody.paymentRequired,
        "a $0 session must take the free path — no Stripe in this spec",
      ).toBe(false);
      expect(walkUpBody.bookingId).toBeTruthy();

      // The customer's own link, exactly as the front desk would send it.
      const linkRes = await page.request.post("/api/admin/check-in/send-link", {
        data: {
          kind: "drop_in_booking",
          targetId: walkUpBody.bookingId,
          channel: "qr",
        },
      });
      expect(linkRes.ok(), await linkRes.text()).toBeTruthy();
      const { url } = (await linkRes.json()) as { url: string };
      // send-link returns an ABSOLUTE url when PUBLIC_APP_URL is configured and
      // a RELATIVE path when it isn't — which is the case on CI. Bare
      // `new URL(url)` throws "Invalid URL" on the relative form. Passing a base
      // handles both: an absolute url ignores the base, a relative one resolves
      // against it. We only want the pathname either way.
      const path = new URL(url, "http://kiosk.invalid").pathname;

      await page.goto(path, { waitUntil: "domcontentloaded" });
      await waitForHydration(page);

      // (1) The card renders — from the REAL server context. No page.route
      // stub anywhere in this file.
      const photoHeading = page.getByRole("heading", { name: /add your photo/i });
      await expect(photoHeading).toBeVisible({ timeout: 15_000 });

      // (2) Decline it.
      await page.getByRole("button", { name: /^not now$/i }).click();
      await expect(photoHeading).toBeHidden();

      // The waiver is still outstanding, so the flow is deliberately NOT
      // complete yet — declining the photo settles the photo, nothing else.
      await expect(
        page.getByRole("heading", { name: /sign the liability waiver/i }),
      ).toBeVisible();

      // Sign the waiver — the last outstanding item.
      await page.getByRole("checkbox").check();
      await page.locator("#typed-name").fill(`Photo Skip${suffix.slice(-4)}`);
      await page.getByRole("button", { name: /save signature/i }).click();

      // (3) THE POINT: a declined photo does not hang the flow.
      await expect(
        page.getByRole("heading", { name: /you're checked in/i }),
      ).toBeVisible({ timeout: 20_000 });
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
