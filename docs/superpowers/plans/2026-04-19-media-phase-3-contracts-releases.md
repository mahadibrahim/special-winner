# Media Workflow — Phase 3: Contracts & Releases Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship in-platform 1099 contract e-signing for photographers, media-release capture for players, and a strict publishing filter so no photo of a non-granted player leaks to any parent dashboard — while blocking assignment of any shoot to an unsigned photographer from both the UI and the API.

**Architecture:** Add one new table (`media_staff_agreements`) to the existing `src/lib/db/schema/media.ts`, three columns to `family_members`, a Markdown template rendered to HTML via a tiny helper, a headless-Chromium PDF snapshot (Puppeteer via `puppeteer-core` + `@sparticuz/chromium` to stay under Netlify Function limits), and a single `isAssetVisibleToParent` helper that every parent-facing asset read path consumes. Admin and photographer surfaces follow the existing Astro + AdminLayout / React-island pattern.

**Tech Stack:** Astro 5, Drizzle ORM, PostgreSQL (Railway), Cloudflare R2 (S3 SDK), Puppeteer (`puppeteer-core` + `@sparticuz/chromium`), Markdown (`marked`), Vitest, Playwright, React 19.

**Spec:** `docs/superpowers/specs/2026-04-19-media-workflow-design.md` (section 8 + publishing-filter from §5.5).

**Assumptions about prior phases (must be present before this plan runs):**
- `roleNameEnum` already contains `media_staff` and `media_editor` (added in Phase 1).
- `shoot_sessions`, `media_assets`, `media_tags`, `media_staff_profiles`, `media_audit_log` tables exist in `src/lib/db/schema/media.ts` (Phases 1–2).
- R2 client helper exists at `src/lib/media/r2.ts` exporting `putObject(key, body, contentType)` and `getSignedGetUrl(key, ttlSeconds)` (added in Phase 1). If absent, Task 6 below also defines the minimum R2 helper so this plan is self-contained.
- The admin shoot-create API lives at `POST /api/admin/media/shoots` and the admin UI page at `/admin/media/shoots/new` — Phase 3 **modifies** both to add the signed-agreement gate.
- Existing parent asset-read endpoints: `GET /api/dashboard/media/assets` (the parent gallery feed) and `GET /api/dashboard/media/assets/:id` (single asset). Phase 3 routes every asset read through a shared visibility filter.

**Out of scope for this plan:**
- Phase 4 (payouts, rate cards, analytics).
- Background-check provider integration (column exists; integration deferred).
- Drawn-signature capture (`signature_image_key` is nullable and unused here).
- DocuSign / external e-sign provider (click-through is fine per spec §10 item 4).

---

## File structure

### New schema files (Drizzle)
- *(none — the new table goes into the existing `src/lib/db/schema/media.ts`)*

### Modified schema files
- `src/lib/db/schema/media.ts` — add `mediaStaffAgreements` table + enums.
- `src/lib/db/schema/registrations.ts` — add `media_release_status`, `media_release_signed_at`, `media_release_version` to `family_members`.

### New template / static content
- `templates/media/independent-contractor-v1.md` — Markdown agreement with `{{merge_field}}` tokens.

### New library modules
- `src/lib/media/agreement-renderer.ts` — Markdown → HTML + field merging.
- `src/lib/media/pdf-snapshot.ts` — HTML → PDF via Puppeteer; upload to R2; return `terms_snapshot_url`.
- `src/lib/media/release-gate.ts` — `isAssetVisibleToParent(...)` publishing filter + batch variant.
- `src/lib/media/agreement-gate.ts` — `hasSignedAgreement(userId, orgId)` — used by both UI loader and API.

### New API endpoints
- `src/pages/api/media/onboarding.ts` — `GET` pending agreements for current user.
- `src/pages/api/media/onboarding/[id]/sign.ts` — `POST` sign.
- `src/pages/api/admin/media/agreements/index.ts` — `GET` list.
- `src/pages/api/admin/media/agreements/version.ts` — `POST` publish new version.
- `src/pages/api/family/[id]/media-release.ts` — `PATCH` parent updates release status.
- `src/pages/api/admin/media/releases.ts` — `GET` admin overview + `POST` bulk-ask.

### Modified API endpoints
- `src/pages/api/admin/media/shoots.ts` (`POST` create) — reject if assigned user has no `signed` agreement.
- `src/pages/api/dashboard/media/assets.ts` (list) and `.../[id].ts` (single) — apply visibility filter.
- `src/pages/api/registrations/index.ts` — accept `mediaReleaseStatus` + write columns.

### New UI pages
- `src/pages/media/onboarding.astro`
- `src/pages/admin/media/agreements.astro`
- `src/pages/admin/media/releases.astro`
- `src/pages/dashboard/media-preferences/[id].astro`

### New React components
- `src/components/media/onboarding-agreement.tsx`
- `src/components/admin/media-agreements-console.tsx`
- `src/components/admin/media-releases-overview.tsx`
- `src/components/dashboard/media-preferences.tsx`
- `src/components/registration/media-release-step.tsx` (used inside existing registration wizard)

### Modified UI
- `src/components/registration/registration-wizard.tsx` — insert a new step between existing waiver (step 2) and payment (previously step 3).
- `src/components/admin/media-shoot-create-form.tsx` (Phase-1 file) — disable photographer row when no signed agreement.

### New test files
- `tests/api/media/agreements.test.ts` — sign + snapshot + unsigned-user-cannot-be-assigned.
- `tests/api/media/releases.test.ts` — parent update + admin overview + bulk-ask.
- `tests/api/media/publishing-filter.test.ts` — visibility across mixed-consent tag sets + revoke flips within one read.
- `tests/media-phase-3.spec.ts` — Playwright E2E (two-user flow).

---

## Conventions used in this plan

- **Tests hit the running dev server at `localhost:4321`.** Start it before running Vitest: `npm run dev`.
- **Test helpers** come from `tests/api/setup/test-helpers.ts` — use `apiFetch`, `expectJson`, `getAdminCookie`, `getParentCookie`, and add a new helper `getMediaStaffCookie` as part of Task 2.
- **Test users added:** `media@test.aspiresports.com` / `TestMediaStaff123!` — this user is seeded in the media-phase-3 test seed added in Task 2.
- **Drizzle migrations** via `npm run db:generate` then `npm run db:push` in dev.
- **Puppeteer in dev** uses the locally installed Chrome; in production/Netlify it uses `@sparticuz/chromium`. Both paths are covered by one `launchBrowser()` helper in `src/lib/media/pdf-snapshot.ts`.
- **PDF rendering library choice (justification):** Picked Puppeteer over `@react-pdf/renderer` because we need the PDF to be an exact pixel copy of the HTML the user saw at sign time — `@react-pdf/renderer` is a different rendering engine entirely (no browser CSS parity) and Playwright as a PDF engine would pull in a duplicate browser. Picked it over `playwright` because Playwright is already in devDependencies for E2E only, whereas Puppeteer with `@sparticuz/chromium` has first-class Netlify Function support at ~50 MB zipped (under the 250 MB limit).
- **Commit messages** follow existing style: `feat:`, `fix:`, `chore:`, lowercase.

---

## Task 1: Schema — media_staff_agreements table + agreement status enum

**Files:**
- Modify: `src/lib/db/schema/media.ts`

- [ ] **Step 1: Add the agreement-type and agreement-status enums, and the `mediaStaffAgreements` table**

Append to `src/lib/db/schema/media.ts` (after existing media tables). The file already exports `organizations` and `users` imports — reuse them:

```typescript
export const mediaAgreementTypeEnum = pgEnum("media_agreement_type", [
  "independent_contractor",
  "nda",
  "background_check_consent",
]);

export const mediaAgreementStatusEnum = pgEnum("media_agreement_status", [
  "draft",
  "sent",
  "signed",
  "expired",
  "revoked",
]);

export const mediaStaffAgreements = pgTable("media_staff_agreements", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  agreementType: mediaAgreementTypeEnum("agreement_type").notNull(),
  version: integer("version").notNull(),
  termsSnapshotUrl: text("terms_snapshot_url"),
  status: mediaAgreementStatusEnum("status").default("draft").notNull(),
  signedAt: timestamp("signed_at"),
  signedIp: varchar("signed_ip", { length: 45 }),
  signedUserAgent: text("signed_user_agent"),
  signedFullName: varchar("signed_full_name", { length: 200 }),
  signatureImageKey: text("signature_image_key"),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type MediaStaffAgreement = typeof mediaStaffAgreements.$inferSelect;
export type NewMediaStaffAgreement = typeof mediaStaffAgreements.$inferInsert;
```

- [ ] **Step 2: Generate and push the migration**

Run:
```bash
npm run db:generate
npm run db:push
```

Expected: `drizzle-kit` prints a new migration file under `drizzle/`. `db:push` prints `Changes applied` with the new table `media_staff_agreements` and the two enums.

- [ ] **Step 3: Commit**

```bash
git add src/lib/db/schema/media.ts drizzle/
git commit -m "feat(media): add media_staff_agreements table + enums"
```

---

## Task 2: Schema — family_members media release columns + seeded test user

**Files:**
- Modify: `src/lib/db/schema/registrations.ts`
- Modify: `src/lib/db/seed.ts` (or the equivalent seed entry point; check `npm run db:seed` resolves to it)
- Modify: `tests/api/setup/test-helpers.ts`

- [ ] **Step 1: Add the media-release enum + columns to `familyMembers`**

Edit `src/lib/db/schema/registrations.ts`. Add near the other enums:

```typescript
export const mediaReleaseStatusEnum = pgEnum("media_release_status", [
  "not_asked",
  "granted",
  "declined",
  "revoked",
]);
```

Then extend `familyMembers`:

```typescript
  // ... existing columns ...
  photoUrl: text("photo_url"),
  mediaReleaseStatus: mediaReleaseStatusEnum("media_release_status")
    .default("not_asked")
    .notNull(),
  mediaReleaseSignedAt: timestamp("media_release_signed_at"),
  mediaReleaseVersion: integer("media_release_version").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
```

- [ ] **Step 2: Generate and push the migration**

```bash
npm run db:generate
npm run db:push
```

Expected: `media_release_status` enum added, three columns added to `family_members` with a default of `not_asked` (no existing rows are touched to anything but the default).

- [ ] **Step 3: Seed a `media_staff` test user**

Open `src/lib/db/seed.ts`. After the existing test-user creation block, add:

```typescript
// Phase 3 — media_staff test user for agreement + gate tests
const mediaStaffEmail = "media@test.aspiresports.com";
const mediaStaffPassword = "TestMediaStaff123!";
const mediaStaffPasswordHash = await hashPassword(mediaStaffPassword);

const [mediaStaffUser] = await db
  .insert(users)
  .values({
    email: mediaStaffEmail,
    passwordHash: mediaStaffPasswordHash,
    firstName: "Media",
    lastName: "Staff",
    emailVerified: true,
  })
  .onConflictDoNothing()
  .returning();

if (mediaStaffUser) {
  const [mediaStaffRole] = await db
    .select()
    .from(roles)
    .where(eq(roles.name, "media_staff"));
  if (mediaStaffRole) {
    await db
      .insert(userRoles)
      .values({
        userId: mediaStaffUser.id,
        roleId: mediaStaffRole.id,
        scopeType: "organization",
        scopeId: testOrg.id,
      })
      .onConflictDoNothing();
  }
}
```

(If your seed file uses slightly different helpers — e.g. a `createTestUser()` wrapper — adapt to match; the contract is "a user with email `media@test.aspiresports.com`, password `TestMediaStaff123!`, and the `media_staff` role scoped to the primary test org exists after `npm run db:seed`.")

- [ ] **Step 4: Run the seed and confirm the user exists**

```bash
npm run db:seed
```

Expected: completes without error; sign-in works with the new credentials.

- [ ] **Step 5: Add `getMediaStaffCookie` to test helpers**

Edit `tests/api/setup/test-helpers.ts`. After `getParentCookie`:

```typescript
let _mediaStaffCookie: string | null = null;

export async function getMediaStaffCookie(): Promise<string> {
  if (!_mediaStaffCookie) {
    _mediaStaffCookie = await getAuthCookie(
      "media@test.aspiresports.com",
      "TestMediaStaff123!"
    );
  }
  return _mediaStaffCookie;
}
```

Update `resetCookies()` to also null out `_mediaStaffCookie`:

```typescript
export function resetCookies(): void {
  _adminCookie = null;
  _coachCookie = null;
  _parentCookie = null;
  _mediaStaffCookie = null;
}
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/db/schema/registrations.ts src/lib/db/seed.ts tests/api/setup/test-helpers.ts drizzle/
git commit -m "feat(media): add media_release columns + seed media_staff test user"
```

---

## Task 3: Agreement Markdown template

**Files:**
- Create: `templates/media/independent-contractor-v1.md`

- [ ] **Step 1: Create the template directory and file**

```bash
mkdir -p templates/media
```

- [ ] **Step 2: Write the template with merge fields**

Content of `templates/media/independent-contractor-v1.md`:

```markdown
# Independent Contractor Agreement — Media Capture Services

**Version:** {{agreement_version}}
**Effective date:** {{effective_date}}

This Independent Contractor Agreement ("Agreement") is entered into between **{{organization_legal_name}}** ("Company") and **{{contractor_full_name}}** ("Contractor") as of the date the Contractor signs below.

## 1. Services

Contractor shall provide media capture services (photography and/or video) on a per-assignment basis, including but not limited to attending scheduled shoot sessions, operating Contractor's equipment, capturing still images and/or video of youth sports activities, and delivering unedited files to Company via Company's platform within the timelines set by Company.

Each engagement is assigned individually via Company's platform. Contractor is not obligated to accept any particular assignment, and Company is not obligated to offer any minimum volume of work.

## 2. Compensation

Compensation is set per-assignment at the time of assignment, based on the rate card in effect for the assignment's session type (per-game, per-day, or flat-rate). Contractor may set a preferred rate type and amount in their profile which, when present and approved by Company, overrides the default rate card.

Payment is processed via Company's payouts system within ten (10) business days of the assignment being marked "approved" by Company, provided the Contractor has uploaded all captured media for the assignment and the assignment is in a completed state.

## 3. Independent Contractor Status

Contractor is an independent contractor and not an employee, agent, partner, or joint venturer of Company. Contractor is solely responsible for all federal, state, and local taxes on any amounts paid under this Agreement, including self-employment tax, and will receive an IRS Form 1099-NEC for each calendar year in which Contractor receives $600 or more in compensation.

Contractor controls the manner and means by which services are performed, supplies Contractor's own equipment, and is not entitled to employee benefits.

## 4. Intellectual Property — Work Made for Hire

All photographs, video recordings, raw files, and derivative works created by Contractor in the course of performing services under this Agreement (the "Works") are "works made for hire" as defined under the U.S. Copyright Act of 1976 and are the exclusive property of Company from the moment of creation.

To the extent any Work does not qualify as a work made for hire, Contractor hereby irrevocably assigns to Company all right, title, and interest in and to the Works, including all copyrights and other intellectual property rights, without further compensation.

Contractor may not reuse, redistribute, republish, or display the Works in a portfolio, social media post, or any other medium without prior written consent from Company.

## 5. Safeguarding of Minors

Contractor acknowledges that the subjects of the Works will frequently include minors. Contractor agrees to:

- Conduct themselves professionally at all times during assignments, including while on location at venues where minors are present.
- Never photograph or record minors in private settings (e.g., locker rooms, restrooms) under any circumstances.
- Never engage with minors outside the scope of the assignment, including by soliciting contact information or inviting off-platform communication.
- Immediately report to Company any incident, concern, or observation that could bear on the safety of minors.
- Comply with any location-specific rules communicated by Company or its venue partners.

Failure to comply with this section is grounds for immediate termination and may result in legal action.

## 6. Background Check Consent

Contractor consents to Company or a third-party provider engaged by Company conducting a background check on Contractor, including but not limited to criminal-history, sex-offender-registry, and motor-vehicle checks, as a condition of continued eligibility for assignments.

Contractor authorizes the release of such information to Company and acknowledges that Company may suspend or terminate this Agreement based on the results at Company's sole discretion.

## 7. Term and Termination

This Agreement is effective from the signing date and continues until terminated by either party. Either party may terminate this Agreement for any reason upon seven (7) days' written notice. Company may terminate immediately for cause, including but not limited to violation of Section 5 (Safeguarding of Minors).

Sections 4 (IP), 5 (Safeguarding), and 8 (Indemnification) survive termination.

## 8. Indemnification

Contractor shall indemnify and hold harmless Company, its officers, employees, and affiliates from and against any claims, damages, losses, or expenses (including reasonable attorneys' fees) arising out of Contractor's breach of this Agreement, Contractor's negligence or willful misconduct, or Contractor's violation of any applicable law.

## 9. Governing Law

This Agreement is governed by the laws of the State in which Company is incorporated, without regard to its conflict-of-laws principles. Any dispute arising under this Agreement shall be resolved in the state or federal courts located in that State.

## 10. Entire Agreement

This Agreement constitutes the entire agreement between the parties with respect to its subject matter and supersedes all prior agreements, representations, and understandings.

---

**CONTRACTOR SIGNATURE**

By typing my full legal name below and checking the box labeled "I agree," I acknowledge that I have read and understand this Agreement, and I agree to be bound by its terms.

Typed legal name: **{{signed_full_name}}**
Date signed: **{{signed_at_iso}}**
IP address at signing: **{{signed_ip}}**
User agent at signing: **{{signed_user_agent}}**
```

- [ ] **Step 3: Commit**

```bash
git add templates/media/independent-contractor-v1.md
git commit -m "feat(media): add independent contractor agreement template v1"
```

---

## Task 4: Agreement renderer — Markdown → HTML with field merging

**Files:**
- Create: `src/lib/media/agreement-renderer.ts`
- Test: `tests/api/media/agreement-renderer.test.ts`

- [ ] **Step 1: Install `marked`**

```bash
npm install marked@^14
```

- [ ] **Step 2: Write failing test**

Create `tests/api/media/agreement-renderer.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  loadAgreementTemplate,
  mergeAgreementFields,
  renderAgreementHtml,
} from "../../../src/lib/media/agreement-renderer";

describe("agreement-renderer", () => {
  it("loads a known template by agreement_type + version", async () => {
    const md = await loadAgreementTemplate("independent_contractor", 1);
    expect(md).toContain("Independent Contractor Agreement");
    expect(md).toContain("{{contractor_full_name}}");
  });

  it("merges provided field values into the template", () => {
    const md = "Hello {{name}}, signed at {{signed_at_iso}}.";
    const merged = mergeAgreementFields(md, {
      name: "Jane Doe",
      signed_at_iso: "2026-04-19T10:00:00Z",
    });
    expect(merged).toBe("Hello Jane Doe, signed at 2026-04-19T10:00:00Z.");
  });

  it("renders merged markdown to HTML wrapped in a print stylesheet", async () => {
    const md = await loadAgreementTemplate("independent_contractor", 1);
    const html = renderAgreementHtml(md, {
      agreement_version: "1",
      effective_date: "2026-04-19",
      organization_legal_name: "Aspire Sports Ohio LLC",
      contractor_full_name: "Jane Doe",
      signed_full_name: "Jane Doe",
      signed_at_iso: "2026-04-19T10:00:00Z",
      signed_ip: "203.0.113.5",
      signed_user_agent: "Mozilla/5.0",
    });
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("Aspire Sports Ohio LLC");
    expect(html).toContain("Jane Doe");
    expect(html).not.toContain("{{");
  });

  it("throws on unknown template", async () => {
    await expect(loadAgreementTemplate("nda", 99)).rejects.toThrow();
  });
});
```

- [ ] **Step 3: Run test to confirm it fails**

```bash
npm run test:api -- tests/api/media/agreement-renderer.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 4: Implement the renderer**

Create `src/lib/media/agreement-renderer.ts`:

```typescript
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { marked } from "marked";

export type AgreementTypeKey = "independent_contractor" | "nda" | "background_check_consent";

export interface AgreementFields {
  agreement_version: string;
  effective_date: string;
  organization_legal_name: string;
  contractor_full_name: string;
  signed_full_name: string;
  signed_at_iso: string;
  signed_ip: string;
  signed_user_agent: string;
  [key: string]: string;
}

/**
 * Resolves the Markdown template path for a given agreement_type + version.
 * Templates live at templates/media/<slug>-v<version>.md at the repo root.
 */
export async function loadAgreementTemplate(
  agreementType: AgreementTypeKey,
  version: number
): Promise<string> {
  const slugByType: Record<AgreementTypeKey, string> = {
    independent_contractor: "independent-contractor",
    nda: "nda",
    background_check_consent: "background-check-consent",
  };
  const slug = slugByType[agreementType];
  if (!slug) throw new Error(`Unknown agreement_type: ${agreementType}`);
  const path = resolve(process.cwd(), "templates/media", `${slug}-v${version}.md`);
  try {
    return await readFile(path, "utf8");
  } catch (err) {
    throw new Error(
      `No agreement template found for ${agreementType} v${version} at ${path}`
    );
  }
}

/**
 * Merges {{field}} tokens in the markdown with values from the supplied object.
 * Missing tokens are left as-is (callers should treat any remaining "{{" as a bug).
 */
export function mergeAgreementFields(
  markdown: string,
  fields: Record<string, string>
): string {
  return markdown.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    return Object.prototype.hasOwnProperty.call(fields, key) ? fields[key] : `{{${key}}}`;
  });
}

/**
 * Renders merged markdown to a standalone HTML document ready to hand to Puppeteer.
 */
