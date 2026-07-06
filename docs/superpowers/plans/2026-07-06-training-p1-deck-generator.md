# Phase 1 — Per-Role Training Deck Generator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/plans/2026-07-06-training-content-pipeline.md`, "Global Constraints", "Background", and "Phase 1 — Per-role training deck generator". Phases 2-3 are out of scope for this plan.

**Goal:** Add `renderTrainingDeck` + `generateAllTrainingDecks` to the ops-catalog view layer so every worker role gets a self-contained, navigable, printable HTML training deck generated from the same catalog that drives the role manuals — wired into `catalog:render` so it inherits the existing CI up-to-date guard.

**Architecture:** A new pure view module (`src/lib/ops-catalog/views/training-deck.ts`) parallels `role-manual.ts`: it reuses that file's phase/involvement matching (exported for reuse), turns each matched activity into a slide instead of a markdown section, and adds deck-only sections (checklists, safety/escalation rollup, "your tools" portal-page list, help slide). Optional hand-authored intro content and screenshot data are injected via a plain options object so the view stays pure/synchronous and unit-testable — all filesystem I/O (reading `role.<id>.intro.md`, reading and base64-encoding screenshot PNGs for `--embed`) lives in the CLI shim (`scripts/ops-catalog/index.ts`), matching how the existing script does I/O around the pure `loader`/`validator`/view functions.

**Tech Stack:** Existing only — TypeScript, Node `fs`/`path`, the ops-catalog loader/types, Vitest. No new dependencies. Pure Node/TypeScript tooling — no Astro pages, no DB, no migrations.

## Global Constraints

Copied from the spec; every task's requirements implicitly include these:

- Decks must be **self-contained HTML** (inline CSS/JS, no CDN) so they open from disk and print to PDF; one file per role under `docs/operations/artifacts/training/`.
- Generated decks follow the manuals' contract: **byte-stable output for unchanged catalog input** (the ops-catalog CI check diffs rendered artifacts). No `Date.now()`, no wall-clock timestamps, no non-deterministic iteration order anywhere in the render path.
- Respect `manual_target: hand_authored` semantics **where applicable** — hand-authored *content* is composed by reference, never overwritten. (See Design Decision 1 for what this does and does not mean for decks.)
- Screenshots/videos are Phase 2's build artifacts (gitignored, live under repo-root `training/`) — Phase 1 only defines the slot contract (stable filename, graceful absence, `--embed` data-URI mode) and must not assume Phase 2's directory exists.
- Standard repo rules: `tsc --noEmit` zero errors; no schema/migrations touched (none expected, none added).

## Design Decisions

**1. Decks are generated for ALL worker roles, including `manual_target: hand_authored` ones — unlike `generateAllRoleManuals`.** `role-manual.ts` skips `hand_authored` roles (`role.coach`, `role.team_captain`) because regenerating would clobber a human-authored manual file. Decks don't have this problem: `renderTrainingDeck` always derives its content straight from catalog activities/RACI/artifacts, never from the manual's prose, so there is nothing to clobber. The *only* hand-authored input a deck ever composes is the optional `role.<id>.intro.md` (read-only, inlined as leading slides) — that file exists purely to let a human add framing slides, and its presence/absence is orthogonal to `manual_target`. Task 7 has a regression test locking this in (a `manual_target: hand_authored` role still gets a deck).

**2. "Your tools" portal-page lists are a small hand-curated map (`PORTAL_PAGES`), not derived from a catalog field.** Nothing in `RoleSchema`/`ActivitySchema` ties an activity to a UI route, and the spec's own examples (coach → `/coach` surfaces, referee → check-in + score entry, venue manager → venue command center) are themselves hand-picked, not schema-derived. `PORTAL_PAGES` is keyed by role id and verified against real routes in `src/pages/` (coach, referee, venue-manager, front-of-house, event-lead, photographer, team-captain, director all have concrete entries checked against the actual page tree; `role.facilities` has no dedicated portal today, so it renders an explicit "no dedicated tools yet" slide rather than an invented link). This is the plan's most judgment-heavy area — flagging it explicitly rather than presenting it as catalog-driven.

**3. Screenshot slug = activity id minus the `act.` prefix, one slot per per-activity slide.** The spec only fixes the filename shape (`training/screenshots/<role>/<slug>.png`) and the degrade/embed behavior, not which slides get slots or how `<slug>` is derived — Phase 2 (which owns the walkthrough scripts) doesn't exist yet to dictate a workflow-level naming scheme. Per-activity is the natural 1:1 mapping available today and keeps the mechanism generic (any string slug, gracefully degrading) so Phase 2 only needs to match the slug it writes to, not the mechanism.

**4. `renderTrainingDeck` stays pure and synchronous; all screenshot/intro file I/O happens in the CLI shim.** `TrainingDeckOptions` carries `intro?: string` (already-read file content) and `screenshots?: Map<string, string>` (slug → already-resolved `<img>` `src`, either a relative path for normal mode or a `data:` URI for `--embed`). The view never touches `fs`. This mirrors the existing separation (`loader.ts` does I/O; `role-manual.ts`/`validator.ts` are pure) and keeps every deck behavior unit-testable without a filesystem.

**5. Non-embed mode always emits a real `<img>` with a stable relative path + inline `onerror` degrade — it does not need to know at render time whether the file exists.** This is what makes "graceful absence" also work *after* Phase 2 later drops a PNG into place without a deck re-render forcing awareness of it (though in practice CI re-renders on every catalog change anyway). `--embed` mode is the only path that does file-existence-dependent work, and that work lives entirely in the CLI (reads `training/screenshots/<role>/*.png`, base64-encodes what exists, passes the result map in).

**6. Fixed relative path from deck output to screenshots.** Decks are contractually written to `docs/operations/artifacts/training/role.<id>.deck.html`. The repo-root `training/screenshots/` directory is exactly four levels up from that file's directory, so the view hardcodes `../../../../training/screenshots` as `SCREENSHOT_RELATIVE_PREFIX` rather than computing it with `path.relative` (which would require `path`/`fs` in a file that's otherwise pure string-building). If the deck output location ever moves, this constant must move with it — flagged in a code comment.

**7. Slide ordering is phase-interleaved, not "all overview slides then all detail slides."** The spec lists "your day phase-by-phase" and "per-activity slides" as separate bullets but doesn't fix their relative order. Interleaving (phase-overview slide, then each of that phase's activity-detail slides, then the next phase's overview, …) reads better for training than two disconnected blocks and still satisfies both bullets structurally.

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `src/lib/ops-catalog/views/role-manual.ts` | Modify | Export `PHASE_ORDER`, `Involvement`, `involvementOf` for reuse (no behavior change). |
| `src/lib/ops-catalog/views/training-deck.ts` | Create | `renderTrainingDeck` + `generateAllTrainingDecks` — the deck view. |
| `tests/unit/ops-catalog/views/training-deck.test.ts` | Create | Unit tests against the existing fixture catalog. |
| `scripts/ops-catalog/index.ts` | Modify | Render training decks (+ optional `--embed`) alongside manuals in the primary `render` pipeline. |
| `package.json` | Modify | Add `catalog:render:embed` script. |
| `.github/workflows/ops-catalog.yml` | Modify | Add `src/lib/ops-catalog/**` to the trigger `paths` (pre-existing gap: the workflow already never watched the directory both `role-manual.ts` and the new `training-deck.ts` live in). |
| `docs/operations/artifacts/training/role.<id>.deck.html` | Generated | Output artifact, produced by `npm run catalog:render` — not hand-written. |

---

### Task 1: Export shared phase/involvement helpers from `role-manual.ts`

**Files:**
- Modify: `src/lib/ops-catalog/views/role-manual.ts`
- Test: `tests/unit/ops-catalog/views/role-manual.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces (later tasks rely on these exact names): `export const PHASE_ORDER: Activity["phase"][]`, `export type Involvement = "Accountable" | "Responsible" | "Accountable | Responsible"`, `export function involvementOf(activity: Activity, roleId: string): Involvement | null`.

- [x] **Step 1: Write the failing test**

Add to the bottom of `tests/unit/ops-catalog/views/role-manual.test.ts`:

```ts
import {
  renderRoleManual,
  generateAllRoleManuals,
  involvementOf,
  PHASE_ORDER,
} from "../../../../src/lib/ops-catalog/views/role-manual";

