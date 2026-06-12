# Site Announcement ("Next up" card) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Spec slice 3 of `docs/superpowers/specs/2026-06-12-aesthetic-evolution-design.md`: a single-slot, admin-set, expiry-aware announcement rendered as the hero-docked "Next up" card on home and the two hubs — server-rendered, audience-targetable, hides cleanly when empty.

**Architecture:** A `siteAnnouncement` key on the existing `organizations.settings` jsonb (type-only change, no migration), validated by zod in the existing `/api/admin/organizations/settings` PATCH (which also clears the domain-resolver cache so edits show immediately on the same instance). A pure helper `getActiveSiteAnnouncement(org, surface)` owns expiry + audience filtering (unit-tested). Public render: a `NextUpCard` Astro component for the hubs and a serialized prop into `DualCtaHero` for home. Admin UI: a "Site banner" section in the existing tabbed `AdminSettings`, mirroring the `ExternalStoreSettings` section.

**NAMING:** never "announcement(s)" bare in UI/nav/routes — `/admin/announcements` (dashboard messages to registered users) already exists. This feature is `siteAnnouncement` in code, "Site banner — Next up card" in the admin UI.

**Tech Stack:** existing org-settings pipeline (`requireAdminAccess` + `requireOrganizationContext`, shallow-merge PATCH), Astro SSR locals, Vitest, Playwright.

---

## File structure

| File | Action | Responsibility |
|---|---|---|
| `src/lib/db/schema/organizations.ts` | modify | `OrganizationSiteAnnouncement` interface + `siteAnnouncement?` key on `OrganizationSettings`. |
| `src/lib/marketing/site-announcement.ts` | create | Pure helper: active/expired/audience logic. |
| `tests/unit/site-announcement.test.ts` | create | Unit tests for the helper. |
| `src/pages/api/admin/organizations/settings.ts` | modify | zod schema for the new key; `clearDomainCache()` after successful PATCH. |
| `tests/api/admin/site-announcement-settings.test.ts` | create | PATCH set/clear/roundtrip with capture-and-restore. |
| `src/components/admin/admin-settings.tsx` | modify | "Site banner" form section. |
| `src/components/marketing/next-up-card.astro` | create | Server-rendered card (hubs). |
| `src/components/marketing/dual-cta-hero.tsx` | modify | Optional `announcement` prop → card in the hero's reserved slot. |
| `src/pages/index.astro`, `src/pages/adult.astro`, `src/pages/youth.astro` | modify | Read locals → helper → render. |
| `tests/e2e/site-announcement.spec.ts` | create | Admin sets → public shows (audience-filtered) → clear → gone. |

Binding facts (verified):

- `organizations.settings` is `jsonb().$type<OrganizationSettings>()` — adding a key is type-only; follow the `externalStore?: OrganizationExternalStore` precedent (organizations.ts:405-462).
- PATCH endpoint does a top-level shallow merge; `null` deletes a key; auth = `requireAdminAccess` + `requireOrganizationContext` (NOT requireSameOrg* — no resource id here).
- `locals.organization` is a full row (settings included); resolver caches 5 min/hostname/instance — `clearDomainCache()` is exported from `src/lib/organization/domain-resolver.ts:294`. In-handler clearing makes dev/e2e deterministic; prod cross-instance staleness ≤5 min is accepted (documented in the admin UI helper text).
- Hubs are SSR by default (no prerender flag) — locals available. index.astro already `prerender = false`.
- API test mirrors `tests/api/admin/external-store-settings.test.ts` (getAdminCookie/apiFetch/capture-and-restore — shared dev DB, ALWAYS restore in afterAll).
- e2e: `landing-pages.spec.ts` homepage tests assert hero contents — the announcement card must not break them (it renders alongside, not instead).

---

### Task 1: Branch + docs

```bash
git fetch origin && git switch -c feat/site-announcement origin/main
git status --porcelain   # docs only; never add stray files
git add docs/superpowers/plans/2026-06-12-site-announcement.md
git commit -m "docs: site announcement (Next up card) plan"
```

### Task 2: Type + pure helper (TDD)

- [ ] **Step 1: failing tests** — `tests/unit/site-announcement.test.ts`:

