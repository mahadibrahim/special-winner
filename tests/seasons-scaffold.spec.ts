import { test, expect } from "@playwright/test"
import {
  TEST_USERS,
  signIn,
  waitForHydration,
} from "./utils/test-helpers"

test.describe("Season scaffolding — clone-from-prior flow", () => {
  test.setTimeout(60_000)

  test.beforeEach(async ({ page }) => {
    await signIn(page, TEST_USERS.admin.email, TEST_USERS.admin.password)
  })

  test("clones teams from a prior season via the New Season dialog", async ({ page }) => {
    // Sign in and navigate to seasons page
    await page.goto("/admin/seasons", { waitUntil: "domcontentloaded" })

    // Wait for React hydration before any interactions (CLAUDE.md convention)
    await waitForHydration(page)

    // Wait for data to load — the "Add Season" button is disabled until programs load
    const addSeasonBtn = page.getByRole("button", { name: /add season/i }).first()
    await expect(addSeasonBtn).toBeEnabled({ timeout: 15000 })

    // ── Step 1: create a source season via the API so we have something to clone ──
    const ts = Date.now()
    const sourceName = `E2E Source ${ts}`
    const sourceSlug = `e2e-source-${ts}`

    const cookies = await page.context().cookies()
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ")

    // Get a program to attach to
    const progsRes = await page.request.get("/api/admin/programs", {
      headers: { Cookie: cookieHeader },
    })
    expect(progsRes.ok()).toBeTruthy()
    const progsJson = await progsRes.json()
    expect(progsJson.programs.length).toBeGreaterThan(0)
    const programId = progsJson.programs[0].id

    // Create source season with 3 bulk teams
    const sourceRes = await page.request.post("/api/admin/seasons", {
      headers: { Cookie: cookieHeader, "Content-Type": "application/json" },
      data: {
        programId,
        name: sourceName,
        slug: sourceSlug,
        startDate: "2025-09-01",
        endDate: "2025-12-15",
        priceCents: 10000,
        scaffold: { type: "bulk", count: 3 },
      },
    })
    expect(sourceRes.status()).toBe(201)
    const sourceJson = await sourceRes.json()
    const sourceSeasonId = sourceJson.season.id

    try {
      // ── Step 2: reload so the source season appears in the picker dropdown ──
      await page.reload({ waitUntil: "networkidle" })
      await waitForHydration(page)

      // Wait for data to reload — wait for the seasons list heading which only
      // appears once the component has mounted and data has been fetched
      await page.waitForSelector('h1:text("Seasons")', { timeout: 15000 })

      // Wait for the "Add Season" button to be enabled (programs loaded)
      const addSeasonBtnAfterReload = page.getByRole("button", { name: /add season/i }).first()
      await expect(addSeasonBtnAfterReload).toBeEnabled({ timeout: 15000 })

      // ── Step 3: open the New Season dialog ──
      await addSeasonBtnAfterReload.click()

      // Dialog should open — wait for its title
      await expect(page.getByRole("dialog")).toBeVisible({ timeout: 15000 })
      await expect(
        page.getByRole("heading", { name: /add season/i })
      ).toBeVisible()

      // ── Step 4: verify scaffold picker is present and clone is auto-selected ──
      await expect(page.getByText("Starting structure")).toBeVisible()

      // The clone radio should be checked (auto-selected because prior seasons exist)
      const cloneRadio = page
        .locator('input[type="radio"][name="scaffold-mode"]')
        .nth(0)
      await expect(cloneRadio).toBeChecked()

      // The clone source dropdown should be visible — explicitly select our source season
      const cloneSourceTrigger = page.locator('[data-slot="select-trigger"]').first()
      await expect(cloneSourceTrigger).toBeVisible()
      await cloneSourceTrigger.click()
      // Radix Select opens a listbox — wait for it and click the source season option
      await page.getByRole("option", { name: new RegExp(sourceName) }).click()

      // ── Step 5: fill in target season fields ──
      const targetTs = Date.now()
      const targetName = `E2E Target ${targetTs}`
      const targetSlug = `e2e-target-${targetTs}`

      await page.locator('input[id="name"]').fill(targetName)
      await page.locator('input[id="slug"]').fill(targetSlug)
      await page.locator('input[id="startDate"]').fill("2026-09-01")
      await page.locator('input[id="endDate"]').fill("2026-12-15")

      // Price should be pre-filled from the clone source (10000 cents → 100.00)
      const priceInput = page.locator('input[id="priceCents"]')
      await expect(priceInput).toHaveValue("100")

      // ── Step 6: submit the dialog ──
      // Click the submit button inside the dialog footer (not the "Add Season" page button)
      await page.getByRole("dialog").getByRole("button", { name: /add season/i }).click()

      // Dialog should close. Timeout is generous because handleSubmit awaits
      // a full refetch (seasons + programs + age-groups + venues) before
      // closing the dialog. CI's DB is slow enough that ~10s is the floor —
      // 20s gives headroom without masking a real hang.
      await expect(page.getByRole("dialog")).not.toBeVisible({ timeout: 20000 })

      // The new season should appear in the list
      await expect(
        page.getByRole("heading", { name: targetName, level: 3 })
      ).toBeVisible({ timeout: 10000 })

      // ── Step 7: verify via API that the new season has 3 cloned teams ──
      const listRes = await page.request.get("/api/admin/seasons", {
        headers: { Cookie: cookieHeader },
      })
      const listJson = await listRes.json()
      const newSeason = listJson.seasons.find((s: any) => s.name === targetName)
      expect(newSeason, "new season not found in API response").toBeDefined()

      const teamsRes = await page.request.get(
        `/api/admin/teams?seasonId=${newSeason.id}`,
        { headers: { Cookie: cookieHeader } }
      )
      const teamsJson = await teamsRes.json()
      expect(teamsJson.teams).toHaveLength(3)

      // ── Cleanup: delete target season ──
      const deleteTargetRes = await page.request.delete(
        `/api/admin/seasons?id=${newSeason.id}`,
        { headers: { Cookie: cookieHeader } }
      )
      expect(deleteTargetRes.ok()).toBeTruthy()
    } finally {
      // ── Cleanup: always delete source season ──
      await page.request.delete(`/api/admin/seasons?id=${sourceSeasonId}`, {
        headers: { Cookie: cookieHeader },
      })
    }
  })
})