describe("shared exports for the training-deck view", () => {
  it("exports PHASE_ORDER starting with pre_day and ending with post_day", () => {
    expect(PHASE_ORDER[0]).toBe("pre_day");
    expect(PHASE_ORDER[PHASE_ORDER.length - 1]).toBe("post_day");
  });

  it("exports involvementOf with the same matching semantics used internally", () => {
    const catalog = buildInlineCatalog();
    const rainout = catalog.activities.find((a) => a.id === fixtureIds.activities.rainout)!;
    expect(involvementOf(rainout, fixtureIds.roles.venueManager)).toBe(
      "Accountable | Responsible",
    );
    expect(involvementOf(rainout, fixtureIds.roles.parent)).toBeNull();
  });
});
```

(This adds a second `import` block referencing the same test file's existing `buildInlineCatalog`/`fixtureIds` import — merge it into the existing import statement at the top of the file rather than duplicating the import line.)

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run --config vitest.config.ts --project unit tests/unit/ops-catalog/views/role-manual.test.ts`
Expected: FAIL — `involvementOf` and `PHASE_ORDER` are not exported members of `role-manual.ts`.

- [x] **Step 3: Export the helpers (no behavior change)**

In `src/lib/ops-catalog/views/role-manual.ts`, change:

```ts
const PHASE_ORDER: Activity["phase"][] = [
```

to:

```ts
export const PHASE_ORDER: Activity["phase"][] = [
```

Change:

```ts
type Involvement = "Accountable" | "Responsible" | "Accountable | Responsible";
```

to:

```ts
export type Involvement = "Accountable" | "Responsible" | "Accountable | Responsible";
```

Change:

```ts
function involvementOf(activity: Activity, roleId: string): Involvement | null {
```

to:

```ts
export function involvementOf(activity: Activity, roleId: string): Involvement | null {
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run --config vitest.config.ts --project unit tests/unit/ops-catalog/views/role-manual.test.ts`
Expected: PASS — all tests in the file, including the two new ones.

- [x] **Step 5: Commit**

```bash
git add src/lib/ops-catalog/views/role-manual.ts tests/unit/ops-catalog/views/role-manual.test.ts
git commit -m "refactor(ops-catalog): export phase/involvement helpers for reuse by training-deck view"
```

---

### Task 2: Core helpers + deck shell + title slide

**Files:**
- Create: `src/lib/ops-catalog/views/training-deck.ts`
- Create: `tests/unit/ops-catalog/views/training-deck.test.ts`

**Interfaces:**
- Consumes: `PHASE_ORDER`, `Involvement`, `involvementOf` from `./role-manual` (Task 1); `Catalog` from `../loader`; `Activity` from `../types/activity`.
- Produces (later tasks rely on these exact names/types):
  - `export interface TrainingDeckOptions { intro?: string; screenshots?: Map<string, string>; }`
  - `export function renderTrainingDeck(catalog: Catalog, roleId: string, opts?: TrainingDeckOptions): string`
  - Internal (used by later tasks in the same file, not exported): `escapeHtml`, `activitySlug`, `SCREENSHOT_RELATIVE_PREFIX`, `screenshotSlotHtml`, `renderDeckShell`.

- [x] **Step 1: Write the failing test**

Create `tests/unit/ops-catalog/views/training-deck.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { renderTrainingDeck } from "../../../../src/lib/ops-catalog/views/training-deck";
import { buildInlineCatalog, fixtureIds } from "../fixtures/inline-catalog";

describe("renderTrainingDeck", () => {
  it("renders a self-contained HTML deck with a title slide for the role", () => {
    const html = renderTrainingDeck(buildInlineCatalog(), fixtureIds.roles.venueManager);

    expect(html).toMatch(/^<!doctype html>/);
    expect(html).toContain("<html lang=\"en\">");
    expect(html).toContain("<title>Venue Manager — Training Deck</title>");
    expect(html).toContain("<h1>Venue Manager</h1>");
    expect(html).toContain("Day-of operational lead at the venue.");
    // No external network dependency.
    expect(html).not.toContain("https://fonts.googleapis.com");
    expect(html).not.toContain("<link");
  });

  it("has slide navigation and print CSS baked into the shell", () => {
    const html = renderTrainingDeck(buildInlineCatalog(), fixtureIds.roles.venueManager);

    expect(html).toContain("class=\"slide\"");
    expect(html).toContain("ArrowRight");
    expect(html).toContain("ArrowLeft");
    expect(html).toMatch(/@media print/);
  });

  it("throws on an unknown roleId", () => {
    expect(() =>
      renderTrainingDeck(buildInlineCatalog(), "role.does_not_exist"),
    ).toThrow(/Unknown role/);
  });

  it("escapes HTML-significant characters in role name/description", () => {
    const catalog = buildInlineCatalog();
    catalog.roles = catalog.roles.map((r) =>
      r.id === fixtureIds.roles.venueManager
        ? { ...r, description: "Handles <script> & \"quotes\"" }
        : r,
    );
    const html = renderTrainingDeck(catalog, fixtureIds.roles.venueManager);
    expect(html).toContain("Handles &lt;script&gt; &amp; &quot;quotes&quot;");
    expect(html).not.toContain("<script>");
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run --config vitest.config.ts --project unit tests/unit/ops-catalog/views/training-deck.test.ts`
Expected: FAIL — cannot find module `src/lib/ops-catalog/views/training-deck.ts`.

- [x] **Step 3: Implement the shell + title slide**

Create `src/lib/ops-catalog/views/training-deck.ts`:

```ts
// Training deck view — renders a self-contained HTML slide deck per worker
// role from the ops catalog. Reuses role-manual.ts's phase/involvement
// matching but presents activities as slides instead of markdown sections,
// and adds deck-only sections (checklists, safety/escalation rollup, "your
// tools" portal pages, a help slide). See the Phase 1 plan's Design
// Decisions for why decks are NOT skipped for hand_authored roles, unlike
// generateAllRoleManuals.

import type { Catalog } from "../loader";
import type { Activity } from "../types/activity";
import { PHASE_ORDER, involvementOf, type Involvement } from "./role-manual";

// ---------------------------------------------------------------------------
// Small pure helpers
// ---------------------------------------------------------------------------

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function activitySlug(activityId: string): string {
  return activityId.replace(/^act\./, "");
}

// Deck output always lives at docs/operations/artifacts/training/role.<id>.deck.html.
// Phase 2's walkthrough screenshots land at the repo-root training/screenshots/<role>/
// directory (gitignored build artifacts, not docs content) — four directory levels up
// from the deck's own directory. If the deck output path ever moves, update this too.
const SCREENSHOT_RELATIVE_PREFIX = "../../../../training/screenshots";

function screenshotSlotHtml(
  roleId: string,
  slug: string,
  screenshots: Map<string, string> | undefined,
): string {
  const embedded = screenshots?.get(slug);
  if (embedded) {
    return `<div class="screenshot-frame"><img class="screenshot" src="${embedded}" alt="Screenshot: ${escapeHtml(slug)}" /></div>`;
  }
  const roleSlug = roleId.replace(/^role\./, "");
  const relPath = `${SCREENSHOT_RELATIVE_PREFIX}/${roleSlug}/${slug}.png`;
  return `<div class="screenshot-frame"><img class="screenshot" src="${relPath}" alt="Screenshot: ${escapeHtml(slug)}" onerror="this.parentElement.classList.add('screenshot-missing')" /></div>`;
}

// ---------------------------------------------------------------------------
// Deck shell: design tokens (copied from src/styles/globals.css — decks are
// standalone files, so tokens are copied, not imported), nav script, print CSS.
// ---------------------------------------------------------------------------

const DECK_CSS = `
  :root {
    --cream: oklch(0.972 0.008 80);
    --cream-2: oklch(0.955 0.012 78);
    --cream-3: oklch(0.935 0.018 76);
    --ink: oklch(0.18 0.008 260);
    --ink-2: oklch(0.26 0.012 260);
    --ink-muted: oklch(0.42 0.01 260);
    --navy: oklch(0.24 0.06 260);
    --navy-deep: oklch(0.18 0.07 262);
    --primary: oklch(0.66 0.21 35);
    --ochre: oklch(0.75 0.12 75);
    --sage: oklch(0.52 0.08 155);
    --paper: oklch(0.99 0.003 80);
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: var(--cream);
    color: var(--ink);
    font-family: "IBM Plex Sans", -apple-system, "Segoe UI", sans-serif;
  }
  h1, h2 {
    font-family: "Newsreader", Georgia, "Times New Roman", serif;
    font-style: italic;
    color: var(--navy-deep);
  }
  code {
    font-family: "IBM Plex Mono", "SF Mono", Consolas, monospace;
    background: var(--cream-2);
    padding: 0.1em 0.4em;
    border-radius: 3px;
  }
  .slide {
    display: none;
    min-height: 100vh;
    padding: 8vh 10vw;
    flex-direction: column;
    justify-content: center;
  }
  .slide.active { display: flex; }
  .slide-kicker {
    color: var(--ink-muted);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-size: 0.8rem;
  }
  .subtitle {
    color: var(--primary);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.15em;
  }
  .nav-controls {
    position: fixed;
    bottom: 1.5rem;
    right: 1.5rem;
    display: flex;
    gap: 0.5rem;
  }
  .nav-controls button {
    background: var(--navy);
    color: var(--cream);
    border: none;
    border-radius: 4px;
    padding: 0.5rem 1rem;
    cursor: pointer;
    font-family: "IBM Plex Sans", sans-serif;
  }
  .progress {
    position: fixed;
    bottom: 1.5rem;
    left: 1.5rem;
    color: var(--ink-muted);
    font-size: 0.85rem;
  }
  .screenshot-frame { margin-top: 1.5rem; }
  .screenshot-frame img {
    max-width: 100%;
    border: 1px solid var(--cream-3);
    border-radius: 6px;
  }
  .screenshot-frame.screenshot-missing { display: none; }
  .checklist li, .phase-overview li, .escalation-list li { margin-bottom: 0.4rem; }
  .empty-note { color: var(--ink-muted); font-style: italic; }
  .tools-table { border-collapse: collapse; width: 100%; }
  .tools-table td {
    border-bottom: 1px solid var(--cream-3);
    padding: 0.5rem 0.75rem;
    text-align: left;
    vertical-align: top;
  }
  @media print {
    .nav-controls, .progress { display: none; }
    .slide {
      display: flex !important;
      page-break-after: always;
      min-height: 0;
      height: 100vh;
    }
  }