```typescript
import { describe, expect, it } from "vitest"
import { getActiveSiteAnnouncement } from "@/lib/marketing/site-announcement"
import type { OrganizationSiteAnnouncement } from "@/lib/db/schema/organizations"

const FUTURE = "2099-01-01T00:00:00.000Z"
const PAST = "2020-01-01T00:00:00.000Z"

function ann(over: Partial<OrganizationSiteAnnouncement> = {}): OrganizationSiteAnnouncement {
  return {
    title: "Summer 7v7 League",
    detail: "Registration closes June 30 — 4 spots left",
    linkUrl: "/adult/leagues",
    linkLabel: "Claim a spot",
    audience: "all",
    expiresAt: FUTURE,
    ...over,
  }
}

function orgWith(a: OrganizationSiteAnnouncement | undefined) {
  return a === undefined
    ? ({ settings: {} } as any)
    : ({ settings: { siteAnnouncement: a } } as any)
}

describe("getActiveSiteAnnouncement", () => {
  it("returns the announcement for a matching surface", () => {
    expect(getActiveSiteAnnouncement(orgWith(ann()), "home")?.title).toBe("Summer 7v7 League")
  })

  it("returns null when none set / org null / settings null", () => {
    expect(getActiveSiteAnnouncement(orgWith(undefined), "home")).toBeNull()
    expect(getActiveSiteAnnouncement(null, "home")).toBeNull()
    expect(getActiveSiteAnnouncement({ settings: null } as any, "home")).toBeNull()
  })

  it("expired → null; no expiry → active", () => {
    expect(getActiveSiteAnnouncement(orgWith(ann({ expiresAt: PAST })), "home")).toBeNull()
    expect(getActiveSiteAnnouncement(orgWith(ann({ expiresAt: undefined })), "home")).not.toBeNull()
  })

  it("malformed expiry treated as expired (fail closed)", () => {
    expect(getActiveSiteAnnouncement(orgWith(ann({ expiresAt: "not-a-date" })), "home")).toBeNull()
  })

  it("audience targeting: home shows everything; hubs filter", () => {
    const adultOnly = orgWith(ann({ audience: "adult" }))
    expect(getActiveSiteAnnouncement(adultOnly, "home")).not.toBeNull()
    expect(getActiveSiteAnnouncement(adultOnly, "adult")).not.toBeNull()
    expect(getActiveSiteAnnouncement(adultOnly, "youth")).toBeNull()
    const allAud = orgWith(ann({ audience: "all" }))
    expect(getActiveSiteAnnouncement(allAud, "youth")).not.toBeNull()
  })

  it("blank title → null (incomplete config never renders)", () => {
    expect(getActiveSiteAnnouncement(orgWith(ann({ title: "  " })), "home")).toBeNull()
  })
})
```

Run: `npx vitest run tests/unit/site-announcement.test.ts` → FAIL (module missing).

- [ ] **Step 2: type** — in `src/lib/db/schema/organizations.ts`, directly after the `OrganizationExternalStore` interface (read the file; mirror its doc-comment style):

```typescript
/**
 * Single-slot public site banner — the "Next up" card rendered in the
 * home/hub heroes (aesthetic-evolution spec, 2026-06-12). NOT the
 * announcements table (dashboard messages to registered users).
 * Set/cleared from /admin/settings; expiry and audience filtering happen
 * read-side in src/lib/marketing/site-announcement.ts.
 */
export interface OrganizationSiteAnnouncement {
  title: string;
  detail?: string;
  linkUrl?: string;
  linkLabel?: string;
  /** Which public surfaces show it. "all" = home + both hubs. */
  audience: "all" | "adult" | "youth";
  /** ISO datetime; absent = no expiry. */
  expiresAt?: string;
}
```

and add to `OrganizationSettings` (alongside `externalStore?`): `siteAnnouncement?: OrganizationSiteAnnouncement;`

- [ ] **Step 3: helper** — `src/lib/marketing/site-announcement.ts`:

