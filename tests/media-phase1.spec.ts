import { test, expect } from "@playwright/test";

test("admin creates shoot, photographer confirms, checks in, uploads, admin sees asset count", async ({
  browser,
}) => {
  // Admin context: sign in via API (faster, no race with other parallel
  // tests that also exercise /signin). The cookie is stored on the
  // context and available to subsequent requests.
  const adminCtx = await browser.newContext();
  const adminLoginRes = await adminCtx.request.post("/api/auth/signin", {
    data: {
      email: "admin@test.aspiresports.com",
      password: "TestAdmin123!",
    },
  });
  expect(adminLoginRes.ok()).toBeTruthy();

  // Photographer context: geolocation pre-granted for check-in. Sign in
  // via API for the same reasons as admin.
  const mediaCtx = await browser.newContext({
    permissions: ["geolocation"],
    geolocation: { latitude: 40.123, longitude: -83.123 },
  });
  const mediaLoginRes = await mediaCtx.request.post("/api/auth/signin", {
    data: {
      email: "media_staff@test.aspiresports.com",
      password: "TestMedia123!",
    },
  });
  expect(mediaLoginRes.ok()).toBeTruthy();

  const mediaPage = await mediaCtx.newPage();

  const meRes = await mediaPage.request.get("/api/auth/me");
  const mediaStaffUserId = (await meRes.json()).user.id;

  const start = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const end = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString();
  const createRes = await adminCtx.request.post("/api/admin/media/shoots", {
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

  const adminPage = await adminCtx.newPage();
  await adminPage.goto(`/admin/media/shoots/${sessionId}`);
  await expect(adminPage.getByTestId("asset-count")).toBeVisible();
});