`;

const NAV_SCRIPT = `
  (function () {
    var slides = Array.prototype.slice.call(document.querySelectorAll(".slide"));
    var index = 0;
    var progressEl = document.querySelector(".progress");
    function render() {
      slides.forEach(function (slide, i) {
        slide.classList.toggle("active", i === index);
      });
      if (progressEl) progressEl.textContent = (index + 1) + " / " + slides.length;
    }
    function go(delta) {
      index = Math.max(0, Math.min(slides.length - 1, index + delta));
      render();
    }
    document.addEventListener("keydown", function (e) {
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
    });
    var prevBtn = document.querySelector("[data-nav='prev']");
    var nextBtn = document.querySelector("[data-nav='next']");
    if (prevBtn) prevBtn.addEventListener("click", function () { go(-1); });
    if (nextBtn) nextBtn.addEventListener("click", function () { go(1); });
    render();
  })();
`;

function renderDeckShell(role: Catalog["roles"][number], slideBodies: string[]): string {
  const slidesHtml = slideBodies
    .map((body, i) => `<section class="slide" data-index="${i}">${body}</section>`)
    .join("\n");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(role.name)} — Training Deck</title>
<style>${DECK_CSS}</style>
</head>
<body>
${slidesHtml}
<div class="nav-controls">
  <button type="button" data-nav="prev">&larr; Prev</button>
  <button type="button" data-nav="next">Next &rarr;</button>
</div>
<div class="progress"></div>
<script>${NAV_SCRIPT}</script>
</body>
</html>
`;
}

function renderTitleSlide(role: Catalog["roles"][number]): string {
  return `
    <h1>${escapeHtml(role.name)}</h1>
    <p class="subtitle">Training deck</p>
    <p class="role-description">${escapeHtml(role.description.trim())}</p>
  `.trim();
}

export interface TrainingDeckOptions {
  intro?: string;
  screenshots?: Map<string, string>;
}

export function renderTrainingDeck(
  catalog: Catalog,
  roleId: string,
  opts: TrainingDeckOptions = {},
): string {
  const role = catalog.roles.find((r) => r.id === roleId);
  if (!role) {
    throw new Error(`Unknown role "${roleId}"`);
  }

  const slides: string[] = [];
  slides.push(renderTitleSlide(role));

  return renderDeckShell(role, slides);
}
```

Note: `PHASE_ORDER`/`involvementOf`/`Activity` are imported now but not yet used — Task 3 wires them in. This is intentional (the import line for Task 3 is already correct here) but will make `tsc`/eslint flag unused imports until Task 3 lands; that's fine mid-plan since each task's own test run is what gates it, not a global lint pass (the plan's final Task 10 runs `tsc --noEmit` once everything is wired).

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run --config vitest.config.ts --project unit tests/unit/ops-catalog/views/training-deck.test.ts`
Expected: PASS — all 4 tests.

- [x] **Step 5: Commit**

```bash
git add src/lib/ops-catalog/views/training-deck.ts tests/unit/ops-catalog/views/training-deck.test.ts
git commit -m "feat(ops-catalog): training deck shell + title slide"
```

---

### Task 3: "Your day" phase overview + per-activity detail slides (with screenshot slots)

**Files:**
- Modify: `src/lib/ops-catalog/views/training-deck.ts`
- Modify: `tests/unit/ops-catalog/views/training-deck.test.ts`

**Interfaces:**
- Consumes: `TrainingDeckOptions.screenshots` (Task 2), `PHASE_ORDER`/`involvementOf`/`Involvement` (Task 1).
- Produces: internal `MatchedActivity`, `matchActivities(catalog, roleId)`, `renderPhaseOverviewSlide`, `renderActivitySlide` — used by Task 4-6's slide assembly and by `generateAllTrainingDecks` (Task 7).

- [x] **Step 1: Write the failing test**

Add to `tests/unit/ops-catalog/views/training-deck.test.ts`:

```ts
describe("renderTrainingDeck — your day + activity slides", () => {
  it("includes a phase-overview slide and per-activity detail slides for matched activities", () => {
    const html = renderTrainingDeck(buildInlineCatalog(), fixtureIds.roles.venueManager);

    // Phase overview headings (day_setup comes before pre_game in PHASE_ORDER).
    expect(html).toMatch(/Your day: day setup.*Your day: pre game/s);
    // Per-activity detail content.
    expect(html).toContain("Rainout decision");
    expect(html).toContain("Accountable | Responsible");
    expect(html).toContain("Weather/field condition within 2h of kickoff suggests cancellation");
    expect(html).toContain("Open admin panel.");
    expect(html).toContain("Check weather.");
    expect(html).toContain("Decide.");
  });

  it("excludes activities the role has no involvement in", () => {
    const html = renderTrainingDeck(buildInlineCatalog(), fixtureIds.roles.parent);
    expect(html).not.toContain("Rainout decision");
    expect(html).not.toContain("Field setup");
  });

  it("emits a graceful-degrade screenshot slot by default (no opts.screenshots)", () => {
    const html = renderTrainingDeck(buildInlineCatalog(), fixtureIds.roles.venueManager);
    expect(html).toContain(
      "../../../../training/screenshots/venue_manager/rainout_decision.png",
    );
    expect(html).toContain("this.parentElement.classList.add('screenshot-missing')");
  });

  it("embeds a data URI screenshot when opts.screenshots has a matching slug", () => {
    const screenshots = new Map([["rainout_decision", "data:image/png;base64,AAAA"]]);
    const html = renderTrainingDeck(buildInlineCatalog(), fixtureIds.roles.venueManager, {
      screenshots,
    });
    expect(html).toContain('src="data:image/png;base64,AAAA"');
    expect(html).not.toContain(
      "../../../../training/screenshots/venue_manager/rainout_decision.png",
    );
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run --config vitest.config.ts --project unit tests/unit/ops-catalog/views/training-deck.test.ts`
Expected: FAIL — phase-overview and activity-detail content is missing (only the title slide exists so far).