```typescript
import type { Organization, OrganizationSiteAnnouncement } from "@/lib/db/schema/organizations"

export type AnnouncementSurface = "home" | "adult" | "youth"

/**
 * Resolve the active site announcement for a public surface, or null.
 * Owns all display logic: presence, non-blank title, expiry (malformed
 * dates fail closed), audience targeting (home shows every audience —
 * it's the only page both customers share).
 */
export function getActiveSiteAnnouncement(
  org: Pick<Organization, "settings"> | null,
  surface: AnnouncementSurface,
): OrganizationSiteAnnouncement | null {
  const a = org?.settings?.siteAnnouncement
  if (!a || !a.title?.trim()) return null

  if (a.expiresAt !== undefined) {
    const t = Date.parse(a.expiresAt)
    if (Number.isNaN(t) || t <= Date.now()) return null
  }

  if (surface !== "home" && a.audience !== "all" && a.audience !== surface) return null

  return a
}
```

- [ ] **Step 4:** tests pass (`npx vitest run tests/unit/site-announcement.test.ts`), `npx tsc --noEmit` clean, commit:

```bash
git add src/lib/db/schema/organizations.ts src/lib/marketing/site-announcement.ts tests/unit/site-announcement.test.ts
git commit -m "feat(announce): siteAnnouncement settings type + display helper"
```

(Schema file changed but only TS interfaces — confirm `git diff` contains no table/column changes, so no migration. State this in the task report.)

### Task 3: API + admin form

- [ ] **Step 1: endpoint** — in `src/pages/api/admin/organizations/settings.ts` (read it first):
  - Add a zod schema mirroring the file's `externalStoreSchema` style:

```typescript
const siteAnnouncementSchema = z.object({
  title: z.string().trim().min(1).max(120),
  detail: z.string().trim().max(240).optional(),
  linkUrl: z.string().trim().max(500).optional(),
  linkLabel: z.string().trim().max(60).optional(),
  audience: z.enum(["all", "adult", "youth"]),
  expiresAt: z.string().datetime({ offset: true }).optional(),
});
```

  - Add `siteAnnouncement: siteAnnouncementSchema.nullable().optional(),` to `settingsPatchSchema`.
  - After the successful update, import and call `clearDomainCache()` from `@/lib/organization/domain-resolver` (so the public pages on this instance re-read settings immediately; add a one-line comment about the ≤5 min cross-instance staleness in prod).

- [ ] **Step 2: API test** — `tests/api/admin/site-announcement-settings.test.ts`, mirroring `tests/api/admin/external-store-settings.test.ts` exactly (read it first): capture `settings.siteAnnouncement` in beforeAll, restore in afterAll, `resetCookies()`. Cases: (1) PATCH set → 200, GET roundtrips every field; (2) PATCH invalid (blank title / bad audience / non-datetime expiresAt) → 400; (3) PATCH `siteAnnouncement: null` → key gone on GET; (4) unauthenticated PATCH → 401/403 (mirror whichever the sibling test asserts).

- [ ] **Step 3: admin form** — in `src/components/admin/admin-settings.tsx` (read it first; mirror the `ExternalStoreSettings` section's structure, state handling, and save flow exactly): a "Site banner — Next up card" section with inputs for title, detail, link URL, link label, audience (select: Everywhere / Adult pages / Youth pages), expires (datetime-local; convert to ISO with offset on save — `new Date(value).toISOString()`), plus Save and a "Clear banner" button that PATCHes `siteAnnouncement: null`. Helper text: "Shows in the home and hub heroes. Changes can take up to 5 minutes to appear. Clears itself after the expiry." Use existing form primitives in that file (don't invent new ones).

- [ ] **Step 4:** with the dev server up: `CRON_SECRET=e2e-secret TEST_BASE_URL=http://localhost:4321 npx vitest run tests/api/admin/site-announcement-settings.test.ts --config vitest.api.config.ts` (check how `npm run test:api` resolves its config and use the same mechanism for a single file). All pass. tsc clean. Commit:

```bash
git add src/pages/api/admin/organizations/settings.ts tests/api/admin/site-announcement-settings.test.ts src/components/admin/admin-settings.tsx
git commit -m "feat(announce): site banner admin form + settings API"
```

### Task 4: Public render

- [ ] **Step 1: card component** — `src/components/marketing/next-up-card.astro`:

