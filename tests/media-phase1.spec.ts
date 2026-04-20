import { test, expect } from "@playwright/test";

test("admin creates shoot, photographer confirms, checks in, uploads, admin sees asset count", async ({
  browser,
}) => {
  const adminCtx = await browser.newContext();
  const adminPage = await adminCtx.newPage();
  await adminPage.goto("/signin");
  await adminPage.fill("#email", "admin@test.aspiresports.com");
  await adminPage.fill("#password", "TestAdmin123!");
  await adminPage.click('button[type="submit"]');
  await adminPage.waitForURL(/admin|dashboard/);

  const mediaCtx = await browser.newContext({
    permissions: ["geolocation"],
    geolocation: { latitude: 40.123, longitude: -83.123 },
  });
  const mediaPage = await mediaCtx.newPage();
  await mediaPage.goto("/signin");
  await mediaPage.fill("#email", "media_staff@test.aspiresports.com");
  await mediaPage.fill("#password", "TestMedia123!");
  await mediaPage.click('button[type="submit"]');
  await mediaPage.waitForURL(/dashboard|media|admin/);

  const meRes = await mediaPage.request.get("/api/auth/me");
  const mediaStaffUserId = (await meRes.json()).user.id;

  const start = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const end = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString();
  const createRes = await adminPage.request.post("/api/admin/media/shoots", {
    data: {
      assignedUserId: mediaStaffUserId,
      sessionType: "game",
      scheduledStart: start,
      scheduledEnd: end,
    },
  });
  expect(createRes.status()).toBe(201);
  const sessionId = (await createRes.json()).session.id;

  await mediaPage.goto(`/media/jobs/${sessionId}`);
  await mediaPage.getByRole("button", { name: /confirm/i }).click();
  await mediaPage.getByTestId("check-in-btn").click();
  await expect(mediaPage.getByText(/status: checked_in/i)).toBeVisible({
    timeout: 10_000,
  });

  const fileInput = mediaPage.locator('input[type="file"]').first();
  await fileInput.setInputFiles({
    name: "shot.jpg",
    mimeType: "image/jpeg",
    buffer: Buffer.from("fake-jpeg-bytes"),
  });
  await expect(mediaPage.getByText(/uploaded/i)).toBeVisible({ timeout: 30_000 });

  await adminPage.goto(`/admin/media/shoots/${sessionId}`);
  await expect(adminPage.getByTestId("asset-count")).toBeVisible();
});