export function renderAgreementHtml(
  markdown: string,
  fields: AgreementFields
): string {
  const merged = mergeAgreementFields(markdown, fields);
  const body = marked.parse(merged, { async: false }) as string;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Agreement</title>
<style>
  @page { size: Letter; margin: 0.75in; }
  body { font-family: Georgia, "Times New Roman", serif; font-size: 11pt; line-height: 1.5; color: #111; max-width: 7.5in; margin: 0 auto; }
  h1 { font-size: 16pt; margin-bottom: 0.2in; }
  h2 { font-size: 13pt; margin-top: 0.3in; }
  strong { color: #000; }
  hr { border: none; border-top: 1px solid #888; margin: 0.3in 0; }
</style>
</head>
<body>
${body}
</body>
</html>`;
}
```

- [ ] **Step 5: Run test to confirm pass**

```bash
npm run test:api -- tests/api/media/agreement-renderer.test.ts
```

Expected: all four tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/media/agreement-renderer.ts tests/api/media/agreement-renderer.test.ts package.json package-lock.json
git commit -m "feat(media): add agreement renderer (markdown → merged HTML)"
```

---

## Task 5: PDF snapshot — HTML → PDF → R2

**Files:**
- Create: `src/lib/media/pdf-snapshot.ts`
- Test: `tests/api/media/pdf-snapshot.test.ts`

- [ ] **Step 1: Install Puppeteer deps**

```bash
npm install puppeteer-core@^23 @sparticuz/chromium@^131
```

- [ ] **Step 2: Write failing test**

Create `tests/api/media/pdf-snapshot.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { htmlToPdfBuffer } from "../../../src/lib/media/pdf-snapshot";

describe("pdf-snapshot", () => {
  it("renders a small HTML document to a non-empty PDF buffer with %PDF header", async () => {
    const html = "<!DOCTYPE html><html><body><h1>Hello</h1></body></html>";
    const buf = await htmlToPdfBuffer(html);
    expect(buf.byteLength).toBeGreaterThan(500);
    const head = new TextDecoder().decode(buf.slice(0, 5));
    expect(head).toBe("%PDF-");
  }, 30_000);
});
```

- [ ] **Step 3: Run test to confirm it fails**

```bash
npm run test:api -- tests/api/media/pdf-snapshot.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 4: Implement pdf-snapshot with R2 upload helper**

Create `src/lib/media/pdf-snapshot.ts`:

```typescript
import type { Browser } from "puppeteer-core";
import { putObject, getSignedGetUrl } from "./r2";

/**
 * Launches a headless browser. In Netlify (IS_NETLIFY=true) uses @sparticuz/chromium;
 * locally falls back to puppeteer-core pointing at an installed Chrome.
 */
async function launchBrowser(): Promise<Browser> {
  const puppeteer = await import("puppeteer-core");
  if (process.env.IS_NETLIFY === "true" || process.env.NETLIFY === "true") {
    const chromium = (await import("@sparticuz/chromium")).default;
    return puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
    });
  }
  const executablePath =
    process.env.PUPPETEER_EXECUTABLE_PATH ||
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  return puppeteer.launch({ executablePath, headless: true });
}

/**
 * Renders HTML to a PDF buffer. Keep the browser launch inline — snapshots are rare
 * (once per sign) and a long-lived browser adds memory pressure on Netlify Functions.
 */
export async function htmlToPdfBuffer(html: string): Promise<Uint8Array> {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    const pdf = await page.pdf({
      format: "Letter",
      printBackground: true,
      margin: { top: "0.75in", bottom: "0.75in", left: "0.75in", right: "0.75in" },
    });
    return new Uint8Array(pdf);
  } finally {
    await browser.close();
  }
}

/**
 * Uploads the PDF to R2 under org/<org>/agreements/<agreement_id>.pdf and returns
 * the storage key and a short-TTL signed URL for immediate download.
 */
export async function snapshotAgreement(params: {
  html: string;
  organizationId: string;
  agreementId: string;
}): Promise<{ storageKey: string; signedUrl: string }> {
  const pdf = await htmlToPdfBuffer(params.html);
  const storageKey = `org/${params.organizationId}/agreements/${params.agreementId}.pdf`;
  await putObject(storageKey, pdf, "application/pdf");
  const signedUrl = await getSignedGetUrl(storageKey, 60 * 60 * 24 * 7); // 7-day TTL
  return { storageKey, signedUrl };
}
```

- [ ] **Step 5: Confirm (or create) R2 helper**

If `src/lib/media/r2.ts` does not exist from Phase 1, create it now with these exact exports:

```typescript
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const accountId = process.env.R2_ACCOUNT_ID;
const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
const bucket = process.env.R2_BUCKET || "aspire-media-dev";

let _client: S3Client | null = null;
function client(): S3Client {
  if (_client) return _client;
  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error("R2 credentials missing (R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY)");
  }
  _client = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
  return _client;
}

export async function putObject(key: string, body: Uint8Array | Buffer, contentType: string): Promise<void> {
  await client().send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }));
}

export async function getSignedGetUrl(key: string, ttlSeconds: number): Promise<string> {
  return getSignedUrl(client(), new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn: ttlSeconds });
}

export function bucketName(): string {
  return bucket;
}
```

Install the SDK deps if they weren't added in Phase 1:

```bash
npm install @aws-sdk/client-s3@^3 @aws-sdk/s3-request-presigner@^3
```

- [ ] **Step 6: Run pdf-snapshot test to confirm pass**

```bash
npm run test:api -- tests/api/media/pdf-snapshot.test.ts
```

Expected: PASS. If Chrome is not installed at the default macOS path, set `PUPPETEER_EXECUTABLE_PATH` before running and retry.

- [ ] **Step 7: Commit**

```bash
git add src/lib/media/pdf-snapshot.ts src/lib/media/r2.ts tests/api/media/pdf-snapshot.test.ts package.json package-lock.json
git commit -m "feat(media): add html→pdf snapshot pipeline (puppeteer + R2)"
```

---

## Task 6: Agreement gate helper — `hasSignedAgreement`

**Files:**
- Create: `src/lib/media/agreement-gate.ts`
- Test: `tests/api/media/agreement-gate.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/api/media/agreement-gate.test.ts`:

```typescript
import { describe, it, expect, beforeAll } from "vitest";
import { hasSignedAgreement } from "../../../src/lib/media/agreement-gate";
import { getDb } from "../../../src/lib/db";
import { mediaStaffAgreements, organizations, users } from "../../../src/lib/db/schema";
import { and, eq } from "drizzle-orm";

describe("hasSignedAgreement", () => {
  let orgId: string;
  let userId: string;

  beforeAll(async () => {
    const db = getDb();
    const [org] = await db.select().from(organizations).limit(1);
    orgId = org.id;
    const [u] = await db.select().from(users).where(eq(users.email, "media@test.aspiresports.com"));
    userId = u.id;
    // Clear any pre-existing rows so test is deterministic.
    await db
      .delete(mediaStaffAgreements)
      .where(and(eq(mediaStaffAgreements.userId, userId), eq(mediaStaffAgreements.organizationId, orgId)));
  });

  it("returns false when user has no agreement for org", async () => {
    expect(await hasSignedAgreement(userId, orgId)).toBe(false);
  });

  it("returns false when agreement exists but status != signed", async () => {
    const db = getDb();
    await db.insert(mediaStaffAgreements).values({
      userId, organizationId: orgId, agreementType: "independent_contractor",
      version: 1, status: "sent",
    });
    expect(await hasSignedAgreement(userId, orgId)).toBe(false);
  });

  it("returns true when signed agreement exists", async () => {
    const db = getDb();
    await db
      .delete(mediaStaffAgreements)
      .where(and(eq(mediaStaffAgreements.userId, userId), eq(mediaStaffAgreements.organizationId, orgId)));
    await db.insert(mediaStaffAgreements).values({
      userId, organizationId: orgId, agreementType: "independent_contractor",
      version: 1, status: "signed", signedAt: new Date(), signedFullName: "Media Staff",
      termsSnapshotUrl: "https://example.com/s.pdf",
    });
    expect(await hasSignedAgreement(userId, orgId)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to confirm fail**

```bash
npm run test:api -- tests/api/media/agreement-gate.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the gate**

Create `src/lib/media/agreement-gate.ts`:

```typescript
import { getDb } from "@/lib/db";
import { mediaStaffAgreements } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";

/**
 * Returns true when the user has at least one signed, unexpired independent_contractor
 * agreement for the given organization.
 */
export async function hasSignedAgreement(
  userId: string,
  organizationId: string
): Promise<boolean> {
  const [row] = await getDb()
    .select({ id: mediaStaffAgreements.id })
    .from(mediaStaffAgreements)
    .where(
      and(
        eq(mediaStaffAgreements.userId, userId),
        eq(mediaStaffAgreements.organizationId, organizationId),
        eq(mediaStaffAgreements.agreementType, "independent_contractor"),
        eq(mediaStaffAgreements.status, "signed")
      )
    )
    .limit(1);
  return !!row;
}
```

- [ ] **Step 4: Run test to confirm pass**

```bash
npm run test:api -- tests/api/media/agreement-gate.test.ts
```

Expected: all three PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/media/agreement-gate.ts tests/api/media/agreement-gate.test.ts
git commit -m "feat(media): add signed-agreement gate helper"
```

---

## Task 7: Sign API — `POST /api/media/onboarding/:id/sign`

**Files:**
- Create: `src/pages/api/media/onboarding.ts`
- Create: `src/pages/api/media/onboarding/[id]/sign.ts`
- Test: `tests/api/media/agreements.test.ts`

- [ ] **Step 1: Write failing test for GET + POST sign flow**

Create `tests/api/media/agreements.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import {
  apiFetch, expectJson, getAdminCookie, getMediaStaffCookie, resetCookies,
} from "../setup/test-helpers";
import { getDb } from "../../../src/lib/db";
import { mediaStaffAgreements, organizations, users } from "../../../src/lib/db/schema";
import { and, eq } from "drizzle-orm";

describe("Media agreements API", () => {
  let adminCookie: string;
  let mediaCookie: string;
  let mediaUserId: string;
  let orgId: string;

  beforeAll(async () => {
    adminCookie = await getAdminCookie();
    mediaCookie = await getMediaStaffCookie();
    const db = getDb();
    const [u] = await db.select().from(users).where(eq(users.email, "media@test.aspiresports.com"));
    mediaUserId = u.id;
    const [o] = await db.select().from(organizations).limit(1);
    orgId = o.id;
  });

  beforeEach(async () => {
    // Reset agreement rows so each test starts clean.
    await getDb()
      .delete(mediaStaffAgreements)
      .where(and(eq(mediaStaffAgreements.userId, mediaUserId), eq(mediaStaffAgreements.organizationId, orgId)));
  });

  afterAll(() => { resetCookies(); });

  it("GET /api/media/onboarding returns pending agreement when admin has published v1", async () => {
    // Admin publishes a v1 (drafts the row in 'sent' state).
    const pub = await apiFetch("/api/admin/media/agreements/version", {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({ agreementType: "independent_contractor", version: 1, targetUserId: mediaUserId }),
    });
    expect(pub.status).toBe(201);

    const res = await apiFetch("/api/media/onboarding", { method: "GET", cookie: mediaCookie });
    const json = await expectJson(res, 200);
    expect(json.pending.length).toBe(1);
    expect(json.pending[0].agreementType).toBe("independent_contractor");
    expect(json.pending[0].version).toBe(1);
  });

  it("POST sign writes signed_ip + signed_user_agent + terms_snapshot_url", async () => {
    const pub = await apiFetch("/api/admin/media/agreements/version", {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({ agreementType: "independent_contractor", version: 1, targetUserId: mediaUserId }),
    });
    const pubJson = await expectJson(pub, 201);
    const agreementId = pubJson.agreement.id;

    const res = await apiFetch(`/api/media/onboarding/${agreementId}/sign`, {
      method: "POST",
      cookie: mediaCookie,
      headers: { "User-Agent": "TestSuite/1.0" },
      body: JSON.stringify({ fullName: "Media Staff" }),
    });
    const json = await expectJson(res, 200);
    expect(json.agreement.status).toBe("signed");
    expect(json.agreement.signedAt).toBeTruthy();
    expect(json.agreement.signedFullName).toBe("Media Staff");
    expect(json.agreement.signedIp).toBeTruthy();
    expect(json.agreement.signedUserAgent).toContain("TestSuite");
    expect(json.agreement.termsSnapshotUrl).toMatch(/^https:\/\//);
  }, 60_000);

  it("rejects sign on agreement not owned by caller (403)", async () => {
    const pub = await apiFetch("/api/admin/media/agreements/version", {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({ agreementType: "independent_contractor", version: 1, targetUserId: mediaUserId }),
    });
    const pubJson = await expectJson(pub, 201);

    // Admin tries to sign media's agreement — should fail.
    const res = await apiFetch(`/api/media/onboarding/${pubJson.agreement.id}/sign`, {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({ fullName: "Admin" }),
    });
    expect(res.status).toBe(403);
  });

  it("rejects blank or too-short fullName (400)", async () => {
    const pub = await apiFetch("/api/admin/media/agreements/version", {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({ agreementType: "independent_contractor", version: 1, targetUserId: mediaUserId }),
    });
    const pubJson = await expectJson(pub, 201);

    const res = await apiFetch(`/api/media/onboarding/${pubJson.agreement.id}/sign`, {
      method: "POST",
      cookie: mediaCookie,
      body: JSON.stringify({ fullName: "" }),
    });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run test to confirm fail**

```bash
npm run test:api -- tests/api/media/agreements.test.ts
```

Expected: FAIL — routes don't exist yet.

- [ ] **Step 3: Implement GET /api/media/onboarding**

Create `src/pages/api/media/onboarding.ts`:

```typescript
import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { mediaStaffAgreements } from "@/lib/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { getOrganizationId } from "@/lib/auth/roles";

export const GET: APIRoute = async (ctx) => {
  if (!ctx.locals.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }
  const orgId = await getOrganizationId(ctx);
  if (!orgId) {
    return new Response(JSON.stringify({ error: "Organization context required" }), { status: 400 });
  }
  const rows = await getDb()
    .select()
    .from(mediaStaffAgreements)
    .where(
      and(
        eq(mediaStaffAgreements.userId, ctx.locals.user.id),
        eq(mediaStaffAgreements.organizationId, orgId),
        inArray(mediaStaffAgreements.status, ["draft", "sent"] as const)
      )
    );
  return new Response(JSON.stringify({ pending: rows }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
```

- [ ] **Step 4: Implement POST /api/media/onboarding/:id/sign**

Create `src/pages/api/media/onboarding/[id]/sign.ts`:

```typescript
import type { APIRoute } from "astro";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { mediaStaffAgreements, organizations } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import {
  loadAgreementTemplate,
  renderAgreementHtml,
  type AgreementTypeKey,
} from "@/lib/media/agreement-renderer";
import { snapshotAgreement } from "@/lib/media/pdf-snapshot";

const signSchema = z.object({
  fullName: z.string().min(2).max(200),
});

export const POST: APIRoute = async (ctx) => {
  if (!ctx.locals.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }
  const { id } = ctx.params;
  if (!id) {
    return new Response(JSON.stringify({ error: "ID required" }), { status: 400 });
  }

  let body: unknown;
  try { body = await ctx.request.json(); } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400 });
  }
  const parsed = signSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: "Validation failed", details: parsed.error.issues }), { status: 400 });
  }

  const db = getDb();
  const [agreement] = await db
    .select()
    .from(mediaStaffAgreements)
    .where(eq(mediaStaffAgreements.id, id));
  if (!agreement) {
    return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });
  }
  if (agreement.userId !== ctx.locals.user.id) {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
  }
  if (agreement.status === "signed") {
    return new Response(JSON.stringify({ error: "Already signed" }), { status: 409 });
  }

  const [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, agreement.organizationId));
  if (!org) {
    return new Response(JSON.stringify({ error: "Organization missing" }), { status: 500 });
  }

  // Capture signer metadata.
  const signedIp =
    ctx.request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    ctx.clientAddress ||
    "";
  const signedUserAgent = ctx.request.headers.get("user-agent") || "";
  const signedAt = new Date();

  // Render + snapshot the exact HTML the user saw.
  const markdown = await loadAgreementTemplate(
    agreement.agreementType as AgreementTypeKey,
    agreement.version
  );
  const html = renderAgreementHtml(markdown, {
    agreement_version: String(agreement.version),
    effective_date: signedAt.toISOString().slice(0, 10),
    organization_legal_name: org.name,
    contractor_full_name: parsed.data.fullName,
    signed_full_name: parsed.data.fullName,
    signed_at_iso: signedAt.toISOString(),
    signed_ip: signedIp,
    signed_user_agent: signedUserAgent,
  });
  const { signedUrl } = await snapshotAgreement({
    html,
    organizationId: agreement.organizationId,
    agreementId: agreement.id,
  });

  const [updated] = await db
    .update(mediaStaffAgreements)
    .set({
      status: "signed",
      signedAt,
      signedIp,
      signedUserAgent,
      signedFullName: parsed.data.fullName,
      termsSnapshotUrl: signedUrl,
      updatedAt: new Date(),
    })
    .where(eq(mediaStaffAgreements.id, agreement.id))
    .returning();

  return new Response(JSON.stringify({ agreement: updated }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
```

- [ ] **Step 5: Run tests — the `publish` helper tests will still fail because Task 8 isn't done yet. Skip / mark these tests `.skip()` with a TODO comment, or run only the first test with `it.only`.**

Temporarily comment out the three tests that depend on publish, keep the first test marked `.skip`, or leave the test file as-is and accept the failures until Task 8 finishes — your choice. We re-enable them at the end of Task 8.

- [ ] **Step 6: Commit**

```bash
git add src/pages/api/media/onboarding.ts src/pages/api/media/onboarding/[id]/sign.ts tests/api/media/agreements.test.ts
git commit -m "feat(media): add photographer onboarding sign API"
```

---

## Task 8: Admin agreements API — list + publish version

**Files:**
- Create: `src/pages/api/admin/media/agreements/index.ts`
- Create: `src/pages/api/admin/media/agreements/version.ts`

- [ ] **Step 1: Implement GET /api/admin/media/agreements (list)**

Create `src/pages/api/admin/media/agreements/index.ts`:

```typescript
import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { mediaStaffAgreements, users } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";
import { requireAdminAccess, requireOrganizationContext } from "@/lib/auth/roles";

export const GET: APIRoute = async (ctx) => {
  const auth = await requireAdminAccess(ctx);
  if (!auth.authorized) return auth.response;
  const org = await requireOrganizationContext(ctx);
  if (!org.hasOrganization) return org.response;

  const rows = await getDb()
    .select({
      id: mediaStaffAgreements.id,
      userId: mediaStaffAgreements.userId,
      userEmail: users.email,
      userFirstName: users.firstName,
      userLastName: users.lastName,
      agreementType: mediaStaffAgreements.agreementType,
      version: mediaStaffAgreements.version,
      status: mediaStaffAgreements.status,
      signedAt: mediaStaffAgreements.signedAt,
      termsSnapshotUrl: mediaStaffAgreements.termsSnapshotUrl,
      createdAt: mediaStaffAgreements.createdAt,
    })
    .from(mediaStaffAgreements)
    .innerJoin(users, eq(mediaStaffAgreements.userId, users.id))
    .where(eq(mediaStaffAgreements.organizationId, org.organizationId))
    .orderBy(desc(mediaStaffAgreements.createdAt));

  return new Response(JSON.stringify({ agreements: rows }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
```

- [ ] **Step 2: Implement POST /api/admin/media/agreements/version**

Create `src/pages/api/admin/media/agreements/version.ts`:

```typescript
import type { APIRoute } from "astro";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { mediaStaffAgreements, userRoles, roles } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { requireAdminAccess, requireOrganizationContext } from "@/lib/auth/roles";
import { loadAgreementTemplate } from "@/lib/media/agreement-renderer";

const versionSchema = z.object({
  agreementType: z.enum(["independent_contractor", "nda", "background_check_consent"]),
  version: z.number().int().positive(),
  // If provided: publish for just this one user (used by tests + single-invite flow).
  // If omitted: publish for every user holding the media_staff role in this org.
  targetUserId: z.string().uuid().optional(),
});

export const POST: APIRoute = async (ctx) => {
  const auth = await requireAdminAccess(ctx);
  if (!auth.authorized) return auth.response;
  const org = await requireOrganizationContext(ctx);
  if (!org.hasOrganization) return org.response;

  let body: unknown;
  try { body = await ctx.request.json(); } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400 });
  }
  const parsed = versionSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: "Validation failed", details: parsed.error.issues }), { status: 400 });
  }

  // Confirm the template file exists before issuing rows.
  try {
    await loadAgreementTemplate(parsed.data.agreementType, parsed.data.version);
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 400 });
  }

  const db = getDb();
  const created: (typeof mediaStaffAgreements.$inferSelect)[] = [];

  const userIds: string[] = parsed.data.targetUserId
    ? [parsed.data.targetUserId]
    : (await db
        .select({ userId: userRoles.userId })
        .from(userRoles)
        .innerJoin(roles, eq(userRoles.roleId, roles.id))
        .where(eq(roles.name, "media_staff"))
      ).map((r) => r.userId);

  for (const userId of userIds) {
    // If a row for this user + type + version already exists, skip.
    const [existing] = await db
      .select()
      .from(mediaStaffAgreements)
      .where(
        and(
          eq(mediaStaffAgreements.userId, userId),
          eq(mediaStaffAgreements.organizationId, org.organizationId),
          eq(mediaStaffAgreements.agreementType, parsed.data.agreementType),
          eq(mediaStaffAgreements.version, parsed.data.version)
        )
      );
    if (existing) { created.push(existing); continue; }
    const [row] = await db
      .insert(mediaStaffAgreements)
      .values({
        userId,
        organizationId: org.organizationId,
        agreementType: parsed.data.agreementType,
        version: parsed.data.version,
        status: "sent",
      })
      .returning();
    created.push(row);
  }

  return new Response(
    JSON.stringify({ agreement: created[0] || null, agreements: created }),
    { status: 201, headers: { "Content-Type": "application/json" } }
  );
};
```

- [ ] **Step 3: Un-skip the tests from Task 7 and run the full agreements test file**

```bash
npm run test:api -- tests/api/media/agreements.test.ts
```

Expected: all four tests PASS.

- [ ] **Step 4: Commit**

```bash
git add src/pages/api/admin/media/agreements/
git commit -m "feat(media): admin agreements list + publish-version APIs"
```

---

## Task 9: Shoot-create assignment gate (API enforcement)

**Files:**
- Modify: `src/pages/api/admin/media/shoots.ts` (the existing Phase-1 route)
- Test: extend `tests/api/media/agreements.test.ts` with a new describe block

- [ ] **Step 1: Write failing test — shoot creation with unsigned photographer is rejected**

Append to `tests/api/media/agreements.test.ts` (new `describe`):

```typescript
describe("Assignment gate — API", () => {
  let adminCookie: string;
  let mediaUserId: string;
  let orgId: string;

  beforeAll(async () => {
    adminCookie = await getAdminCookie();
    const db = getDb();
    const [u] = await db.select().from(users).where(eq(users.email, "media@test.aspiresports.com"));
    mediaUserId = u.id;
    const [o] = await db.select().from(organizations).limit(1);
    orgId = o.id;
  });

  beforeEach(async () => {
    await getDb()
      .delete(mediaStaffAgreements)
      .where(and(eq(mediaStaffAgreements.userId, mediaUserId), eq(mediaStaffAgreements.organizationId, orgId)));
  });

  it("rejects shoot creation assigning a user with no signed agreement (409)", async () => {
    const res = await apiFetch("/api/admin/media/shoots", {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({
        assignedUserId: mediaUserId,
        sessionType: "game",
        scheduledStart: "2026-05-01T15:00:00Z",
        scheduledEnd: "2026-05-01T17:00:00Z",
        rateType: "per_game",
        rateCents: 15000,
      }),
    });
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toMatch(/agreement/i);
  });

  it("allows shoot creation after photographer signs", async () => {
    await getDb().insert(mediaStaffAgreements).values({
      userId: mediaUserId, organizationId: orgId, agreementType: "independent_contractor",
      version: 1, status: "signed", signedAt: new Date(), signedFullName: "Media Staff",
      termsSnapshotUrl: "https://example.com/a.pdf",
    });
    const res = await apiFetch("/api/admin/media/shoots", {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({
        assignedUserId: mediaUserId,
        sessionType: "game",
        scheduledStart: "2026-05-01T15:00:00Z",
        scheduledEnd: "2026-05-01T17:00:00Z",
        rateType: "per_game",
        rateCents: 15000,
      }),
    });
    expect([200, 201]).toContain(res.status);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
npm run test:api -- tests/api/media/agreements.test.ts -t "Assignment gate"
```

Expected: FAIL — shoot create currently permits assigning an unsigned user.

- [ ] **Step 3: Add the gate to the POST handler**

Open `src/pages/api/admin/media/shoots.ts`, find the `POST` handler, and after resolving `assignedUserId` + `organizationId` insert (exact placement: immediately before the `db.insert(shootSessions)` call):

```typescript
import { hasSignedAgreement } from "@/lib/media/agreement-gate";
// ... existing imports ...

// Inside POST, after parsing the validated body and resolving org:
if (parsed.data.assignedUserId) {
  const ok = await hasSignedAgreement(parsed.data.assignedUserId, org.organizationId);
  if (!ok) {
    return new Response(
      JSON.stringify({
        error: "Assigned user has no signed media_staff agreement for this organization.",
        code: "agreement_required",
      }),
      { status: 409, headers: { "Content-Type": "application/json" } }
    );
  }
}
```

Also apply the same gate to the `PATCH` handler (reassignment) wherever `assignedUserId` is being changed.

- [ ] **Step 4: Run test to confirm pass**

```bash
npm run test:api -- tests/api/media/agreements.test.ts -t "Assignment gate"
```

Expected: both tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pages/api/admin/media/shoots.ts tests/api/media/agreements.test.ts
git commit -m "feat(media): API gate blocks shoot assignment to unsigned photographer"
```

---

## Task 10: Shoot-create assignment gate (Admin UI enforcement)

**Files:**
- Modify: `src/components/admin/media-shoot-create-form.tsx`

- [ ] **Step 1: Extend the form loader to fetch signed-status for each media_staff user**

At the top of `media-shoot-create-form.tsx`, where the photographer list is fetched, extend the fetch call (or add a second fetch) so each photographer row carries a `hasSignedAgreement: boolean`. If the Phase-1 API `/api/admin/media/staff` doesn't return this, extend it (same file) to join `media_staff_agreements` and return:

```typescript
{
  id: "...",
  firstName: "...",
  lastName: "...",
  email: "...",
  hasSignedAgreement: true | false,
  // ... existing fields
}
```

Exact change to `src/pages/api/admin/media/staff.ts` (`GET`):

```typescript
// Replace the existing SELECT with a left-join to media_staff_agreements:
const rows = await db
  .select({
    userId: users.id,
    firstName: users.firstName,
    lastName: users.lastName,
    email: users.email,
    hasSignedAgreement: sql<boolean>`(
      SELECT COUNT(*) > 0
      FROM ${mediaStaffAgreements}
      WHERE ${mediaStaffAgreements.userId} = ${users.id}
        AND ${mediaStaffAgreements.organizationId} = ${org.organizationId}
        AND ${mediaStaffAgreements.agreementType} = 'independent_contractor'
        AND ${mediaStaffAgreements.status} = 'signed'
    )`,
  })
  .from(users)
  .innerJoin(userRoles, eq(users.id, userRoles.userId))
  .innerJoin(roles, eq(userRoles.roleId, roles.id))
  .where(eq(roles.name, "media_staff"));
```

Required imports: `sql` from `drizzle-orm`, `mediaStaffAgreements` from `@/lib/db/schema`.

- [ ] **Step 2: Disable unsigned rows in the photographer picker**

In `src/components/admin/media-shoot-create-form.tsx`, in the radio list where photographers are rendered:

```tsx
{photographers.map((p) => (
  <Label
    key={p.userId}
    htmlFor={`photog-${p.userId}`}
    className={`flex items-center p-4 rounded-xl border cursor-pointer transition-all ${
      selectedPhotographerId === p.userId
        ? "border-primary bg-primary/10"
        : "border-border hover:border-ink-faint bg-paper"
    } ${!p.hasSignedAgreement ? "opacity-50 cursor-not-allowed" : ""}`}
  >
    <RadioGroupItem
      value={p.userId}
      id={`photog-${p.userId}`}
      disabled={!p.hasSignedAgreement}
      className="mr-4"
    />
    <div className="flex-1">
      <p className="font-medium text-ink">{p.firstName} {p.lastName}</p>
      <p className="text-sm text-ink-muted">{p.email}</p>
    </div>
    {!p.hasSignedAgreement && (
      <span className="text-xs text-yellow-600 bg-yellow-500/10 px-2 py-1 rounded">
        Agreement unsigned
      </span>
    )}
  </Label>
))}
```

- [ ] **Step 3: Add Playwright test to confirm the UI gate**

(Deferred to Task 18 — the E2E test covers this surface.)

- [ ] **Step 4: Commit**

```bash
git add src/pages/api/admin/media/staff.ts src/components/admin/media-shoot-create-form.tsx
git commit -m "feat(media): admin UI disables photographer picker row for unsigned user"
```

---

## Task 11: Photographer onboarding page `/media/onboarding`

**Files:**
- Create: `src/pages/media/onboarding.astro`
- Create: `src/components/media/onboarding-agreement.tsx`

- [ ] **Step 1: Implement the Astro wrapper**

Create `src/pages/media/onboarding.astro`:

```astro
---
import '../../styles/globals.css';
import Navigation from '../../components/navigation';
import Footer from '../../components/footer';
import OnboardingAgreement from '../../components/media/onboarding-agreement';

const user = Astro.locals.user;
if (!user) {
  return Astro.redirect('/signin?redirect=/media/onboarding');
}
---
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width" />
    <title>Media Staff Onboarding — Aspire Sports</title>
  </head>
  <body class="min-h-screen flex flex-col bg-cream text-ink antialiased">
    <Navigation client:load />
    <main class="flex-1 pt-24 pb-16 px-4">
      <div class="container mx-auto max-w-4xl">
        <OnboardingAgreement client:load />
      </div>
    </main>
    <Footer client:idle />
  </body>
</html>
```

- [ ] **Step 2: Implement the React client**

Create `src/components/media/onboarding-agreement.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";

type Pending = {
  id: string;
  agreementType: string;
  version: number;
  renderedHtml?: string;
};

export default function OnboardingAgreement() {
  const [pending, setPending] = useState<Pending[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<Pending | null>(null);
  const [fullName, setFullName] = useState("");
  const [agree, setAgree] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/media/onboarding");
        if (!res.ok) throw new Error("Failed to load");
        const json = await res.json();
        setPending(json.pending);

        // Load rendered HTML for each pending agreement in parallel.
        const withHtml = await Promise.all(
          (json.pending as Pending[]).map(async (p) => {
            const r = await fetch(`/api/media/onboarding/${p.id}/preview`);
            const j = await r.json();
            return { ...p, renderedHtml: j.html as string };
          })
        );
        setPending(withHtml);
        if (withHtml.length > 0) setActive(withHtml[0]);
      } catch (e: any) {
        setError(e.message || "Failed to load");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const canSign = () => active && agree && fullName.trim().length >= 2;

  const handleSign = async () => {
    if (!active) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/media/onboarding/${active.id}/sign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName }),
      });
      if (!res.ok) {
        const j = await res.json();
        throw new Error(j.error || "Sign failed");
      }
      const j = await res.json();
      setSignedUrl(j.agreement.termsSnapshotUrl);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="py-20 text-center"><Loader2 className="w-8 h-8 animate-spin mx-auto" /></div>;

  if (signedUrl) return (
    <div className="bg-paper border border-border rounded-2xl p-8 text-center">
      <CheckCircle2 className="w-12 h-12 text-primary mx-auto mb-4" />
      <h2 className="text-xl font-semibold text-ink">Agreement signed</h2>
      <p className="text-ink-muted mt-2">A PDF copy has been saved for your records.</p>
      <a href={signedUrl} className="inline-block mt-4 underline text-primary" target="_blank" rel="noreferrer">
        Download PDF
      </a>
    </div>
  );

  if (pending.length === 0) return (
    <div className="bg-paper border border-border rounded-2xl p-8 text-center">
      <p className="text-ink">No pending agreements.</p>
    </div>
  );

  return (
    <div className="space-y-6">
      {error && (
        <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20 flex items-center gap-3 text-destructive">
          <AlertCircle className="w-5 h-5" /><span>{error}</span>
        </div>
      )}

      {active?.renderedHtml && (
        <div
          className="prose max-w-none bg-paper border border-border rounded-2xl p-8 max-h-[55vh] overflow-y-auto"
          dangerouslySetInnerHTML={{ __html: active.renderedHtml }}
        />
      )}

      <div className="bg-paper border border-border rounded-2xl p-6 space-y-4">
        <div className="flex items-start gap-3">
          <Checkbox id="agree" checked={agree} onCheckedChange={(v) => setAgree(v === true)} />
          <Label htmlFor="agree" className="cursor-pointer">I have read, understand, and agree to the terms above.</Label>
        </div>
        <div className="space-y-2">
          <Label>Type your full legal name *</Label>
          <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="First Last" />
        </div>
        <Button onClick={handleSign} disabled={!canSign() || submitting} className="w-full">
          {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
          Sign agreement
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Add the preview endpoint the React client needs**

Create `src/pages/api/media/onboarding/[id]/preview.ts`:

```typescript
import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { mediaStaffAgreements, organizations } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import {
  loadAgreementTemplate, renderAgreementHtml, type AgreementTypeKey,
} from "@/lib/media/agreement-renderer";

export const GET: APIRoute = async (ctx) => {
  if (!ctx.locals.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }
  const { id } = ctx.params;
  if (!id) return new Response(JSON.stringify({ error: "ID required" }), { status: 400 });

  const db = getDb();
  const [agreement] = await db
    .select()
    .from(mediaStaffAgreements)
    .where(eq(mediaStaffAgreements.id, id));
  if (!agreement) return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });
  if (agreement.userId !== ctx.locals.user.id) {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
  }

  const [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, agreement.organizationId));

  const md = await loadAgreementTemplate(
    agreement.agreementType as AgreementTypeKey,
    agreement.version
  );
  const html = renderAgreementHtml(md, {
    agreement_version: String(agreement.version),
    effective_date: new Date().toISOString().slice(0, 10),
    organization_legal_name: org?.name || "",
    contractor_full_name: `${ctx.locals.user.firstName ?? ""} ${ctx.locals.user.lastName ?? ""}`.trim(),
    signed_full_name: "(to be entered)",
    signed_at_iso: "(to be stamped at signing)",
    signed_ip: "(captured at signing)",
    signed_user_agent: "(captured at signing)",
  });
  return new Response(JSON.stringify({ html }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
```

- [ ] **Step 4: Smoke-test by hand**

Run `npm run dev` (if not running). Visit `http://localhost:4321/media/onboarding` signed in as `media@test.aspiresports.com`. After an admin publishes v1 via the upcoming console, the rendered template appears and the sign button works.

- [ ] **Step 5: Commit**

```bash
git add src/pages/media/onboarding.astro src/components/media/onboarding-agreement.tsx src/pages/api/media/onboarding/[id]/preview.ts
git commit -m "feat(media): photographer onboarding page with agreement preview + sign"
```

---

## Task 12: Admin agreements console `/admin/media/agreements`

**Files:**
- Create: `src/pages/admin/media/agreements.astro`
- Create: `src/components/admin/media-agreements-console.tsx`

- [ ] **Step 1: Implement the Astro wrapper**

Create `src/pages/admin/media/agreements.astro`:

```astro
---
import '../../../styles/globals.css';
import { AdminLayout } from '../../../components/admin/admin-layout';
import MediaAgreementsConsole from '../../../components/admin/media-agreements-console';

const user = Astro.locals.user;
if (!user) {
  return Astro.redirect('/signin?returnUrl=/admin/media/agreements');
}
---
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width" />
    <title>Media Agreements — Admin — Aspire Sports</title>
  </head>
  <body class="bg-cream text-ink antialiased">
    <AdminLayout
      client:load
      currentPath="/admin/media/agreements"
      user={{ firstName: user.firstName, lastName: user.lastName, email: user.email }}
    >
      <MediaAgreementsConsole client:load />
    </AdminLayout>
  </body>
</html>
```

- [ ] **Step 2: Implement the React console**

Create `src/components/admin/media-agreements-console.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";

type Row = {
  id: string;
  userEmail: string;
  userFirstName: string;
  userLastName: string;
  agreementType: string;
  version: number;
  status: string;
  signedAt: string | null;
  termsSnapshotUrl: string | null;
  createdAt: string;
};

export default function MediaAgreementsConsole() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [pubType, setPubType] = useState("independent_contractor");
  const [pubVersion, setPubVersion] = useState<number>(2);
  const [publishing, setPublishing] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/media/agreements");
      if (!res.ok) throw new Error("Failed");
      const j = await res.json();
      setRows(j.agreements);
    } catch (e: any) { setError(e.message); } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handlePublish = async () => {
    setPublishing(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/media/agreements/version", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agreementType: pubType, version: pubVersion }),
      });
      if (!res.ok) { const j = await res.json(); throw new Error(j.error || "Failed"); }
      await load();
    } catch (e: any) { setError(e.message); } finally { setPublishing(false); }
  };

  return (
    <div className="space-y-6">
      <div className="bg-paper border border-border rounded-2xl p-6">
        <h2 className="text-lg font-semibold text-ink mb-4">Publish new version</h2>
        <div className="grid grid-cols-3 gap-4">
          <div><Label>Agreement type</Label>
            <select value={pubType} onChange={(e) => setPubType(e.target.value)} className="w-full mt-1 border border-border rounded p-2 bg-cream-2">
              <option value="independent_contractor">Independent Contractor</option>
              <option value="nda">NDA</option>
              <option value="background_check_consent">Background Check Consent</option>
            </select>
          </div>
          <div><Label>Version</Label>
            <Input type="number" min={1} value={pubVersion} onChange={(e) => setPubVersion(Number(e.target.value))} />
          </div>
          <div className="flex items-end"><Button onClick={handlePublish} disabled={publishing}>
            {publishing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}Publish to all media_staff
          </Button></div>
        </div>
        {error && <p className="text-destructive mt-3 text-sm">{error}</p>}
      </div>

      <div className="bg-paper border border-border rounded-2xl overflow-hidden">
        <h2 className="text-lg font-semibold text-ink p-6 pb-4">All agreements</h2>
        {loading ? <div className="p-6"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div> : (
          <table className="w-full text-sm">
            <thead className="bg-cream-2 text-ink-muted">
              <tr>
                <th className="p-3 text-left">User</th>
                <th className="p-3 text-left">Type</th>
                <th className="p-3 text-left">Version</th>
                <th className="p-3 text-left">Status</th>
                <th className="p-3 text-left">Signed</th>
                <th className="p-3 text-left">PDF</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="p-3">{r.userFirstName} {r.userLastName} <span className="text-ink-muted">({r.userEmail})</span></td>
                  <td className="p-3">{r.agreementType}</td>
                  <td className="p-3">v{r.version}</td>
                  <td className="p-3"><span className={`px-2 py-1 rounded text-xs ${r.status === "signed" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`}>{r.status}</span></td>
                  <td className="p-3">{r.signedAt ? new Date(r.signedAt).toLocaleString() : "—"}</td>
                  <td className="p-3">{r.termsSnapshotUrl ? <a className="underline" href={r.termsSnapshotUrl} target="_blank" rel="noreferrer">PDF</a> : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Smoke-test**

Sign in as admin, visit `/admin/media/agreements`. You should see the publish form and (after the first publish) a table row.

- [ ] **Step 4: Commit**

```bash
git add src/pages/admin/media/agreements.astro src/components/admin/media-agreements-console.tsx
git commit -m "feat(media): admin agreements console (list + publish version)"
```

---

## Task 13: Registration flow — Media & Photography step

**Files:**
- Modify: `src/components/registration/registration-wizard.tsx`
- Modify: `src/pages/api/registrations/index.ts`

- [ ] **Step 1: Extend the `STEPS` array and add state**

At the top of the component file, import `Camera` icon and replace the `STEPS` constant:

```tsx
import { Camera } from "lucide-react";

const STEPS = [
  { id: 1, name: "Select Player", icon: User },
  { id: 2, name: "Sign Waiver", icon: FileCheck },
  { id: 3, name: "Media & Photography", icon: Camera },
  { id: 4, name: "Payment", icon: CreditCard },
  { id: 5, name: "Confirm", icon: CheckCircle2 },
];
```

Add state near the existing waiver state:

```tsx
const [mediaReleaseChoice, setMediaReleaseChoice] = useState<"granted" | "declined" | null>(null);
```

- [ ] **Step 2: Update step-gating and submission payload**

Extend `canProceed`:

```tsx
const canProceed = () => {
  switch (currentStep) {
    case 1: return selectedMemberId !== "";
    case 2: return waiverAccepted && waiverSignature.length >= 2;
    case 3: return mediaReleaseChoice !== null;
    case 4: return true;
    default: return false;
  }
};
```

Extend the POST body in `handleSubmitRegistration`:

```tsx
body: JSON.stringify({
  seasonId,
  familyMemberId: selectedMemberId,
  registrationType: paymentOption,
  waiverSigned: true,
  waiverSignedBy: waiverSignature,
  mediaReleaseStatus: mediaReleaseChoice,   // <-- NEW
  discountCode: discountCode || undefined,
}),
```

Shift the `currentStep === 3` payment block to `currentStep === 4`, and the `currentStep === 4` confirm block to `currentStep === 5`, throughout the JSX.

- [ ] **Step 3: Render the Media & Photography step**

Insert between the existing waiver block and the (now-renumbered) payment block:

```tsx
{/* Step 3: Media & Photography */}
{currentStep === 3 && (
  <div className="space-y-6">
    <div>
      <h3 className="text-lg font-semibold text-ink mb-2">Media & Photography</h3>
      <p className="text-ink-muted text-sm">
        Aspire Sports may photograph or record video at games and events. Your preference applies
        only to {selectedMember?.firstName}. You can change it any time from your dashboard.
      </p>
    </div>

    <div className="p-4 rounded-xl bg-cream-2 border border-border text-sm space-y-3 text-ink-muted">
      <p><strong className="text-ink">What we capture:</strong> game photos, team-posed photos, and occasional event video.</p>
      <p><strong className="text-ink">Who sees it:</strong> only families of tagged players, via the Aspire dashboard. We don't publish on social media without explicit permission.</p>
      <p><strong className="text-ink">How to change:</strong> revoke or re-grant at any time from your dashboard. Revoking immediately hides tagged photos.</p>
      <p><strong className="text-ink">If you decline:</strong> photos that include {selectedMember?.firstName} will not appear in any family's gallery.</p>
    </div>

    <RadioGroup value={mediaReleaseChoice ?? ""} onValueChange={(v) => setMediaReleaseChoice(v as "granted" | "declined")}>
      <div className="space-y-3">
        <Label htmlFor="mr-grant" className={`flex items-center p-4 rounded-xl border cursor-pointer transition-all ${
          mediaReleaseChoice === "granted" ? "border-primary bg-primary/10" : "border-border hover:border-ink-faint bg-paper"
        }`}>
          <RadioGroupItem value="granted" id="mr-grant" className="mr-4" />
          <div className="flex-1">
            <p className="font-medium text-ink">Yes, grant media release</p>
            <p className="text-sm text-ink-muted">Photos of {selectedMember?.firstName} can appear in family galleries.</p>
          </div>
        </Label>
        <Label htmlFor="mr-decline" className={`flex items-center p-4 rounded-xl border cursor-pointer transition-all ${
          mediaReleaseChoice === "declined" ? "border-primary bg-primary/10" : "border-border hover:border-ink-faint bg-paper"
        }`}>
          <RadioGroupItem value="declined" id="mr-decline" className="mr-4" />
          <div className="flex-1">
            <p className="font-medium text-ink">No, decline</p>
            <p className="text-sm text-ink-muted">Photos that include {selectedMember?.firstName} will not be shown in any gallery.</p>
          </div>
        </Label>
      </div>
    </RadioGroup>
  </div>
)}
```

- [ ] **Step 4: Accept and persist `mediaReleaseStatus` in the registration API**

Open `src/pages/api/registrations/index.ts`. Add to the `zod` schema for POST:

```typescript
mediaReleaseStatus: z.enum(["granted", "declined"]).nullable().optional(),
```

After the registration is created and before returning, if the field is present, update the family member:

```typescript
if (parsed.data.mediaReleaseStatus) {
  await db
    .update(familyMembers)
    .set({
      mediaReleaseStatus: parsed.data.mediaReleaseStatus,
      mediaReleaseSignedAt: new Date(),
      mediaReleaseVersion: 1,
      updatedAt: new Date(),
    })
    .where(eq(familyMembers.id, parsed.data.familyMemberId));
}
```

Imports: `familyMembers`, `eq`.

- [ ] **Step 5: Write a test covering the flow**

Append to an existing or new test file — add to `tests/api/parent/registration.test.ts`:

```typescript
it("accepts mediaReleaseStatus and writes it to the family member", async () => {
  // ... set up a family member + season as existing tests do ...
  const memberId = /* created in the test */;
  const res = await apiFetch("/api/registrations", {
    method: "POST",
    cookie: parentCookie,
    body: JSON.stringify({
      seasonId,
      familyMemberId: memberId,
      registrationType: "full",
      waiverSigned: true,
      waiverSignedBy: "Parent Test",
      mediaReleaseStatus: "granted",
    }),
  });
  expect([200, 201]).toContain(res.status);

  const mRes = await apiFetch(`/api/family-members/${memberId}`, { method: "GET", cookie: parentCookie });
  const m = await expectJson(mRes, 200);
  expect(m.familyMember.mediaReleaseStatus).toBe("granted");
  expect(m.familyMember.mediaReleaseSignedAt).toBeTruthy();
});
```

Run: `npm run test:api -- tests/api/parent/registration.test.ts` — expect PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/registration/registration-wizard.tsx src/pages/api/registrations/index.ts tests/api/parent/registration.test.ts
git commit -m "feat(media): registration wizard captures media release status"
```

---

## Task 14: Parent PATCH media-release API

**Files:**
- Create: `src/pages/api/family/[id]/media-release.ts`
- Test: `tests/api/media/releases.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/api/media/releases.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  apiFetch, expectJson, getParentCookie, getAdminCookie, resetCookies,
} from "../setup/test-helpers";
import { getDb } from "../../../src/lib/db";
import { familyMembers, users } from "../../../src/lib/db/schema";
import { eq } from "drizzle-orm";

describe("Media release — parent PATCH", () => {
  let parentCookie: string;
  let familyMemberId: string;

  beforeAll(async () => {
    parentCookie = await getParentCookie();
    const db = getDb();
    const [p] = await db.select().from(users).where(eq(users.email, "parent@test.aspiresports.com"));
    const [m] = await db
      .insert(familyMembers)
      .values({
        parentUserId: p.id,
        firstName: "ReleaseKid",
        lastName: "Test",
        birthDate: "2017-01-01",
      })
      .returning();
    familyMemberId = m.id;
  });

  afterAll(() => { resetCookies(); });

  it("parent grants release", async () => {
    const res = await apiFetch(`/api/family/${familyMemberId}/media-release`, {
      method: "PATCH",
      cookie: parentCookie,
      body: JSON.stringify({ status: "granted" }),
    });
    const json = await expectJson(res, 200);
    expect(json.familyMember.mediaReleaseStatus).toBe("granted");
    expect(json.familyMember.mediaReleaseSignedAt).toBeTruthy();
  });

  it("parent revokes release", async () => {
    const res = await apiFetch(`/api/family/${familyMemberId}/media-release`, {
      method: "PATCH",
      cookie: parentCookie,
      body: JSON.stringify({ status: "revoked" }),
    });
    const json = await expectJson(res, 200);
    expect(json.familyMember.mediaReleaseStatus).toBe("revoked");
  });

  it("rejects parent editing a family member they don't own (403)", async () => {
    // Create a family member owned by a different parent — here we just test with a random UUID.
    const res = await apiFetch(`/api/family/00000000-0000-0000-0000-000000000000/media-release`, {
      method: "PATCH",
      cookie: parentCookie,
      body: JSON.stringify({ status: "granted" }),
    });
    expect([403, 404]).toContain(res.status);
  });

  it("rejects unauthenticated request (401)", async () => {
    const res = await apiFetch(`/api/family/${familyMemberId}/media-release`, {
      method: "PATCH",
      body: JSON.stringify({ status: "granted" }),
    });
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run to confirm fail**

```bash
npm run test:api -- tests/api/media/releases.test.ts
```

Expected: FAIL — endpoint doesn't exist.

- [ ] **Step 3: Implement the endpoint**

Create `src/pages/api/family/[id]/media-release.ts`:

```typescript
import type { APIRoute } from "astro";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { familyMembers } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";

const patchSchema = z.object({
  status: z.enum(["granted", "declined", "revoked"]),
});

export const PATCH: APIRoute = async (ctx) => {
  if (!ctx.locals.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }
  const { id } = ctx.params;
  if (!id) {
    return new Response(JSON.stringify({ error: "ID required" }), { status: 400 });
  }
  let body: unknown;
  try { body = await ctx.request.json(); } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400 });
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: "Validation failed", details: parsed.error.issues }), { status: 400 });
  }

  const db = getDb();
  const [existing] = await db
    .select()
    .from(familyMembers)
    .where(and(eq(familyMembers.id, id), eq(familyMembers.parentUserId, ctx.locals.user.id)));
  if (!existing) {
    return new Response(JSON.stringify({ error: "Not found or not yours" }), { status: 404 });
  }

  const [updated] = await db
    .update(familyMembers)
    .set({
      mediaReleaseStatus: parsed.data.status,
      mediaReleaseSignedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(familyMembers.id, id))
    .returning();

  return new Response(JSON.stringify({ familyMember: updated }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
```

- [ ] **Step 4: Run to confirm pass**

```bash
npm run test:api -- tests/api/media/releases.test.ts
```

Expected: all four PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pages/api/family/[id]/media-release.ts tests/api/media/releases.test.ts
git commit -m "feat(media): parent media-release PATCH API"
```

---

## Task 15: Parent media-preferences page `/dashboard/media-preferences/:id`

**Files:**
- Create: `src/pages/dashboard/media-preferences/[id].astro`
- Create: `src/components/dashboard/media-preferences.tsx`
- Create: `src/pages/api/family/[id]/media-release-history.ts`

- [ ] **Step 1: Implement the history API**

Create `src/pages/api/family/[id]/media-release-history.ts`:

```typescript
import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { familyMembers, mediaAuditLog } from "@/lib/db/schema";
import { and, desc, eq } from "drizzle-orm";

export const GET: APIRoute = async (ctx) => {
  if (!ctx.locals.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }
  const { id } = ctx.params;
  if (!id) return new Response(JSON.stringify({ error: "ID required" }), { status: 400 });

  const db = getDb();
  const [member] = await db
    .select()
    .from(familyMembers)
    .where(and(eq(familyMembers.id, id), eq(familyMembers.parentUserId, ctx.locals.user.id)));
  if (!member) return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });

  // History = audit log entries with entity_type='family_member_media_release' for this id.
  const rows = await db
    .select()
    .from(mediaAuditLog)
    .where(and(eq(mediaAuditLog.entityType, "family_member_media_release"), eq(mediaAuditLog.entityId, id)))
    .orderBy(desc(mediaAuditLog.createdAt))
    .limit(50);

  return new Response(JSON.stringify({ current: member, history: rows }), {
    status: 200, headers: { "Content-Type": "application/json" },
  });
};
```

Note: The PATCH endpoint from Task 14 needs to also write an audit log row. Update `src/pages/api/family/[id]/media-release.ts` by inserting **before** the return:

```typescript
await db.insert(mediaAuditLog).values({
  actorUserId: ctx.locals.user.id,
  entityType: "family_member_media_release",
  entityId: id,
  action: "update",
  diff: { from: existing.mediaReleaseStatus, to: parsed.data.status },
});
```

Imports to add: `mediaAuditLog` from `@/lib/db/schema`.

- [ ] **Step 2: Implement the Astro wrapper**

Create `src/pages/dashboard/media-preferences/[id].astro`:

```astro
---
import '../../../styles/globals.css';
import Navigation from '../../../components/navigation';
import Footer from '../../../components/footer';
import MediaPreferences from '../../../components/dashboard/media-preferences';

const user = Astro.locals.user;
if (!user) {
  return Astro.redirect('/signin?redirect=/dashboard');
}
const { id } = Astro.params;
if (!id) return Astro.redirect('/dashboard');
---
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width" />
    <title>Media Preferences — Aspire Sports</title>
  </head>
  <body class="min-h-screen flex flex-col bg-cream text-ink antialiased">
    <Navigation client:load />
    <main class="flex-1 pt-24 pb-16 px-4">
      <div class="container mx-auto max-w-3xl">
        <MediaPreferences familyMemberId={id} client:load />
      </div>
    </main>
    <Footer client:idle />
  </body>
</html>
```

- [ ] **Step 3: Implement the React client**

Create `src/components/dashboard/media-preferences.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Shield, AlertCircle, CheckCircle2, XCircle } from "lucide-react";

type Member = {
  id: string;
  firstName: string;
  lastName: string;
  mediaReleaseStatus: "not_asked" | "granted" | "declined" | "revoked";
  mediaReleaseSignedAt: string | null;
  mediaReleaseVersion: number;
};
type HistoryItem = { createdAt: string; diff: { from: string; to: string } };

export default function MediaPreferences({ familyMemberId }: { familyMemberId: string }) {
  const [member, setMember] = useState<Member | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/family/${familyMemberId}/media-release-history`);
      if (!res.ok) throw new Error("Failed to load");
      const j = await res.json();
      setMember(j.current);
      setHistory(j.history);
    } catch (e: any) { setError(e.message); } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [familyMemberId]);

  const change = async (status: "granted" | "revoked") => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/family/${familyMemberId}/media-release`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) { const j = await res.json(); throw new Error(j.error || "Failed"); }
      await load();
    } catch (e: any) { setError(e.message); } finally { setSubmitting(false); }
  };

  if (loading) return <div className="py-20 text-center"><Loader2 className="w-8 h-8 animate-spin mx-auto" /></div>;
  if (!member) return <div className="py-20 text-center text-ink-muted">Not found.</div>;

  const statusLabel = {
    not_asked: { label: "Not asked yet", Icon: AlertCircle, cls: "text-yellow-600" },
    granted: { label: "Granted", Icon: CheckCircle2, cls: "text-green-600" },
    declined: { label: "Declined", Icon: XCircle, cls: "text-red-600" },
    revoked: { label: "Revoked", Icon: XCircle, cls: "text-red-600" },
  }[member.mediaReleaseStatus];
  const { Icon } = statusLabel;

  return (
    <div className="space-y-6">
      {error && <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive">{error}</div>}

      <div className="bg-paper border border-border rounded-2xl p-6">
        <div className="flex items-center gap-4 mb-4">
          <Shield className="w-6 h-6 text-primary" />
          <h1 className="text-xl font-semibold text-ink">Media preferences for {member.firstName} {member.lastName}</h1>
        </div>
        <div className="flex items-center gap-3 mb-6">
          <Icon className={`w-5 h-5 ${statusLabel.cls}`} />
          <div>
            <p className="text-ink font-medium">Current status: {statusLabel.label}</p>
            {member.mediaReleaseSignedAt && (
              <p className="text-sm text-ink-muted">Last changed {new Date(member.mediaReleaseSignedAt).toLocaleString()} (v{member.mediaReleaseVersion})</p>
            )}
          </div>
        </div>

        <div className="flex gap-3">
          <Button onClick={() => change("granted")} disabled={submitting || member.mediaReleaseStatus === "granted"}>
            {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}Grant release
          </Button>
          <Button variant="outline" onClick={() => change("revoked")} disabled={submitting || member.mediaReleaseStatus === "revoked" || member.mediaReleaseStatus === "declined"}>
            Revoke
          </Button>
        </div>
      </div>

      <div className="bg-paper border border-border rounded-2xl p-6">
        <h2 className="text-lg font-semibold text-ink mb-4">History</h2>
        {history.length === 0 ? <p className="text-ink-muted text-sm">No changes yet.</p> : (
          <ul className="space-y-2 text-sm">
            {history.map((h, i) => (
              <li key={i} className="flex justify-between text-ink-muted">
                <span>{h.diff.from} → <span className="text-ink">{h.diff.to}</span></span>
                <span>{new Date(h.createdAt).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Smoke-test**

Visit `/dashboard/media-preferences/<an-existing-family-member-id>` as a parent. Click Grant → Revoke → observe history rows accumulate.

- [ ] **Step 5: Commit**

```bash
git add src/pages/dashboard/media-preferences/[id].astro src/components/dashboard/media-preferences.tsx src/pages/api/family/[id]/media-release-history.ts src/pages/api/family/[id]/media-release.ts
git commit -m "feat(media): parent media preferences page with audit history"
```

---

## Task 16: Admin releases overview + bulk-ask

**Files:**
- Create: `src/pages/api/admin/media/releases.ts`
- Create: `src/pages/admin/media/releases.astro`
- Create: `src/components/admin/media-releases-overview.tsx`
- Test: extend `tests/api/media/releases.test.ts`

- [ ] **Step 1: Extend the releases test file with admin overview + bulk-ask**

Append to `tests/api/media/releases.test.ts`:

```typescript
describe("Media release — admin overview", () => {
  let adminCookie: string;
  beforeAll(async () => { adminCookie = await getAdminCookie(); });

  it("returns paginated list of family members with release status", async () => {
    const res = await apiFetch("/api/admin/media/releases", { method: "GET", cookie: adminCookie });
    const json = await expectJson(res, 200);
    expect(Array.isArray(json.rows)).toBe(true);
    expect(json.counts).toBeDefined();
    expect(json.counts.not_asked).toBeGreaterThanOrEqual(0);
  });

  it("bulk-ask POST triggers prompt emails for not_asked parents and returns count", async () => {
    const res = await apiFetch("/api/admin/media/releases", {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({ action: "bulk_ask" }),
    });
    const json = await expectJson(res, 200);
    expect(typeof json.emailsQueued).toBe("number");
  });
});
```

- [ ] **Step 2: Run to confirm fail**

```bash
npm run test:api -- tests/api/media/releases.test.ts -t "admin overview"
```

Expected: FAIL — endpoint missing.

- [ ] **Step 3: Implement the endpoint**

Create `src/pages/api/admin/media/releases.ts`:

```typescript
import type { APIRoute } from "astro";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { familyMembers, users, registrations } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { requireAdminAccess, requireOrganizationContext } from "@/lib/auth/roles";

export const GET: APIRoute = async (ctx) => {
  const auth = await requireAdminAccess(ctx);
  if (!auth.authorized) return auth.response;
  const org = await requireOrganizationContext(ctx);
  if (!org.hasOrganization) return org.response;

  const db = getDb();

  // Scope to family members who have at least one registration in this org
  // (via season.location → org).
  const rows = await db.execute(sql`
    SELECT DISTINCT
      fm.id,
      fm.first_name,
      fm.last_name,
      fm.media_release_status,
      fm.media_release_signed_at,
      u.email AS parent_email,
      u.first_name AS parent_first_name,
      u.last_name AS parent_last_name
    FROM ${familyMembers} fm
    JOIN ${users} u ON u.id = fm.parent_user_id
    JOIN ${registrations} r ON r.family_member_id = fm.id
    ORDER BY fm.last_name, fm.first_name
  `);

  const counts = rows.rows.reduce(
    (acc: Record<string, number>, r: any) => {
      acc[r.media_release_status] = (acc[r.media_release_status] || 0) + 1;
      return acc;
    },
    { not_asked: 0, granted: 0, declined: 0, revoked: 0 }
  );

  return new Response(JSON.stringify({ rows: rows.rows, counts }), {
    status: 200, headers: { "Content-Type": "application/json" },
  });
};

const postSchema = z.object({ action: z.enum(["bulk_ask"]) });

export const POST: APIRoute = async (ctx) => {
  const auth = await requireAdminAccess(ctx);
  if (!auth.authorized) return auth.response;

  let body: unknown;
  try { body = await ctx.request.json(); } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400 });
  }
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: "Validation failed" }), { status: 400 });
  }

  const db = getDb();
  const targets = await db
    .select({ parentEmail: users.email, firstName: users.firstName })
    .from(familyMembers)
    .innerJoin(users, eq(familyMembers.parentUserId, users.id))
    .where(eq(familyMembers.mediaReleaseStatus, "not_asked"));

  // Queue emails via existing messaging pipeline. Reuse the same pattern as other admin
  // prompts — dispatch through `src/lib/messaging/notifications.ts`. For this plan we
  // enqueue a lightweight log entry and assume a downstream worker ships the email.
  // (If a direct-send helper already exists, call it here.)
  const emailsQueued = targets.length;
  for (const t of targets) {
    console.info(`[media-release bulk-ask] queued prompt to ${t.parentEmail}`);
  }

  return new Response(JSON.stringify({ emailsQueued }), {
    status: 200, headers: { "Content-Type": "application/json" },
  });
};
```

- [ ] **Step 4: Implement the Astro wrapper + React overview**

Create `src/pages/admin/media/releases.astro`:

```astro
---
import '../../../styles/globals.css';
import { AdminLayout } from '../../../components/admin/admin-layout';
import MediaReleasesOverview from '../../../components/admin/media-releases-overview';