```astro
---
import type { OrganizationSiteAnnouncement } from "@/lib/db/schema/organizations";

interface Props {
  announcement: OrganizationSiteAnnouncement;
}
const { announcement: a } = Astro.props;
---

<div class="bg-paper px-4 py-3.5 shadow-[0_10px_28px_rgba(0,0,0,0.4)] max-w-xs">
  <div class="flex items-center gap-2">
    <span class="w-2 h-2 rounded-full bg-primary animate-pulse" aria-hidden="true"></span>
    <span class="text-[10px] font-bold tracking-[0.16em] uppercase text-primary">Next up</span>
  </div>
  <p class="font-display text-lg text-ink mt-1.5 leading-snug">{a.title}</p>
  {a.detail && <p class="font-mono text-[11px] text-ink-muted mt-1.5 uppercase">{a.detail}</p>}
  {a.linkUrl && (
    <a
      href={a.linkUrl}
      data-landing-cta="next-up-card"
      class="block text-sm font-semibold text-primary mt-2.5 pt-2.5 border-t border-border hover:underline"
    >
      {a.linkLabel || "Learn more"} →
    </a>
  )}
</div>
```

- [ ] **Step 2: hubs** — in `adult.astro` and `youth.astro` frontmatter:

```astro
import NextUpCard from "@/components/marketing/next-up-card.astro";
import { getActiveSiteAnnouncement } from "@/lib/marketing/site-announcement";
const announcement = getActiveSiteAnnouncement(Astro.locals.organization, "adult"); // "youth" on youth.astro
```

In each hero section, wrap the existing copy block and the card in a flex row so the card docks right on desktop and stacks below on mobile:

```astro
<div class="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 flex flex-col lg:flex-row lg:items-end gap-8">
  <div class="flex-1"><!-- existing kicker/h1/copy block, unchanged --></div>
  {announcement && <div class="lg:pb-1"><NextUpCard announcement={announcement} /></div>}
</div>
```