- [x] **Step 3: Implement phase/activity slide rendering**

In `src/lib/ops-catalog/views/training-deck.ts`, add (after `renderTitleSlide`, before `export interface TrainingDeckOptions`):

```ts
interface MatchedActivity {
  activity: Activity;
  involvement: Involvement;
}

function matchActivities(catalog: Catalog, roleId: string): MatchedActivity[] {
  const matched: MatchedActivity[] = [];
  for (const activity of catalog.activities) {
    const involvement = involvementOf(activity, roleId);
    if (involvement) matched.push({ activity, involvement });
  }
  // Sort by id for determinism independent of catalog load/file order.
  matched.sort((a, b) => a.activity.id.localeCompare(b.activity.id));
  return matched;
}

function renderPhaseOverviewSlide(phase: Activity["phase"], entries: MatchedActivity[]): string {
  const items = entries
    .map(
      ({ activity, involvement }) =>
        `<li>${escapeHtml(activity.name)} — <em>${escapeHtml(involvement)}</em></li>`,
    )
    .join("");
  return `
    <h2>Your day: ${escapeHtml(phase.replace(/_/g, " "))}</h2>
    <ul class="phase-overview">${items}</ul>
  `.trim();
}

function sopBodyToBullets(sopBody: string): string[] {
  return sopBody
    .trim()
    .split("\n")
    .map((line) => line.replace(/^\d+\.\s*/, "").trim())
    .filter((line) => line.length > 0);
}

function renderActivitySlide(
  roleId: string,
  activity: Activity,
  involvement: Involvement,
  screenshots: Map<string, string> | undefined,
): string {
  const bullets = sopBodyToBullets(activity.sop_body);
  const stepsHtml = bullets.map((b) => `<li>${escapeHtml(b)}</li>`).join("");
  const slug = activitySlug(activity.id);

  return `
    <h2>${escapeHtml(activity.name)}</h2>
    <p class="slide-kicker">${escapeHtml(involvement)} &middot; <code>${escapeHtml(activity.id)}</code></p>
    <div class="activity-meta">
      <p><strong>Trigger:</strong> ${escapeHtml(activity.trigger)}</p>
      <p><strong>Tracking:</strong> ${escapeHtml(activity.tracking_method)}</p>
      <p><strong>Escalation:</strong> ${escapeHtml(activity.escalation_path.trim())}</p>
    </div>
    <ol class="steps">${stepsHtml}</ol>
    ${screenshotSlotHtml(roleId, slug, screenshots)}
  `.trim();
}
```

Then update `renderTrainingDeck`'s body to wire these in:

```ts
export function renderTrainingDeck(
  catalog: Catalog,
  roleId: string,
  opts: TrainingDeckOptions = {},
): string {
  const role = catalog.roles.find((r) => r.id === roleId);
  if (!role) {
    throw new Error(`Unknown role "${roleId}"`);
  }

  const matched = matchActivities(catalog, roleId);
  const slides: string[] = [];
  slides.push(renderTitleSlide(role));

  for (const phase of PHASE_ORDER) {
    const entries = matched.filter((m) => m.activity.phase === phase);
    if (entries.length === 0) continue;
    slides.push(renderPhaseOverviewSlide(phase, entries));
    for (const { activity, involvement } of entries) {
      slides.push(renderActivitySlide(roleId, activity, involvement, opts.screenshots));
    }
  }

  return renderDeckShell(role, slides);
}
```