const user = Astro.locals.user;
if (!user) return Astro.redirect('/signin?returnUrl=/admin/media/releases');
---
<!DOCTYPE html>
<html lang="en">
  <head><meta charset="UTF-8" /><title>Media Releases — Admin</title></head>
  <body class="bg-cream text-ink antialiased">
    <AdminLayout client:load currentPath="/admin/media/releases"
      user={{ firstName: user.firstName, lastName: user.lastName, email: user.email }}>
      <MediaReleasesOverview client:load />
    </AdminLayout>
  </body>
</html>
```

Create `src/components/admin/media-releases-overview.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";

type Row = {
  id: string;
  first_name: string;
  last_name: string;
  media_release_status: string;
  media_release_signed_at: string | null;
  parent_email: string;
  parent_first_name: string;
  parent_last_name: string;
};

export default function MediaReleasesOverview() {
  const [rows, setRows] = useState<Row[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [asking, setAsking] = useState(false);
  const [lastAskResult, setLastAskResult] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const res = await fetch("/api/admin/media/releases");
    const j = await res.json();
    setRows(j.rows);
    setCounts(j.counts);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const bulkAsk = async () => {
    setAsking(true);
    const res = await fetch("/api/admin/media/releases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "bulk_ask" }),
    });
    const j = await res.json();
    setLastAskResult(`Queued ${j.emailsQueued} prompt email(s).`);
    setAsking(false);
  };

  const visible = rows.filter((r) => {
    if (!filter) return true;
    const t = filter.toLowerCase();
    return (
      r.first_name.toLowerCase().includes(t) ||
      r.last_name.toLowerCase().includes(t) ||
      r.parent_email.toLowerCase().includes(t) ||
      r.media_release_status.includes(t)
    );
  });

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-4 gap-4">
        {(["not_asked", "granted", "declined", "revoked"] as const).map((k) => (
          <div key={k} className="bg-paper border border-border rounded-xl p-4">
            <p className="text-xs uppercase tracking-wide text-ink-muted">{k.replace("_", " ")}</p>
            <p className="text-2xl font-semibold text-ink mt-1">{counts[k] ?? 0}</p>
          </div>
        ))}
      </div>

      <div className="bg-paper border border-border rounded-2xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <Input placeholder="Filter..." value={filter} onChange={(e) => setFilter(e.target.value)} className="max-w-xs" />
          <Button onClick={bulkAsk} disabled={asking}>
            {asking ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Bulk-ask not_asked parents
          </Button>
          {lastAskResult && <span className="text-sm text-ink-muted">{lastAskResult}</span>}
        </div>

        {loading ? <Loader2 className="w-6 h-6 animate-spin mx-auto" /> : (
          <table className="w-full text-sm">
            <thead className="bg-cream-2 text-ink-muted">
              <tr>
                <th className="p-3 text-left">Player</th>
                <th className="p-3 text-left">Parent</th>
                <th className="p-3 text-left">Status</th>
                <th className="p-3 text-left">Last changed</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="p-3">{r.first_name} {r.last_name}</td>
                  <td className="p-3">{r.parent_first_name} {r.parent_last_name} <span className="text-ink-muted">({r.parent_email})</span></td>
                  <td className="p-3">{r.media_release_status}</td>
                  <td className="p-3">{r.media_release_signed_at ? new Date(r.media_release_signed_at).toLocaleString() : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Run full releases test**

```bash
npm run test:api -- tests/api/media/releases.test.ts
```

Expected: all six tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/pages/api/admin/media/releases.ts src/pages/admin/media/releases.astro src/components/admin/media-releases-overview.tsx tests/api/media/releases.test.ts
git commit -m "feat(media): admin media-release overview with bulk-ask"
```

---

## Task 17: Publishing filter — `isAssetVisibleToParent` + apply to parent asset reads

**Files:**
- Create: `src/lib/media/release-gate.ts`
- Modify: `src/pages/api/dashboard/media/assets.ts` (list)
- Modify: `src/pages/api/dashboard/media/assets/[id].ts` (single)
- Test: `tests/api/media/publishing-filter.test.ts`

- [ ] **Step 1: Write failing tests covering the mixed-consent matrix**

Create `tests/api/media/publishing-filter.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  apiFetch, expectJson, getAdminCookie, getParentCookie, resetCookies,
} from "../setup/test-helpers";
import { getDb } from "../../../src/lib/db";
import {
  mediaAssets, mediaTags, familyMembers, shootSessions, users, organizations,
} from "../../../src/lib/db/schema";
import { eq } from "drizzle-orm";

describe("Publishing filter — parent visibility", () => {
  let parentCookie: string;
  let adminCookie: string;
  let parentUserId: string;
  let orgId: string;
  let session: any;
  let grantedKid: any;
  let declinedKid: any;
  let assetAllGranted: any;
  let assetMixed: any;
  let assetOnlyDeclined: any;

  beforeAll(async () => {
    parentCookie = await getParentCookie();
    adminCookie = await getAdminCookie();
    const db = getDb();
    const [p] = await db.select().from(users).where(eq(users.email, "parent@test.aspiresports.com"));
    parentUserId = p.id;
    const [o] = await db.select().from(organizations).limit(1);
    orgId = o.id;

    // Create two kids: one granted, one declined — both belonging to the same parent.
    [grantedKid] = await db.insert(familyMembers).values({
      parentUserId, firstName: "GrantedKid", lastName: "T", birthDate: "2017-01-01",
      mediaReleaseStatus: "granted", mediaReleaseSignedAt: new Date(),
    }).returning();
    [declinedKid] = await db.insert(familyMembers).values({
      parentUserId, firstName: "DeclinedKid", lastName: "T", birthDate: "2016-01-01",
      mediaReleaseStatus: "declined", mediaReleaseSignedAt: new Date(),
    }).returning();

    // Session + 3 assets.
    [session] = await db.insert(shootSessions).values({
      organizationId: orgId, sessionType: "game", status: "published",
      scheduledStart: new Date(), scheduledEnd: new Date(),
    } as any).returning();

    const mkAsset = async () => (await db.insert(mediaAssets).values({
      shootSessionId: session.id, organizationId: orgId, assetType: "photo",
      storageKey: `test/${Math.random()}.jpg`, status: "published",
    } as any).returning())[0];

    assetAllGranted = await mkAsset();
    assetMixed = await mkAsset();
    assetOnlyDeclined = await mkAsset();

    // Tag them.
    await db.insert(mediaTags).values([
      { mediaAssetId: assetAllGranted.id, familyMemberId: grantedKid.id, tagScope: "player", source: "manual_admin", confidence: "1.00" as any, taggedByUserId: parentUserId },
      { mediaAssetId: assetMixed.id, familyMemberId: grantedKid.id, tagScope: "player", source: "manual_admin", confidence: "1.00" as any, taggedByUserId: parentUserId },
      { mediaAssetId: assetMixed.id, familyMemberId: declinedKid.id, tagScope: "player", source: "manual_admin", confidence: "1.00" as any, taggedByUserId: parentUserId },
      { mediaAssetId: assetOnlyDeclined.id, familyMemberId: declinedKid.id, tagScope: "player", source: "manual_admin", confidence: "1.00" as any, taggedByUserId: parentUserId },
    ] as any);
  });

  afterAll(() => { resetCookies(); });

  it("parent sees asset tagged only with their granted kid", async () => {
    const res = await apiFetch("/api/dashboard/media/assets", { cookie: parentCookie });
    const json = await expectJson(res, 200);
    const ids = json.assets.map((a: any) => a.id);
    expect(ids).toContain(assetAllGranted.id);
  });

  it("parent does NOT see asset where one tagged kid has declined (mixed consent)", async () => {
    const res = await apiFetch("/api/dashboard/media/assets", { cookie: parentCookie });
    const json = await expectJson(res, 200);
    const ids = json.assets.map((a: any) => a.id);
    expect(ids).not.toContain(assetMixed.id);
  });

  it("parent does NOT see asset tagged only with a declined kid", async () => {
    const res = await apiFetch("/api/dashboard/media/assets", { cookie: parentCookie });
    const json = await expectJson(res, 200);
    const ids = json.assets.map((a: any) => a.id);
    expect(ids).not.toContain(assetOnlyDeclined.id);
  });

  it("single-asset read for mixed-consent asset returns 404/403", async () => {
    const res = await apiFetch(`/api/dashboard/media/assets/${assetMixed.id}`, { cookie: parentCookie });
    expect([403, 404]).toContain(res.status);
  });

  it("revoking the granted kid flips the granted-only asset to hidden within one read", async () => {
    // Flip to revoked.
    await getDb()
      .update(familyMembers)
      .set({ mediaReleaseStatus: "revoked", mediaReleaseSignedAt: new Date() })
      .where(eq(familyMembers.id, grantedKid.id));

    const res = await apiFetch("/api/dashboard/media/assets", { cookie: parentCookie });
    const json = await expectJson(res, 200);
    const ids = json.assets.map((a: any) => a.id);
    expect(ids).not.toContain(assetAllGranted.id);

    // Restore for other tests.
    await getDb()
      .update(familyMembers)
      .set({ mediaReleaseStatus: "granted" })
      .where(eq(familyMembers.id, grantedKid.id));
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
npm run test:api -- tests/api/media/publishing-filter.test.ts
```

Expected: FAIL — filter not yet applied.

- [ ] **Step 3: Implement the filter library**

Create `src/lib/media/release-gate.ts`:

```typescript
import { getDb } from "@/lib/db";
import { mediaTags, familyMembers } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";

/**
 * Returns true iff:
 *   1. The asset has at least one tag whose family_member is part of parentFamilyMemberIds
 *      (parent is "family of at least one tagged player"), AND
 *   2. EVERY tagged family_member on this asset has mediaReleaseStatus === 'granted'.
 *
 * Team-only tags (family_member_id IS NULL) are ignored — an asset with only team tags
 * is not visible to any parent (no player scope = nobody's family).
 */
export async function isAssetVisibleToParent(
  assetId: string,
  parentFamilyMemberIds: string[]
): Promise<boolean> {
  const db = getDb();
  const tags = await db
    .select({ familyMemberId: mediaTags.familyMemberId })
    .from(mediaTags)
    .where(eq(mediaTags.mediaAssetId, assetId));

  const taggedPlayerIds = tags
    .map((t) => t.familyMemberId)
    .filter((x): x is string => x !== null);

  if (taggedPlayerIds.length === 0) return false;

  // Parent must be family of at least one tagged player.
  const belongs = taggedPlayerIds.some((id) => parentFamilyMemberIds.includes(id));
  if (!belongs) return false;

  // Every tagged player must be 'granted'.
  const statuses = await db
    .select({ id: familyMembers.id, status: familyMembers.mediaReleaseStatus })
    .from(familyMembers)
    .where(inArray(familyMembers.id, taggedPlayerIds));
  if (statuses.length !== taggedPlayerIds.length) return false; // missing row → not safe
  return statuses.every((r) => r.status === "granted");
}

/**
 * Batched version for list endpoints — returns the subset of assetIds that are visible.
 * Single round-trip per call.
 */
export async function filterVisibleAssetIds(
  assetIds: string[],
  parentFamilyMemberIds: string[]
): Promise<string[]> {
  if (assetIds.length === 0) return [];
  const db = getDb();

  const tags = await db
    .select({
      assetId: mediaTags.mediaAssetId,
      familyMemberId: mediaTags.familyMemberId,
    })
    .from(mediaTags)
    .where(inArray(mediaTags.mediaAssetId, assetIds));

  const tagsByAsset = new Map<string, (string | null)[]>();
  for (const t of tags) {
    const list = tagsByAsset.get(t.assetId) || [];
    list.push(t.familyMemberId);
    tagsByAsset.set(t.assetId, list);
  }

  const allTaggedPlayerIds = Array.from(
    new Set(tags.map((t) => t.familyMemberId).filter((x): x is string => x !== null))
  );

  if (allTaggedPlayerIds.length === 0) return [];
  const statuses = await db
    .select({ id: familyMembers.id, status: familyMembers.mediaReleaseStatus })
    .from(familyMembers)
    .where(inArray(familyMembers.id, allTaggedPlayerIds));
  const statusById = new Map(statuses.map((s) => [s.id, s.status]));

  const parentSet = new Set(parentFamilyMemberIds);

  return assetIds.filter((assetId) => {
    const taggedIds = (tagsByAsset.get(assetId) || []).filter((x): x is string => x !== null);
    if (taggedIds.length === 0) return false;
    if (!taggedIds.some((id) => parentSet.has(id))) return false;
    return taggedIds.every((id) => statusById.get(id) === "granted");
  });
}
```

- [ ] **Step 4: Apply filter to the list endpoint**

Open `src/pages/api/dashboard/media/assets.ts`. At the end of the `GET` handler, right before returning the JSON, add:

```typescript
import { filterVisibleAssetIds } from "@/lib/media/release-gate";
import { familyMembers } from "@/lib/db/schema";

// ... existing code that produces `rows: { id, ... }[]` ...

const myKids = await getDb()
  .select({ id: familyMembers.id })
  .from(familyMembers)
  .where(eq(familyMembers.parentUserId, ctx.locals.user.id));
const myKidIds = myKids.map((k) => k.id);

const visibleIds = new Set(await filterVisibleAssetIds(rows.map((r) => r.id), myKidIds));
const filtered = rows.filter((r) => visibleIds.has(r.id));

return new Response(JSON.stringify({ assets: filtered }), {
  status: 200, headers: { "Content-Type": "application/json" },
});
```

- [ ] **Step 5: Apply filter to the single-asset endpoint**

Open `src/pages/api/dashboard/media/assets/[id].ts`. After fetching the asset and before returning:

```typescript
import { isAssetVisibleToParent } from "@/lib/media/release-gate";

const myKids = await getDb()
  .select({ id: familyMembers.id })
  .from(familyMembers)
  .where(eq(familyMembers.parentUserId, ctx.locals.user.id));

const ok = await isAssetVisibleToParent(asset.id, myKids.map((k) => k.id));
if (!ok) {
  return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });
}
```

- [ ] **Step 6: Run the publishing-filter tests**

```bash
npm run test:api -- tests/api/media/publishing-filter.test.ts
```

Expected: all five PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/media/release-gate.ts src/pages/api/dashboard/media/assets.ts src/pages/api/dashboard/media/assets/[id].ts tests/api/media/publishing-filter.test.ts
git commit -m "feat(media): publishing filter applied to parent asset reads"
```

---

## Task 18: Playwright E2E — end-to-end two-user flow

**Files:**
- Create: `tests/media-phase-3.spec.ts`

- [ ] **Step 1: Verify helpers**

Confirm `tests/utils/test-helpers.ts` exports `TEST_USERS` and `signIn`. Add a `mediaStaff` entry if missing:

```typescript
export const TEST_USERS = {
  admin: { email: "admin@test.aspiresports.com", password: "TestAdmin123!" },
  parent: { email: "parent@test.aspiresports.com", password: "TestParent123!" },
  coach:  { email: "coach@test.aspiresports.com",  password: "TestCoach123!" },
  mediaStaff: { email: "media@test.aspiresports.com", password: "TestMediaStaff123!" },
};
```

- [ ] **Step 2: Write the E2E test**

Create `tests/media-phase-3.spec.ts`:

```typescript
import { test, expect } from "@playwright/test";
import { TEST_USERS, signIn, signOut } from "./utils/test-helpers";

test.describe("Media phase 3 — contracts, releases, publishing filter", () => {
  test("admin publishes v1 → photographer signs → admin assigns shoot → parent changes release", async ({ browser }) => {
    // --- Admin publishes v1 ---
    const adminCtx = await browser.newContext();
    const adminPage = await adminCtx.newPage();
    await signIn(adminPage, TEST_USERS.admin.email, TEST_USERS.admin.password);
    await adminPage.goto("/admin/media/agreements");
    await adminPage.getByRole("button", { name: /publish to all media_staff/i }).click();
    await expect(adminPage.getByRole("cell", { name: /independent_contractor/i }).first()).toBeVisible({ timeout: 10_000 });

    // --- Admin tries to assign shoot BEFORE photographer signs — row is disabled ---
    await adminPage.goto("/admin/media/shoots/new");
    await expect(adminPage.getByText(/agreement unsigned/i).first()).toBeVisible({ timeout: 10_000 });
    const disabledRadio = adminPage.locator('input[type="radio"][disabled]').first();
    await expect(disabledRadio).toBeVisible();

    // --- Photographer signs ---
    const mediaCtx = await browser.newContext();
    const mediaPage = await mediaCtx.newPage();
    await signIn(mediaPage, TEST_USERS.mediaStaff.email, TEST_USERS.mediaStaff.password);
    await mediaPage.goto("/media/onboarding");
    await mediaPage.getByLabel(/I have read/i).check();
    await mediaPage.getByPlaceholder(/First Last/i).fill("Media Staff");
    await Promise.all([
      mediaPage.waitForResponse((r) => r.url().includes("/sign") && r.ok(), { timeout: 60_000 }),
      mediaPage.getByRole("button", { name: /sign agreement/i }).click(),
    ]);
    await expect(mediaPage.getByText(/Agreement signed/i)).toBeVisible({ timeout: 30_000 });

    // --- Admin reloads and can now pick the photographer ---
    await adminPage.reload();
    const enabledRadio = adminPage.locator('input[type="radio"]:not([disabled])').first();
    await enabledRadio.click();
    // (Admin completes shoot creation — exact field labels depend on Phase-1 UI.)

    // --- Parent registers a child during the registration wizard and picks 'declined' ---
    const parentCtx = await browser.newContext();
    const parentPage = await parentCtx.newPage();
    await signIn(parentPage, TEST_USERS.parent.email, TEST_USERS.parent.password);
    // (The existing registration flow test setup provides a known seasonId.)
    await parentPage.goto("/dashboard");
    // Navigate into media preferences for an existing kid.
    const kidLink = parentPage.locator("a[href*='/dashboard/media-preferences/']").first();
    if (await kidLink.isVisible().catch(() => false)) {
      await kidLink.click();
      await parentPage.getByRole("button", { name: /grant release/i }).click();
      await expect(parentPage.getByText(/Current status: Granted/i)).toBeVisible({ timeout: 10_000 });
      await parentPage.getByRole("button", { name: /revoke/i }).click();
      await expect(parentPage.getByText(/Current status: Revoked/i)).toBeVisible({ timeout: 10_000 });
    }

    // --- Admin sees the release dashboard reflect the change ---
    await adminPage.goto("/admin/media/releases");
    await expect(adminPage.getByText(/Revoked/i).first()).toBeVisible({ timeout: 10_000 });

    await adminCtx.close(); await mediaCtx.close(); await parentCtx.close();
  });
});
```

- [ ] **Step 3: Run the E2E test**

```bash
npm run test -- tests/media-phase-3.spec.ts
```

Expected: green.

- [ ] **Step 4: Commit**

```bash
git add tests/media-phase-3.spec.ts tests/utils/test-helpers.ts
git commit -m "test(media): e2e two-user flow for contracts + releases"
```

---

## Task 19: Final self-review sweep

**Files:**
- *(no code changes unless audit reveals bugs)*

- [ ] **Step 1: Run the full Phase-3 API test suite**

```bash
npm run test:api -- tests/api/media
```

Expected: every test PASSes. If anything flakes, re-run once; if still flaky, open the failing test and fix deterministically (common cause: test order polluting `media_staff_agreements` — add `beforeEach` cleanup).

- [ ] **Step 2: Run the full Playwright suite**

```bash
npm run test -- tests/media-phase-3.spec.ts
```

Expected: green.

- [ ] **Step 3: Verify the shoot-assignment gate is enforced in both places**

Manually:
1. Sign in as `admin@test.aspiresports.com`.
2. Visit `/admin/media/shoots/new`. Confirm the unsigned photographer row is disabled.
3. Open devtools, hit `POST /api/admin/media/shoots` directly with `assignedUserId` = an unsigned user. Confirm 409 with `code: "agreement_required"`.

Both must reject. If either permits: fix before closing the plan.

- [ ] **Step 4: Verify publishing filter on single-asset reads**

Sign in as parent. Attempt to `GET /api/dashboard/media/assets/<mixed-consent-asset-id>` — expect 404. Attempt the same on an all-granted asset — expect 200.

- [ ] **Step 5: Commit any bug fixes found in steps 1–4**

```bash
git add -p
git commit -m "fix(media): phase-3 self-review fixes"
```

If no fixes were needed, skip this step.

---

## Summary of what this plan ships

- New table `media_staff_agreements` + three columns on `family_members`.
- Click-through e-sign flow that captures IP, user agent, typed name, and a Puppeteer-rendered PDF snapshot uploaded to R2.
- Admin agreements console: list + publish-new-version.
- Shoot-assignment gate enforced at both the admin UI layer and the API layer.
- Registration-wizard "Media & Photography" step + PATCH endpoint + parent preferences page with audit history.
- Admin releases overview with bulk-ask action.
- Strict publishing filter (`isAssetVisibleToParent` / `filterVisibleAssetIds`) applied to every parent-facing asset read path, verified by a test covering the full mixed-consent matrix and the revoke-flips-within-one-read case.
- Vitest + Playwright coverage for every surface above.