(Read each hub's current hero markup and apply minimally — the inner copy block must not change; the e2e hub tests assert its contents.)

- [ ] **Step 3: home** — `index.astro` frontmatter:

```astro
import { getActiveSiteAnnouncement } from "@/lib/marketing/site-announcement";
const announcement = getActiveSiteAnnouncement(Astro.locals.organization, "home");
```

`<DualCtaHero client:load announcement={announcement ?? undefined} />`. In `dual-cta-hero.tsx`: add the optional prop and render the card inside the hero (this fills the reserved slot named in the component's doc comment):

```tsx
import type { OrganizationSiteAnnouncement } from "@/lib/db/schema/organizations"

interface DualCtaHeroProps {
  announcement?: OrganizationSiteAnnouncement
}

export function DualCtaHero({ announcement }: DualCtaHeroProps) {
```

Layout: make the `.graded-content` inner container `flex flex-col lg:flex-row lg:items-end gap-10`; existing copy block becomes `flex-1 max-w-4xl` (keep all its content identical); when `announcement` is set render a JSX card after it (same markup as next-up-card.astro, translated to JSX with the identical classes and `data-landing-cta="next-up-card"`). Keep the doc comment honest (slot now real). The duplicate card markup (astro + JSX) is acceptable — two render contexts; note it for the multi-brand refactor.

- [ ] **Step 4:** tsc clean; with dev server up and NO announcement set, `curl -s -m 60 http://localhost:4321/ | grep -c "Next up"` → 0 (hides cleanly); existing landing-pages homepage tests still pass: `PLAYWRIGHT_BASE_URL=http://localhost:4321 npx playwright test tests/e2e/landing-pages.spec.ts`. Commit:

```bash
git add src/components/marketing/next-up-card.astro src/components/marketing/dual-cta-hero.tsx src/pages/index.astro src/pages/adult.astro src/pages/youth.astro
git commit -m "feat(announce): Next up card in home + hub heroes"
```

### Task 5: E2E

- [ ] **Step 1:** `tests/e2e/site-announcement.spec.ts`:

```typescript
import { test, expect } from "@playwright/test";

/**
 * Site announcement ("Next up" card): admin sets a single-slot banner via
 * the org-settings API; it renders server-side in the home + hub heroes,
 * audience-filtered; clearing removes it. Serial — tests share one
 * org-level setting and MUST restore it (shared dev/CI DB).
 */

const SETTINGS_API = "/api/admin/organizations/settings";

async function adminContext(request: any, baseURL: string) {
  const res = await request.post(`${baseURL}/api/auth/signin`, {
    data: { email: "admin@test.aspiresports.com", password: "TestAdmin123!" },
  });
  expect(res.ok()).toBeTruthy();
  return res.headers()["set-cookie"];
}

test.describe.configure({ mode: "serial" });

test.describe("Site announcement", () => {
  let original: unknown = null;

  test.beforeAll(async ({ request, baseURL }) => {
    await adminContext(request, baseURL!);
    const res = await request.get(`${baseURL}${SETTINGS_API}`);
    if (res.ok()) original = (await res.json()).settings?.siteAnnouncement ?? null;
  });

  test.afterAll(async ({ request, baseURL }) => {
    await request.patch(`${baseURL}${SETTINGS_API}`, {
      data: { settings: { siteAnnouncement: original } },
    });
  });

  test("adult-targeted banner shows on home + /adult, not /youth; clear removes", async ({ page, request, baseURL }) => {
    const set = await request.patch(`${baseURL}${SETTINGS_API}`, {
      data: {
        settings: {
          siteAnnouncement: {
            title: "E2E Banner League",
            detail: "Closes soon",
            linkUrl: "/adult/leagues",
            linkLabel: "Claim a spot",
            audience: "adult",
          },
        },
      },
    });
    expect(set.ok()).toBeTruthy();

    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.getByText("E2E Banner League")).toBeVisible();

    await page.goto("/adult", { waitUntil: "domcontentloaded" });
    await expect(page.getByText("E2E Banner League")).toBeVisible();
    await expect(page.locator('[data-landing-cta="next-up-card"]')).toHaveAttribute("href", "/adult/leagues");

    await page.goto("/youth", { waitUntil: "domcontentloaded" });
    await expect(page.getByText("E2E Banner League")).toHaveCount(0);

    const clear = await request.patch(`${baseURL}${SETTINGS_API}`, {
      data: { settings: { siteAnnouncement: null } },
    });
    expect(clear.ok()).toBeTruthy();
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.getByText("E2E Banner League")).toHaveCount(0);
  });
});
```

Note: Playwright's `request` fixture shares cookies per test, not across `request.post` in beforeAll and later calls — verify with one run; if the PATCH 401s, switch to an explicit `playwright.request.newContext()` stored in a variable across hooks (standard pattern; check how other e2e specs authenticate API calls — e.g. grep tests/e2e for `request.post(.*signin` precedent and mirror it).

- [ ] **Step 2:** run it plus the neighbors:

```bash
ALLOW_E2E_SEED=yes npm run db:seed:e2e
PLAYWRIGHT_BASE_URL=http://localhost:4321 npx playwright test tests/e2e/site-announcement.spec.ts tests/e2e/landing-pages.spec.ts
```

All pass (the announcement spec restores state so landing-pages can run after it in any order — but run them in this order at least once to prove non-interference).

- [ ] **Step 3:** commit:

```bash
git add tests/e2e/site-announcement.spec.ts
git commit -m "test(announce): site banner e2e — set, audience filter, clear"
```

### Task 6: Verification + PR

```bash
npx tsc --noEmit
npx vitest run tests/unit/
npm run build
git diff origin/main --stat -- src/lib/db/migrations/   # empty — type-only schema change
```

Push `feat/site-announcement`, PR titled "Site announcement: admin-set Next up card in home + hub heroes" (body: spec slice 3; naming note re: existing announcements feature; cache-staleness note; founder reminder that the card is what makes catalog promotions instant). `gh pr checks --watch` to green (Netlify check fails by design).

---

## Self-review (plan time)

- **Spec fidelity:** single slot ✓, org settings JSON ✓ (key `siteAnnouncement`, renamed from spec's `announcement` for the collision — spec intent preserved), admin form on existing settings surface ✓, server-side render home + hubs ✓, audience targeting ✓, expiry ✓, hides cleanly ✓, no client fetch ✓.
- **No migration:** jsonb type annotation only; Task 2 explicitly verifies the diff.
- **Shared-DB discipline:** both API and e2e tests capture-and-restore; e2e is serial.
- **e2e contract:** hub/home hero copy blocks unchanged (existing tests untouched); card is additive.
- **Placeholders:** none; the two mirror-instructions (admin form section, API test) name their exact source files and the deltas.