(Move the `export interface TrainingDeckOptions { ... }` declaration above `renderTrainingDeck` if it isn't already — it must be defined before use for readability, though TypeScript doesn't require declaration order for interfaces.)

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run --config vitest.config.ts --project unit tests/unit/ops-catalog/views/training-deck.test.ts`
Expected: PASS — all tests in the file.

- [x] **Step 5: Commit**

```bash
git add src/lib/ops-catalog/views/training-deck.ts tests/unit/ops-catalog/views/training-deck.test.ts
git commit -m "feat(ops-catalog): training deck phase-overview + per-activity slides with screenshot slots"
```

---

### Task 4: Checklist slides

**Files:**
- Modify: `src/lib/ops-catalog/views/training-deck.ts`
- Modify: `tests/unit/ops-catalog/views/training-deck.test.ts`

**Interfaces:**
- Consumes: `MatchedActivity[]` from `matchActivities` (Task 3); `catalog.artifacts: ArtifactTemplate[]`.
- Produces: internal `collectChecklistTemplateIds`, `renderChecklistSlide` — used by `renderTrainingDeck`.

- [x] **Step 1: Write the failing test**

Add to `tests/unit/ops-catalog/views/training-deck.test.ts`:

```ts
describe("renderTrainingDeck — checklist slides", () => {
  it("renders a checklist slide for each distinct checklist template the role's matched activities reference", () => {
    const html = renderTrainingDeck(buildInlineCatalog(), fixtureIds.roles.venueManager);
    // Field setup (day_setup) is tracking_method "checklist" -> chk.field_setup.
    expect(html).toContain("Checklist: chk.field_setup");
    expect(html).toContain("Cones placed");
  });

  it("does not render a checklist slide for activities tracked another way", () => {
    // Rainout decision is tracking_method "form", not "checklist" — the venue
    // manager's only checklist reference is field_setup, so there is exactly
    // one checklist slide, not one per matched activity.
    const html = renderTrainingDeck(buildInlineCatalog(), fixtureIds.roles.venueManager);
    const occurrences = html.split("Checklist: chk.field_setup").length - 1;
    expect(occurrences).toBe(1);
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run --config vitest.config.ts --project unit tests/unit/ops-catalog/views/training-deck.test.ts`
Expected: FAIL — no "Checklist: chk.field_setup" content exists yet.

- [x] **Step 3: Implement checklist slide rendering**

In `src/lib/ops-catalog/views/training-deck.ts`, add (after the activity-slide helpers):

```ts
function collectChecklistTemplateIds(matched: MatchedActivity[]): string[] {
  const ids = new Set<string>();
  for (const { activity } of matched) {
    if (activity.tracking_method !== "checklist") continue;
    const ta = activity.tracking_artifact as Record<string, unknown>;
    const templateId = typeof ta.template_id === "string" ? ta.template_id : undefined;
    if (templateId) ids.add(templateId);
  }
  return [...ids].sort();
}

function renderChecklistSlide(catalog: Catalog, templateId: string): string | null {
  const template = catalog.artifacts.find((a) => a.id === templateId);
  if (!template || template.kind !== "checklist") return null;
  const items = template.items.map((item) => `<li>${escapeHtml(item.label)}</li>`).join("");
  return `
    <h2>Checklist: ${escapeHtml(templateId)}</h2>
    <ul class="checklist">${items}</ul>
  `.trim();
}
```

Then extend `renderTrainingDeck`'s body (after the `for (const phase of PHASE_ORDER) { ... }` loop, before `return renderDeckShell(...)`):

```ts
  for (const templateId of collectChecklistTemplateIds(matched)) {
    const slide = renderChecklistSlide(catalog, templateId);
    if (slide) slides.push(slide);
  }

  return renderDeckShell(role, slides);
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run --config vitest.config.ts --project unit tests/unit/ops-catalog/views/training-deck.test.ts`
Expected: PASS — all tests in the file.

- [x] **Step 5: Commit**

```bash
git add src/lib/ops-catalog/views/training-deck.ts tests/unit/ops-catalog/views/training-deck.test.ts
git commit -m "feat(ops-catalog): training deck checklist slides"
```

---

### Task 5: Safety & escalation summary slide

**Files:**
- Modify: `src/lib/ops-catalog/views/training-deck.ts`
- Modify: `tests/unit/ops-catalog/views/training-deck.test.ts`

**Interfaces:**
- Consumes: `MatchedActivity[]`, `catalog.roles: Role[]`.
- Produces: internal `renderSafetySlide` — used by `renderTrainingDeck`.

- [ ] **Step 1: Write the failing test**

Add to `tests/unit/ops-catalog/views/training-deck.test.ts`:

```ts
describe("renderTrainingDeck — safety & escalation slide", () => {
  it("lists each matched activity's escalation path, deduplicated", () => {
    const html = renderTrainingDeck(buildInlineCatalog(), fixtureIds.roles.venueManager);
    expect(html).toContain("Safety &amp; escalation");
    expect(html).toContain("If Venue Manager unreachable, on-call Director makes call.");
    expect(html).toContain("Venue Manager radios assistant.");
  });

  it("resolves role.* mentions in escalation text to real role names", () => {
    // The fixture's escalation_path strings use human-readable names (e.g.
    // "Venue Manager"), not catalog role ids — real catalog activities do
    // embed literal "role.xxx" tokens (see docs/operations/catalog/activities/
    // act.ref_check_in.yaml's escalation_path for a real example). Mutate one
    // fixture activity's escalation_path to exercise that real-world shape
    // rather than asserting against text the fixture doesn't actually contain.
    const catalog = buildInlineCatalog();
    catalog.activities = catalog.activities.map((a) =>
      a.id === fixtureIds.activities.postGameReport
        ? { ...a, escalation_path: "If unresolved, escalate to role.venue_manager." }
        : a,
    );

    const html = renderTrainingDeck(catalog, fixtureIds.roles.coach);
    expect(html).toContain("You may need to escalate to:");
    expect(html).toContain("Venue Manager");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --config vitest.config.ts --project unit tests/unit/ops-catalog/views/training-deck.test.ts`
Expected: FAIL — no "Safety &amp; escalation" content exists yet.

- [ ] **Step 3: Implement the safety/escalation slide**

In `src/lib/ops-catalog/views/training-deck.ts`, add (after the checklist helpers):

```ts
function renderSafetySlide(catalog: Catalog, matched: MatchedActivity[]): string {
  const escalations = new Set<string>();
  const mentionedRoleIds = new Set<string>();
  const roleMentionRe = /role\.[a-z][a-z0-9_]*/g;

  for (const { activity } of matched) {
    const text = activity.escalation_path.trim();
    escalations.add(text);
    for (const m of text.matchAll(roleMentionRe)) {
      mentionedRoleIds.add(m[0]);
    }
  }

  const roleNames = [...mentionedRoleIds]
    .map((id) => catalog.roles.find((r) => r.id === id)?.name)
    .filter((name): name is string => Boolean(name))
    .sort();

  const escalationItems = [...escalations]
    .sort()
    .map((e) => `<li>${escapeHtml(e)}</li>`)
    .join("");
  const contactsHtml =
    roleNames.length > 0
      ? `<p><strong>You may need to escalate to:</strong> ${roleNames.map((n) => escapeHtml(n)).join(", ")}</p>`
      : "";

  return `
    <h2>Safety &amp; escalation</h2>
    <ul class="escalation-list">${escalationItems}</ul>
    ${contactsHtml}
  `.trim();
}
```

Then extend `renderTrainingDeck`'s body (after the checklist-slide loop, before `return renderDeckShell(...)`):

```ts
  slides.push(renderSafetySlide(catalog, matched));

  return renderDeckShell(role, slides);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run --config vitest.config.ts --project unit tests/unit/ops-catalog/views/training-deck.test.ts`
Expected: PASS — all tests in the file.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ops-catalog/views/training-deck.ts tests/unit/ops-catalog/views/training-deck.test.ts
git commit -m "feat(ops-catalog): training deck safety & escalation slide"
```

---

### Task 6: "Your tools" slide + help slide

**Files:**
- Modify: `src/lib/ops-catalog/views/training-deck.ts`
- Modify: `tests/unit/ops-catalog/views/training-deck.test.ts`

**Interfaces:**
- Consumes: `roleId: string`; `catalog.roles: Role[]` (for the help slide's director lookup).
- Produces: internal `PORTAL_PAGES`, `renderToolsSlide`, `renderHelpSlide` — used by `renderTrainingDeck`.

- [ ] **Step 1: Write the failing test**

Add to `tests/unit/ops-catalog/views/training-deck.test.ts`:

```ts
describe("renderTrainingDeck — your tools + help slides", () => {
  it("lists role-relevant portal pages for a role with known tooling", () => {
    const html = renderTrainingDeck(buildInlineCatalog(), fixtureIds.roles.venueManager);
    expect(html).toContain("Your tools");
    expect(html).toContain("/admin/venue");
  });

  it("lists the coach's /coach surfaces including practices and assessments", () => {
    const html = renderTrainingDeck(buildInlineCatalog(), fixtureIds.roles.coach);
    expect(html).toContain("/coach/practices");
    expect(html).toContain("/coach/assess/[playerId]");
  });

  it("gracefully degrades to an explicit no-tools note for a role with no PORTAL_PAGES entry", () => {
    const html = renderTrainingDeck(buildInlineCatalog(), fixtureIds.roles.parent);
    expect(html).toContain("No dedicated portal pages yet");
  });

  it("closes with a help slide naming the director as final escalation tier", () => {
    const catalog = buildInlineCatalog();
    catalog.roles = [
      ...catalog.roles,
      {
        id: "role.director",
        name: "Director",
        tier: "leadership",
        kind: "worker",
        description: "Oversight.",
        manual_target: "employee_manual",
      },
    ];
    const html = renderTrainingDeck(catalog, fixtureIds.roles.venueManager);
    expect(html).toContain("Where to get help");
    expect(html).toContain("Director is the final escalation tier");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --config vitest.config.ts --project unit tests/unit/ops-catalog/views/training-deck.test.ts`
Expected: FAIL — no "Your tools" or "Where to get help" content exists yet.

- [ ] **Step 3: Implement the tools + help slides**

In `src/lib/ops-catalog/views/training-deck.ts`, add (after the safety-slide helper):

```ts
interface PortalPage {
  path: string;
  description: string;
}

// Hand-curated against the real route tree in src/pages/ (see Design Decision
// 2 in the Phase 1 plan). Not derived from the catalog — nothing in the
// schema ties an activity to a UI route today.
const PORTAL_PAGES: Record<string, PortalPage[]> = {
  "role.coach": [
    { path: "/coach", description: "Dashboard — today at a glance, incl. your onboarding checklist while incomplete" },
    { path: "/coach/teams", description: "Your team assignments" },
    { path: "/coach/roster/[teamId]", description: "Team roster" },
    { path: "/coach/schedule", description: "Practices and games" },
    { path: "/coach/practices", description: "Practice planner — build and reuse session plans (sequences)" },
    { path: "/coach/attendance/[teamId]", description: "Attendance per session" },
    { path: "/coach/assessments", description: "Assessments due across your teams" },
    { path: "/coach/assess/[playerId]", description: "Record a player assessment" },
    { path: "/coach/messages", description: "Team messaging to families" },
    { path: "/coach/standings", description: "League standings" },
    { path: "/coach/resources", description: "Coaching guides by sport, domain, and skill" },
  ],
  "role.ref": [
    { path: "/referee", description: "Today's assigned matches — check in here" },
    { path: "/referee/matches/[gameId]", description: "Live score entry and final score attestation" },
    { path: "/referee/pay", description: "Your match pay history" },
  ],
  "role.venue_manager": [
    { path: "/admin/venue", description: "Venue command center — today's event-day overview" },
    { path: "/admin/venue/day/[date]", description: "Run-of-show for a specific event day" },
    { path: "/admin/venue/check-in", description: "Player/team check-in" },
    { path: "/admin/venue/walk-up", description: "Walk-on registration" },
    { path: "/admin/venue/rosters", description: "Team rosters for the day" },
    { path: "/admin/venue/reports", description: "End-of-day reports" },
  ],
  "role.front_of_house": [
    { path: "/admin/check-in", description: "Player/family check-in" },
    { path: "/admin/venue/walk-up", description: "Walk-on registration and payment" },
  ],
  "role.event_lead": [
    { path: "/admin/game-day/today", description: "Run-of-show for today's matches" },
    { path: "/admin/check-in", description: "Check-in support" },
  ],
  "role.photographer": [
    { path: "/media", description: "Media dashboard" },
    { path: "/media/queue", description: "Capture queue for today's assignments" },
    { path: "/media/jobs", description: "Your assigned media jobs" },
    { path: "/media/tag/[session_id]", description: "Tag captured media to players/teams" },
  ],
  "role.team_captain": [
    { path: "/team/[token]", description: "Your team's roster and conduct tools" },
  ],
  "role.director": [
    { path: "/admin", description: "Organization dashboard" },
    { path: "/admin/reports", description: "Cross-venue reporting" },
    { path: "/admin/curriculum", description: "Curriculum oversight" },
  ],
  "role.facilities": [],
};

function renderToolsSlide(roleId: string): string {
  const pages = PORTAL_PAGES[roleId] ?? [];
  if (pages.length === 0) {
    return `
      <h2>Your tools</h2>
      <p class="empty-note">No dedicated portal pages yet for this role — coordinate through your venue manager or director until one ships.</p>
    `.trim();
  }
  const rows = pages
    .map(
      (p) =>
        `<tr><td><code>${escapeHtml(p.path)}</code></td><td>${escapeHtml(p.description)}</td></tr>`,
    )
    .join("");
  return `
    <h2>Your tools</h2>
    <table class="tools-table"><tbody>${rows}</tbody></table>
  `.trim();
}

function renderHelpSlide(catalog: Catalog): string {
  const director = catalog.roles.find((r) => r.id === "role.director");
  const directorLine = director
    ? `${escapeHtml(director.name)} is the final escalation tier for anything unresolved.`
    : "Escalate through your standard chain for anything unresolved.";
  return `
    <h2>Where to get help</h2>
    <ol>
      <li>Check this deck's Safety &amp; escalation slide for your activity's specific chain.</li>
      <li>Escalate per that chain first — most issues have a named next step.</li>
      <li>${directorLine}</li>
    </ol>
  `.trim();
}
```

Then extend `renderTrainingDeck`'s body (after the safety slide, before `return renderDeckShell(...)`):

```ts
  slides.push(renderToolsSlide(roleId));
  slides.push(renderHelpSlide(catalog));

  return renderDeckShell(role, slides);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run --config vitest.config.ts --project unit tests/unit/ops-catalog/views/training-deck.test.ts`
Expected: PASS — all tests in the file.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ops-catalog/views/training-deck.ts tests/unit/ops-catalog/views/training-deck.test.ts
git commit -m "feat(ops-catalog): training deck your-tools + help slides"
```

---

### Task 7: `generateAllTrainingDecks` — role filtering, hand_authored NOT skipped, byte-stability

**Files:**
- Modify: `src/lib/ops-catalog/views/training-deck.ts`
- Modify: `tests/unit/ops-catalog/views/training-deck.test.ts`

**Interfaces:**
- Consumes: `renderTrainingDeck` (Tasks 2-6); `catalog.roles: Role[]`.
- Produces: `export function generateAllTrainingDecks(catalog: Catalog, optsByRole?: Record<string, TrainingDeckOptions>): Record<string, string>` — consumed by `scripts/ops-catalog/index.ts` in Task 9.

- [ ] **Step 1: Write the failing test**

Add to `tests/unit/ops-catalog/views/training-deck.test.ts`:

```ts
import { generateAllTrainingDecks } from "../../../../src/lib/ops-catalog/views/training-deck";
import type { Role } from "../../../../src/lib/ops-catalog/types/role";

describe("generateAllTrainingDecks", () => {
  it("returns one deck per worker role and excludes customer/system roles", () => {
    const all = generateAllTrainingDecks(buildInlineCatalog());
    expect(Object.keys(all).sort()).toEqual(
      [fixtureIds.roles.coach, fixtureIds.roles.venueManager].sort(),
    );
    expect(all[fixtureIds.roles.parent]).toBeUndefined();
  });

  it("does NOT skip hand_authored worker roles, unlike generateAllRoleManuals", () => {
    const catalog = buildInlineCatalog();
    const handAuthored: Role = {
      id: "role.team_captain",
      name: "Team Captain",
      tier: "field_side",
      kind: "worker",
      description: "Worker role whose manual is written by hand.",
      manual_target: "hand_authored",
    };
    const all = generateAllTrainingDecks({
      ...catalog,
      roles: [...catalog.roles, handAuthored],
    });
    expect(all["role.team_captain"]).toBeDefined();
    expect(all["role.team_captain"]).toContain("<h1>Team Captain</h1>");
    expect(Object.keys(all).sort()).toEqual(
      [fixtureIds.roles.coach, fixtureIds.roles.venueManager, "role.team_captain"].sort(),
    );
  });

  it("produces byte-identical output across repeated renders of the same input", () => {
    const catalog = buildInlineCatalog();
    const first = renderTrainingDeck(catalog, fixtureIds.roles.venueManager);
    const second = renderTrainingDeck(catalog, fixtureIds.roles.venueManager);
    expect(first).toBe(second);

    const allFirst = generateAllTrainingDecks(catalog);
    const allSecond = generateAllTrainingDecks(catalog);
    expect(allFirst).toEqual(allSecond);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --config vitest.config.ts --project unit tests/unit/ops-catalog/views/training-deck.test.ts`
Expected: FAIL — `generateAllTrainingDecks` is not exported.

- [ ] **Step 3: Implement `generateAllTrainingDecks`**

In `src/lib/ops-catalog/views/training-deck.ts`, add at the end of the file (after `renderTrainingDeck`):

```ts
export function generateAllTrainingDecks(
  catalog: Catalog,
  optsByRole: Record<string, TrainingDeckOptions> = {},
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const role of catalog.roles) {
    if (role.kind !== "worker") continue;
    out[role.id] = renderTrainingDeck(catalog, role.id, optsByRole[role.id] ?? {});
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run --config vitest.config.ts --project unit tests/unit/ops-catalog/views/training-deck.test.ts`
Expected: PASS — all tests in the file.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ops-catalog/views/training-deck.ts tests/unit/ops-catalog/views/training-deck.test.ts
git commit -m "feat(ops-catalog): generateAllTrainingDecks with byte-stability + hand_authored regression test"
```

---

### Task 8: Hand-authored `role.<id>.intro.md` composition

**Files:**
- Modify: `src/lib/ops-catalog/views/training-deck.ts`
- Modify: `tests/unit/ops-catalog/views/training-deck.test.ts`

**Interfaces:**
- Consumes: `TrainingDeckOptions.intro` (Task 2).
- Produces: internal `parseIntroSlides`, `mdBodyToHtml`, `inlineMarkdown` — wired into `renderTrainingDeck`.

- [ ] **Step 1: Write the failing test**

Add to `tests/unit/ops-catalog/views/training-deck.test.ts`:

```ts
describe("renderTrainingDeck — hand-authored intro composition", () => {
  const introMd = [
    "## Welcome to the crew",
    "",
    "You're joining a **fast-moving** team.",
    "",
    "- Read the manual first",
    "- Ask your venue manager for a walkthrough",
    "",
    "## What today looks like",
    "",
    "A quick tour of the day-of flow.",
  ].join("\n");

  it("inlines intro.md content as opening slides, before the your-day section", () => {
    const html = renderTrainingDeck(buildInlineCatalog(), fixtureIds.roles.venueManager, {
      intro: introMd,
    });

    expect(html).toMatch(/Welcome to the crew.*What today looks like.*Your day: day setup/s);
    expect(html).toContain("<strong>fast-moving</strong>");
    expect(html).toContain("<li>Read the manual first</li>");
  });

  it("renders a single 'Welcome' slide when intro.md has no ## headings", () => {
    const html = renderTrainingDeck(buildInlineCatalog(), fixtureIds.roles.venueManager, {
      intro: "Just a plain welcome paragraph, no headings.",
    });
    expect(html).toContain("<h2>Welcome</h2>");
    expect(html).toContain("Just a plain welcome paragraph, no headings.");
  });

  it("renders no intro slides when opts.intro is omitted", () => {
    const html = renderTrainingDeck(buildInlineCatalog(), fixtureIds.roles.venueManager);
    expect(html).not.toContain("Welcome to the crew");
  });

  it("composes intro slides for a hand_authored role via generateAllTrainingDecks", () => {
    const catalog = buildInlineCatalog();
    const handAuthored: Role = {
      id: "role.team_captain",
      name: "Team Captain",
      tier: "field_side",
      kind: "worker",
      description: "Worker role whose manual is written by hand.",
      manual_target: "hand_authored",
    };
    const all = generateAllTrainingDecks(
      { ...catalog, roles: [...catalog.roles, handAuthored] },
      { "role.team_captain": { intro: "## Captain's welcome\nYou run the roster now." } },
    );
    expect(all["role.team_captain"]).toContain("Captain&#39;s welcome");
    expect(all["role.team_captain"]).toContain("You run the roster now.");
  });
});
```

(Reuses the `Role` import already added in Task 7's test.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --config vitest.config.ts --project unit tests/unit/ops-catalog/views/training-deck.test.ts`
Expected: FAIL — `opts.intro` is accepted by the type but not rendered into any slide yet.

- [ ] **Step 3: Implement intro composition**

In `src/lib/ops-catalog/views/training-deck.ts`, add (after `activitySlug`, before `screenshotSlotHtml` — order doesn't matter functionally, but keep related helpers grouped):

```ts
// ---------------------------------------------------------------------------
// Minimal markdown-to-HTML for hand-authored intro.md content. Supports only
// what intro authors need: "## " slide-boundary headings, blank-line
// paragraphs, "- " bullet lists, and **bold** inline spans. Anything fancier
// belongs in the hand-authored role manuals, not intro slides.
// ---------------------------------------------------------------------------

function inlineMarkdown(escaped: string): string {
  return escaped.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
}

function mdBodyToHtml(body: string): string {
  const blocks = body
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter((b) => b.length > 0);

  return blocks
    .map((block) => {
      const lines = block.split("\n").map((l) => l.trim());
      const isList = lines.length > 0 && lines.every((l) => l.startsWith("- "));
      if (isList) {
        const items = lines
          .map((l) => `<li>${inlineMarkdown(escapeHtml(l.slice(2)))}</li>`)
          .join("");
        return `<ul>${items}</ul>`;
      }
      return `<p>${inlineMarkdown(escapeHtml(lines.join(" ")))}</p>`;
    })
    .join("\n");
}

interface IntroSlide {
  title: string;
  bodyHtml: string;
}

function parseIntroSlides(introMarkdown: string): IntroSlide[] {
  const normalized = introMarkdown.replace(/\r\n/g, "\n").trim();
  if (normalized.length === 0) return [];

  const headingRe = /^##\s+(.+)$/gm;
  const matches = [...normalized.matchAll(headingRe)];

  if (matches.length === 0) {
    return [{ title: "Welcome", bodyHtml: mdBodyToHtml(normalized) }];
  }

  const slides: IntroSlide[] = [];
  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const title = match[1].trim();
    const start = (match.index ?? 0) + match[0].length;
    const end = i + 1 < matches.length ? (matches[i + 1].index ?? normalized.length) : normalized.length;
    const body = normalized.slice(start, end).trim();
    slides.push({ title, bodyHtml: mdBodyToHtml(body) });
  }
  return slides;
}
```

Then update `renderTrainingDeck`'s body to compose intro slides right after the title slide:

```ts
  const matched = matchActivities(catalog, roleId);
  const slides: string[] = [];
  slides.push(renderTitleSlide(role));

  if (opts.intro) {
    for (const introSlide of parseIntroSlides(opts.intro)) {
      slides.push(`<h2>${escapeHtml(introSlide.title)}</h2>\n${introSlide.bodyHtml}`);
    }
  }

  for (const phase of PHASE_ORDER) {
```

(Only the `if (opts.intro) { ... }` block is new — it's inserted between the existing `slides.push(renderTitleSlide(role));` line and the existing `for (const phase of PHASE_ORDER) {` loop.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run --config vitest.config.ts --project unit tests/unit/ops-catalog/views/training-deck.test.ts`
Expected: PASS — all tests in the file.

- [ ] **Step 5: Run the full ops-catalog unit suite**

Run: `npx vitest run tests/unit/ops-catalog/`
Expected: PASS — every test file under `tests/unit/ops-catalog/`, including `role-manual.test.ts` and `training-deck.test.ts`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/ops-catalog/views/training-deck.ts tests/unit/ops-catalog/views/training-deck.test.ts
git commit -m "feat(ops-catalog): compose hand-authored intro.md as opening training deck slides"
```

---

### Task 9: Wire training decks into `scripts/ops-catalog/index.ts` + npm scripts + CI path fix

**Files:**
- Modify: `scripts/ops-catalog/index.ts:1-67` (imports + primary `render` branch)
- Modify: `package.json:33-34` (scripts block)
- Modify: `.github/workflows/ops-catalog.yml:8-23` (trigger `paths`)

**Interfaces:**
- Consumes: `generateAllTrainingDecks(catalog, optsByRole)` and `TrainingDeckOptions` from `../../src/lib/ops-catalog/views/training-deck` (Tasks 7-8).
- Produces: `docs/operations/artifacts/training/role.<id>.deck.html` files on disk; `npm run catalog:render` and `npm run catalog:render:embed` CLI entry points.

- [ ] **Step 1: Add the import**

In `scripts/ops-catalog/index.ts`, add to the import block at the top of the file:

```ts
import {
  generateAllTrainingDecks,
  type TrainingDeckOptions,
} from "../../src/lib/ops-catalog/views/training-deck";
```

- [ ] **Step 2: Extend the primary render branch to also write training decks**

In `scripts/ops-catalog/index.ts`, find this block inside the `render` command (the `if (!view) { ... }` branch):

```ts
    if (!view) {
      // Primary pipeline: write all worker role manuals + automation-backlog.json
      const manuals = generateAllRoleManuals(catalog);
      await fs.mkdir(path.join(ARTIFACTS_DIR, "manuals"), { recursive: true });
      for (const [roleId, md] of Object.entries(manuals)) {
        await fs.writeFile(path.join(ARTIFACTS_DIR, "manuals", `${roleId}.md`), md);
      }
      const backlog = generateAutomationBacklog(catalog);
      await fs.writeFile(
        path.join(ARTIFACTS_DIR, "automation-backlog.json"),
        JSON.stringify(backlog, null, 2) + "\n",
      );
      console.log(
        `Rendered ${Object.keys(manuals).length} role manuals + automation-backlog.json`,
      );
      return 0;
    }
```

Replace it with:

```ts
    if (!view) {
      // Primary pipeline: write all worker role manuals + automation-backlog.json
      // + training decks.
      const manuals = generateAllRoleManuals(catalog);
      await fs.mkdir(path.join(ARTIFACTS_DIR, "manuals"), { recursive: true });
      for (const [roleId, md] of Object.entries(manuals)) {
        await fs.writeFile(path.join(ARTIFACTS_DIR, "manuals", `${roleId}.md`), md);
      }
      const backlog = generateAutomationBacklog(catalog);
      await fs.writeFile(
        path.join(ARTIFACTS_DIR, "automation-backlog.json"),
        JSON.stringify(backlog, null, 2) + "\n",
      );

      const embed = args.includes("--embed");
      const trainingDir = path.join(ARTIFACTS_DIR, "training");
      await fs.mkdir(trainingDir, { recursive: true });

      const optsByRole: Record<string, TrainingDeckOptions> = {};
      for (const role of catalog.roles) {
        if (role.kind !== "worker") continue;

        const introPath = path.join(trainingDir, `${role.id}.intro.md`);
        let intro: string | undefined;
        try {
          intro = await fs.readFile(introPath, "utf8");
        } catch (err) {
          if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
        }

        let screenshots: Map<string, string> | undefined;
        if (embed) {
          screenshots = new Map();
          const roleSlug = role.id.replace(/^role\./, "");
          const shotDir = path.join(process.cwd(), "training/screenshots", roleSlug);
          let files: string[] = [];
          try {
            files = await fs.readdir(shotDir);
          } catch (err) {
            if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
          }
          for (const file of files) {
            if (!file.endsWith(".png")) continue;
            const slug = file.slice(0, -".png".length);
            const bytes = await fs.readFile(path.join(shotDir, file));
            screenshots.set(slug, `data:image/png;base64,${bytes.toString("base64")}`);
          }
        }

        optsByRole[role.id] = { intro, screenshots };
      }

      const decks = generateAllTrainingDecks(catalog, optsByRole);
      for (const [roleId, html] of Object.entries(decks)) {
        await fs.writeFile(path.join(trainingDir, `${roleId}.deck.html`), html);
      }

      console.log(
        `Rendered ${Object.keys(manuals).length} role manuals + automation-backlog.json + ${Object.keys(decks).length} training decks${embed ? " (embed mode)" : ""}`,
      );
      return 0;
    }
```

- [ ] **Step 3: Add the `--embed` npm script**

In `package.json`, in the `scripts` block, immediately after the existing line:

```json
    "catalog:render": "tsx scripts/ops-catalog/index.ts render",
```

add:

```json
    "catalog:render:embed": "tsx scripts/ops-catalog/index.ts render --embed",
```

- [ ] **Step 4: Fix the CI trigger-paths gap**

`.github/workflows/ops-catalog.yml`'s `paths:` filters (both `pull_request` and `push`) list `docs/operations/catalog/**`, `docs/operations/artifacts/**`, `scripts/ops-catalog/**`, `tests/unit/ops-catalog/**`, and the workflow file itself — but never `src/lib/ops-catalog/**`, the directory both `role-manual.ts` and the new `training-deck.ts` live in. A PR touching only a view file under `src/lib/ops-catalog/views/` would silently skip this workflow. Fix both `paths:` blocks by adding `"src/lib/ops-catalog/**"` as a new line alongside the existing four entries in each block (8 total additions — one per `pull_request` and `push` section).

In `.github/workflows/ops-catalog.yml`, in the `pull_request:` block, change:

```yaml
on:
  pull_request:
    paths:
      - "docs/operations/catalog/**"
      - "docs/operations/artifacts/**"
      - "scripts/ops-catalog/**"
      - "tests/unit/ops-catalog/**"
      - ".github/workflows/ops-catalog.yml"
```

to:

```yaml
on:
  pull_request:
    paths:
      - "docs/operations/catalog/**"
      - "docs/operations/artifacts/**"
      - "scripts/ops-catalog/**"
      - "src/lib/ops-catalog/**"
      - "tests/unit/ops-catalog/**"
      - ".github/workflows/ops-catalog.yml"
```

And in the `push:` block, change:

```yaml
  push:
    branches: [main]
    paths:
      - "docs/operations/catalog/**"
      - "docs/operations/artifacts/**"
      - "scripts/ops-catalog/**"
      - "tests/unit/ops-catalog/**"
      - ".github/workflows/ops-catalog.yml"
```

to:

```yaml
  push:
    branches: [main]
    paths:
      - "docs/operations/catalog/**"
      - "docs/operations/artifacts/**"
      - "scripts/ops-catalog/**"
      - "src/lib/ops-catalog/**"
      - "tests/unit/ops-catalog/**"
      - ".github/workflows/ops-catalog.yml"
```

- [ ] **Step 5: Run the CLI to confirm decks are produced**

Run: `npm run catalog:render`
Expected: stdout ends with a line like:

```
Rendered 7 role manuals + automation-backlog.json + 9 training decks
```

(7 manuals: `director`, `event_lead`, `facilities`, `front_of_house`, `photographer`, `ref`, `venue_manager` are the non-`hand_authored` worker roles — `generateAllRoleManuals` skips `role.coach` and `role.team_captain` since those two manuals are hand-authored; this plan does not change manual generation, so verify the printed count matches whatever it emits today rather than trusting this number blindly. 9 training decks: all 9 worker roles — `coach`, `director`, `event_lead`, `facilities`, `front_of_house`, `photographer`, `ref`, `team_captain`, `venue_manager` — decks are NOT skipped for the hand_authored pair, per Design Decision 1.)

Then confirm the files exist:

Run: `ls docs/operations/artifacts/training/`
Expected: 9 files named `role.<id>.deck.html`, one per worker role.

- [ ] **Step 6: Run typecheck**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 7: Commit**

```bash
git add scripts/ops-catalog/index.ts package.json .github/workflows/ops-catalog.yml
git commit -m "feat(ops-catalog): wire training decks into catalog:render, add --embed mode, fix CI trigger-paths gap"
```

---

### Task 10: End-to-end verification — idempotency, full test suite, artifact commit

**Files:**
- Create (generated, not hand-authored): `docs/operations/artifacts/training/role.coach.deck.html`, `role.director.deck.html`, `role.event_lead.deck.html`, `role.facilities.deck.html`, `role.front_of_house.deck.html`, `role.photographer.deck.html`, `role.ref.deck.html`, `role.team_captain.deck.html`, `role.venue_manager.deck.html`

**Interfaces:**
- Consumes: everything from Tasks 1-9.
- Produces: nothing new — this task only verifies and commits the generated artifacts.

- [ ] **Step 1: Run the full ops-catalog unit test suite**

Run: `npx vitest run tests/unit/ops-catalog/`
Expected: PASS — every test file, including `role-manual.test.ts` and `training-deck.test.ts`.

- [ ] **Step 2: Run catalog validation**

Run: `npm run catalog:validate`
Expected: `Validation passed: N warning(s)` (same warning count as before this plan — no new validation errors/warnings were introduced, since no catalog YAML changed).

- [ ] **Step 3: Render once and check the generated decks open and print cleanly**

Run: `npm run catalog:render`
Expected: same summary line as Task 9 Step 5.

Open `docs/operations/artifacts/training/role.venue_manager.deck.html` directly in a browser (e.g. `open docs/operations/artifacts/training/role.venue_manager.deck.html` on macOS) and confirm:
- The title slide shows "Venue Manager" and its description.
- Pressing the right-arrow key or clicking "Next →" advances to the next slide.
- Print preview (Cmd+P) shows one slide per page with the nav buttons and progress indicator hidden.

- [ ] **Step 4: Confirm re-render is a no-op (idempotency / byte-stability)**

Run:
```bash
npm run catalog:render
git status --porcelain docs/operations/artifacts/
```
Expected: no output from `git status --porcelain` — the second render produced byte-identical files to the first (or to whatever was already committed once Step 6 below commits them), matching the CI up-to-date check's exact assertion.

- [ ] **Step 5: Confirm the `--embed` mode runs cleanly with no screenshots present**

Run: `npm run catalog:render:embed`
Expected: same summary line, with `(embed mode)` appended; no errors even though `training/screenshots/` doesn't exist yet in this repo (Phase 2 not built) — the CLI's `ENOENT`-tolerant `fs.readdir` catch handles this.

Then re-render in normal mode and confirm the working tree is clean again (embed mode must not have written different bytes than the checked-in non-embed decks would, once committed — since no screenshots exist, embed and non-embed output should be byte-identical here):

```bash
npm run catalog:render
git status --porcelain docs/operations/artifacts/
```
Expected: no output.

- [ ] **Step 6: Stage and commit the generated artifacts**

```bash
git add docs/operations/artifacts/training/
git status --porcelain
```
Expected: 9 new files listed, all under `docs/operations/artifacts/training/role.*.deck.html`.

```bash
git commit -m "chore(ops-catalog): render initial training decks for all worker roles"
```

- [ ] **Step 7: Final typecheck + full ops-catalog CI-equivalent sequence**

Run, in order:
```bash
npx tsc --noEmit
npm run catalog:validate
npx vitest run tests/unit/ops-catalog/
npm run catalog:render
git status --porcelain docs/operations/artifacts/
```
Expected: zero type errors; validation passes; all unit tests pass; render succeeds; final `git status --porcelain` is empty (artifacts already match what's committed). This is the same sequence `.github/workflows/ops-catalog.yml` runs on `pull_request`/`push` — a clean local run here means the PR's `ops-catalog` CI job will pass.

---

## Acceptance check (from the spec)

- `npm run catalog:render` emits decks for all worker roles — Task 9/10.
- Coach/referee/venue-manager decks open from disk, navigate, and print cleanly — Task 10 Step 3.
- Unit tests green — Tasks 1-8, verified again in Task 10 Step 1.
- Re-render is a no-op when the catalog is unchanged — Task 10 Steps 4-5.
- ops-catalog CI check passes — Task 10 Step 7 reproduces the CI job locally.
