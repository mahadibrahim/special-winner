import { test, expect } from "@playwright/test"
import { TEST_USERS, signIn, waitForHydration } from "../utils/test-helpers"

/**
 * Proves sonner's <Toaster /> actually renders app toasts end-to-end.
 *
 * Before this fix, <Toaster /> was mounted nowhere under the Aspire chrome —
 * every `toast.success/error/warning` call across the app (58 files) was a
 * silent no-op. BaseLayout now mounts a shared <AppToaster client:load />
 * once (see src/components/ui/app-toaster.tsx), so any existing toast call
 * site should surface visibly. This exercises the teams-list delete flow
 * (`toast.success('Deleted "..."')` in src/components/admin/teams-list.tsx).
 */
test.describe("Toast notifications render (sonner Toaster mounted in BaseLayout)", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, TEST_USERS.admin.email, TEST_USERS.admin.password)
  })

  test("deleting a team shows a visible success toast", async ({ page }) => {
    const cookies = await page.context().cookies()
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ")

    // Fixture setup via API (mirrors tests/e2e/seasons-scaffold.spec.ts):
    // grab any season this org already has, then create a throwaway team to
    // delete. This avoids depending on the UI's "Add Team" empty-state button,
    // which only renders when the currently filtered team list is empty.
    const seasonsRes = await page.request.get("/api/admin/seasons?include_test=1", {
      headers: { Cookie: cookieHeader },
    })
    expect(seasonsRes.ok()).toBeTruthy()
    const seasonsJson = await seasonsRes.json()
    expect(seasonsJson.seasons.length).toBeGreaterThan(0)
    const seasonId = seasonsJson.seasons[0].id

    const teamName = `E2E Toast Team ${Date.now()}`
    const createRes = await page.request.post("/api/admin/teams", {
      headers: { Cookie: cookieHeader, "Content-Type": "application/json" },
      data: { seasonId, name: teamName },
    })
    expect(createRes.status()).toBe(201)

    // Navigate to the teams page and wait for React hydration (PortalLayout,
    // wrapped by AdminLayout, calls useHydrationBeacon — CLAUDE.md convention)
    // before any click.
    await page.goto("/admin/teams", { waitUntil: "domcontentloaded" })
    await waitForHydration(page)

    const teamCard = page.locator("div", { hasText: teamName }).last()
    await expect(teamCard).toBeVisible({ timeout: 15000 })

    // Trigger the delete confirm dialog via an element click (not a keyboard
    // shortcut) per CLAUDE.md Playwright conventions.
    await page.getByRole("button", { name: `Delete ${teamName}` }).click()

    // Confirm the destructive AlertDialog (confirmLabel: "Delete" in
    // teams-list.tsx's handleDelete).
    await page.getByRole("button", { name: "Delete", exact: true }).click()

    // The proof: toast.success(`Deleted "${team.name}"`) must actually render.
    await expect(
      page.getByText(`Deleted "${teamName}"`, { exact: false }),
    ).toBeVisible({ timeout: 10000 })
  })
})
