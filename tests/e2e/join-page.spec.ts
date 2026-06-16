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

  test("renders the channel cards", async ({ page }) => {
    await page.goto("/join", { waitUntil: "domcontentloaded" });
    await waitForHydration(page);

    await expect(
      page.getByRole("heading", { name: /email list/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /whatsapp/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /follow us/i }),
    ).toBeVisible();
  });
});
