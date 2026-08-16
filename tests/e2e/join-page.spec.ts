import { test, expect } from "@playwright/test";
import { waitForHydration } from "../utils/test-helpers";

test.describe("/join page", () => {
  test("submits an email and shows the success state (Aspire)", async ({
    page,
  }) => {
    await page.goto("/join?src=e2e-test", { waitUntil: "domcontentloaded" });
    await waitForHydration(page);

    await page.fill("#join-email", `e2e-join-${Date.now()}@example.com`);
    await page.getByRole("button", { name: /get my code/i }).click();

    await expect(page.getByText(/you're on the list/i)).toBeVisible();
  });

  test("renders the configured channel cards", async ({ page }) => {
    await page.goto("/join", { waitUntil: "domcontentloaded" });
    await waitForHydration(page);

    await expect(
      page.getByRole("heading", { name: /email list/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /follow us/i }),
    ).toBeVisible();

    // The WhatsApp card renders only once JOIN_WHATSAPP_URL is a real group
    // invite. It is still a REPLACE_ME placeholder (the group needs creating
    // from a personal account — an API-registered number cannot admin a
    // consumer group), and this page previously shipped it as a live link to
    // chat.whatsapp.com/REPLACE_ME. Flip this to toBeVisible() when the real
    // invite lands; tests/unit/join-config.test.ts guards the same boundary.
    await expect(
      page.getByRole("heading", { name: /whatsapp/i }),
    ).toBeHidden();
  });

  test("renders no placeholder links", async ({ page }) => {
    await page.goto("/join", { waitUntil: "domcontentloaded" });
    await waitForHydration(page);

    await expect(page.locator('a[href*="REPLACE_ME"]')).toHaveCount(0);
  });
});
