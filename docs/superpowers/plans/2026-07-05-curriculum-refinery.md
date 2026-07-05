# Curriculum Refinery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `/curriculum-refinery` skill (audit / research / refine / products modes), ship the minibook print-readiness pass, the KDP book pipeline, and the prod loader-sync workflow.

**Architecture:** The skill is markdown (a dispatcher SKILL.md + one reference file per mode) that orchestrates agents over the version-controlled content tree; supporting code is small and testable — a pure PDF-profile module consumed by the render script, a provenance util, one print stylesheet + pilot book page, and one GitHub Actions workflow. Content/product changes always land as PRs; audit/research reports commit directly (docs-only).

**Tech Stack:** Astro 5 (prerendered book pages), Playwright print-to-PDF, paged.js (page numbers/running heads — Chromium doesn't implement `@page` margin boxes natively), Vitest, GitHub Actions.

**Execution note:** ≥3 tasks → use a worktree (`superpowers:using-git-worktrees`), branch `feat/curriculum-refinery`.

## Global Constraints

- The skill never touches DB schema, migrations, or non-content/product code.
- `refine`/`products` end in a branch + PR; `audit`/`research` write only files under `docs/curriculum/` and commit directly to main (docs-only commits skip deploy-affecting workflows).
- Content counts may only grow or hold; removals need an explicit directive + PR-body warning that the loader cannot delete.
- All generated content passes `validateRegistry` + `npx vitest run tests/unit/curriculum` before a PR opens.
- Research claims require citations (URL); uncited claims don't become directives. YouTube findings are adapted, never copied verbatim.
- Loader sync: `--org aspire-sports`, `ALLOW_CURRICULUM_SEED=yes ALLOW_PROD_AUDIT=yes`, never `--steal-guidance`; secret name is `DATABASE_URL` (same as migrate-prod.yml).
- KDP trim defaults: 6×9 in (prose guides), 8.5×11 in (activity books). KDP white-paper spine width = pages × 0.002252 in.
- Minibook queue: exactly these 15 slugs (5 soccer, 5 basketball, 5 hockey): `soccer-passing, soccer-dribbling, soccer-shooting, soccer-defending, soccer-game-intelligence, basketball-ball-handling, basketball-defending, basketball-game-intelligence, basketball-passing, basketball-shooting, hockey-defending, hockey-passing, hockey-shooting, hockey-skating, hockey-stickhandling`.
- Repo conventions bind: `npx tsc --noEmit` clean; commit trailer `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

### Task 1: PDF profile module + render-script overhaul

**Files:**
- Create: `scripts/pdf-profiles.ts`
- Modify: `scripts/generate-minibook-pdfs.ts`
- Test: `tests/unit/pdf/pdf-profiles.test.ts`

**Interfaces:**
- Produces: `PROFILES` record with keys `letter | kdp-6x9 | kdp-8.5x11`; `profileFor(name: string): PdfProfile` (throws on unknown); `spineWidthInches(pageCount: number): number`; `PdfProfile = { name: string; pdfOptions: Parameters<Page["pdf"]>[0]; waitForPaged: boolean }`. CLI: `npx tsx scripts/generate-minibook-pdfs.ts [--slugs a,b] [--profile <name>] [--book <slug>]`.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/unit/pdf/pdf-profiles.test.ts
import { describe, expect, it } from "vitest";
import { PROFILES, profileFor, spineWidthInches } from "../../../scripts/pdf-profiles";

describe("pdf profiles", () => {
  it("letter profile keeps the existing Letter format", () => {
    expect(PROFILES["letter"].pdfOptions.format).toBe("Letter");
    expect(PROFILES["letter"].waitForPaged).toBe(false);
  });
  it("kdp-6x9 uses explicit trim size, CSS page size, and paged.js", () => {
    const p = profileFor("kdp-6x9");
    expect(p.pdfOptions.width).toBe("6in");
    expect(p.pdfOptions.height).toBe("9in");
    expect(p.pdfOptions.preferCSSPageSize).toBe(true);
    expect(p.waitForPaged).toBe(true);
  });
  it("throws on unknown profile", () => {
    expect(() => profileFor("a4")).toThrow(/unknown pdf profile/i);
  });
  it("computes KDP white-paper spine width", () => {
    expect(spineWidthInches(120)).toBeCloseTo(0.27024, 5);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run tests/unit/pdf` → FAIL (module not found).

- [ ] **Step 3: Implement `scripts/pdf-profiles.ts`**

```ts
import type { Page } from "@playwright/test";

export interface PdfProfile {
  name: string;
  pdfOptions: NonNullable<Parameters<Page["pdf"]>[0]>;
  /** paged.js paginates in-browser; the renderer must wait for it. */
  waitForPaged: boolean;
}

/** KDP white paper: 0.002252 in per page. */
export function spineWidthInches(pageCount: number): number {
  return pageCount * 0.002252;
}

export const PROFILES: Record<string, PdfProfile> = {
  letter: {
    name: "letter",
    pdfOptions: {
      format: "Letter",
      printBackground: true,
      margin: { top: "0.5in", right: "0.5in", bottom: "0.5in", left: "0.5in" },
    },
    waitForPaged: false,
  },
  "kdp-6x9": {
    name: "kdp-6x9",
    pdfOptions: { width: "6in", height: "9in", printBackground: true, preferCSSPageSize: true },
    waitForPaged: true,
  },
  "kdp-8.5x11": {
    name: "kdp-8.5x11",
    pdfOptions: { width: "8.5in", height: "11in", printBackground: true, preferCSSPageSize: true },
    waitForPaged: true,
  },
};

export function profileFor(name: string): PdfProfile {
  const p = PROFILES[name];
  if (!p) throw new Error(`unknown pdf profile "${name}" (have: ${Object.keys(PROFILES).join(", ")})`);
  return p;
}
```

- [ ] **Step 4: Tests pass** — `npx vitest run tests/unit/pdf` → 4 passed.

- [ ] **Step 5: Overhaul `scripts/generate-minibook-pdfs.ts`**

Replace the 5-slug list and inline options with: the 15-slug `MINIBOOK_SLUGS` list from Global Constraints; arg parsing for `--slugs`, `--profile` (default `letter`), `--book <slug>` (renders `/books/<slug>` with default profile `kdp-6x9` into `pdfs/books/<slug>-interior.pdf`); profile-driven `page.pdf(profile.pdfOptions)`; when `profile.waitForPaged`, `await page.waitForFunction(() => (window as any).__pagedDone === true, { timeout: 120_000 })` after `goto`; after a `--book` render, reopen the PDF with `pdf-parse`-free approach — count pages by spawning Playwright again is overkill: instead print page count from paged.js before printing (`await page.evaluate(() => (window as any).__pagedPageCount)`) and log `pages: N, spine: ${spineWidthInches(N).toFixed(4)}in`. Keep `MINIBOOK_BASE_URL` env and the existing goto/emulateMedia flow for minibooks.

- [ ] **Step 6: Verify manually** — with dev server up: `npx tsx scripts/generate-minibook-pdfs.ts --slugs soccer-passing` → writes `pdfs/minibooks/soccer-passing.pdf`. `--profile a4` → exits with the unknown-profile error. `npx tsc --noEmit` clean.

- [ ] **Step 7: Commit** — `feat(refinery): pdf profile module + render script overhaul`

---

### Task 2: Minibook print-readiness pass (all 15 titles)

**Files:**
- Modify (as defects require): `src/data/minibooks/*.ts`, `src/styles/minibook.css`, `src/styles/print-guide.css`
- Create: `docs/curriculum/audits/2026-07-05-minibook-print-qa.md`

**Interfaces:**
- Consumes: Task 1's script (`--slugs`, default letter profile).

- [ ] **Step 1: Render all 15** — dev server up (`npm run dev:bws`), then `npx tsx scripts/generate-minibook-pdfs.ts`. Expect 15 PDFs in `pdfs/minibooks/`.
- [ ] **Step 2: QA every PDF** — Read each PDF (the Read tool renders pages). Checklist per book, recorded in the QA report: (a) cover renders with title/sport; (b) no text overflow or clipped boxes; (c) no orphaned section headings at page bottoms; (d) page breaks don't split an activity/drill card; (e) all `_template.ts` sections present (meta, chapters, playerStories, coachWisdom) and non-empty; (f) images/logos resolve (no broken-image glyphs); (g) typography matches `src/data/minibooks/DESIGN-SYSTEM.md`.
- [ ] **Step 3: Fix defects** — data-file fixes for content defects; CSS fixes (e.g. `break-inside: avoid` on card containers, `break-after: avoid` on headings) for layout defects. CSS fixes must be re-checked against the already-clean soccer PDFs (no regressions).
- [ ] **Step 4: Re-render + re-QA until clean** — rerun the script; every book passes the checklist. Write `docs/curriculum/audits/2026-07-05-minibook-print-qa.md`: per-book verdict table + defects found/fixed.
- [ ] **Step 5: Commit** — `fix(minibooks): print-readiness pass across all 15 titles` (include the QA report).

---

### Task 3: KDP book pipeline (book.css, provenance, pilot book)

**Files:**
- Create: `src/styles/book.css`, `src/lib/curriculum/provenance.ts`, `docs/curriculum/books/soccer-fundamentals-6-8.md`, `src/pages/books/soccer-fundamentals-6-8.astro`
- Modify: `package.json` (add `pagedjs` dependency)
- Test: `tests/unit/curriculum/provenance.test.ts`

**Interfaces:**
- Consumes: Task 1's `--book` CLI path (`/books/<slug>`, waits on `window.__pagedDone`, reads `window.__pagedPageCount`).
- Produces: `provenanceHeader(sha: string): string`; `parseProvenance(fileText: string): string | null` (audit mode consumes this); the book-page contract: sets `window.__pagedDone = true` and `window.__pagedPageCount = <n>` when paged.js finishes.

- [ ] **Step 1: Failing provenance tests**

```ts
// tests/unit/curriculum/provenance.test.ts
import { describe, expect, it } from "vitest";
import { provenanceHeader, parseProvenance } from "@/lib/curriculum/provenance";

describe("provenance", () => {
  it("round-trips through a TS header", () => {
    const text = provenanceHeader("abc1234") + "export const x = 1;\n";
    expect(parseProvenance(text)).toBe("abc1234");
  });
  it("parses an HTML/astro comment form", () => {
    expect(parseProvenance("<!-- generated-from: deadbeef1 -->\n<html>")).toBe("deadbeef1");
  });
  it("returns null when absent", () => {
    expect(parseProvenance("export const x = 1;")).toBeNull();
  });
});
```

- [ ] **Step 2: Run → FAIL.** `npx vitest run tests/unit/curriculum/provenance.test.ts`

- [ ] **Step 3: Implement `src/lib/curriculum/provenance.ts`**

```ts
/** Header for generated product files. Keep the marker greppable. */
export function provenanceHeader(sha: string): string {
  return `// generated-from: ${sha}\n// regenerated by /curriculum-refinery products — edit the book spec, not this file\n`;
}

/** Accepts `//`, `/*`, or `<!--` comment forms anywhere in the first match. */
export function parseProvenance(fileText: string): string | null {
  const m = fileText.match(/generated-from: ([0-9a-f]{7,40})/);
  return m ? m[1] : null;
}
```

- [ ] **Step 4: Tests pass.** Commit checkpoint allowed.

- [ ] **Step 5: Add pagedjs** — `npm install pagedjs` (runtime dep; imported only by book pages).

- [ ] **Step 6: Create `src/styles/book.css`**

```css
/* KDP interior stylesheet — paged.js drives pagination. */
@page {
  size: 6in 9in;
  margin: 0.75in 0.5in; /* top/bottom, outside */
  @bottom-center { content: counter(page); font-size: 9pt; color: #444; }
}
@page :left  { margin-left: 0.5in;  margin-right: 0.75in; @top-left  { content: string(booktitle); font-size: 8pt; letter-spacing: 0.08em; text-transform: uppercase; color: #666; } }
@page :right { margin-left: 0.75in; margin-right: 0.5in; @top-right { content: string(chaptertitle); font-size: 8pt; letter-spacing: 0.08em; color: #666; } }
@page cover { margin: 0; @bottom-center { content: none; } @top-left { content: none; } @top-right { content: none; } }

.book-title { string-set: booktitle content(text); }
.chapter-title { string-set: chaptertitle content(text); break-before: right; }
.book-cover { page: cover; }
h2, h3 { break-after: avoid; }
.activity-card, .skill-block, .session-segment { break-inside: avoid; }
body { font-family: Georgia, "Times New Roman", serif; font-size: 10.5pt; line-height: 1.5; color: #111; }
```

- [ ] **Step 7: Pilot book spec `docs/curriculum/books/soccer-fundamentals-6-8.md`**

```markdown
# Book: The Aspire Way — Soccer Fundamentals, Ages 6–8

- slug: soccer-fundamentals-6-8
- audience: volunteer + new coaches of U6–U8 soccer players
- trim: 6x9
- scope: sport=soccer, stages=[discovery, fundamentals]
- chapters:
  1. How Children Learn Soccer (from: coaching principles + stage philosophy)
  2. The Four Corners (from: skill domains)
  3. The Skills That Matter at 6–8 (from: fundamentals-stage soccer skills incl. progression levels)
  4. Games, Not Drills (from: fundamentals-stage soccer activities)
  5. Your First Ten Sessions (from: soccer session plans, fundamentals)
  6. Talking to Parents (from: coach resources + development-loop overview)

## Iteration notes
<!-- Owner: write render feedback here; `products --book soccer-fundamentals-6-8` implements it. -->
```

- [ ] **Step 8: Pilot manuscript `src/pages/books/soccer-fundamentals-6-8.astro`** — `export const prerender = true;` bare-html page (books are print artifacts — NOT BaseLayout; mirrors the existing minibook pages' standalone-html pattern). Frontmatter imports `CURRICULUM_CONTENT` from `@/lib/curriculum/content` and assembles the chapter data per the spec's scope (filter soccer skills/activities to `stage` ∈ {discovery, fundamentals}). Body: `<div class="book-cover">` title page → copyright page (© Aspire Sports, year, "First edition") → TOC (chapter list, no page numbers — paged.js `target-counter` fills them: `a::after { content: target-counter(attr(href), page); }`) → one `<section>` per chapter with `.chapter-title` h1 → back matter (skill index). Include `<html>` head links to `book.css` and a module script:

```html
<script>
  import { Previewer } from "pagedjs";
  const previewer = new Previewer();
  previewer.preview(undefined, undefined, document.body).then((flow) => {
    (window as any).__pagedPageCount = flow.total;
    (window as any).__pagedDone = true;
  });
</script>
```

Top of frontmatter carries `provenanceHeader` output as a literal comment with the current content-tree SHA (`git log -1 --format=%h -- src/lib/curriculum/content` at generation time).

- [ ] **Step 9: Render + iterate** — dev server up; `npx tsx scripts/generate-minibook-pdfs.ts --book soccer-fundamentals-6-8` → `pdfs/books/soccer-fundamentals-6-8-interior.pdf` + logged page count/spine width. Read the PDF; fix layout defects (margins mirrored correctly, running heads present, page numbers, no split cards) until clean.
- [ ] **Step 10: Full gates** — `npx vitest run tests/unit`, `npx tsc --noEmit`, `npm run build` (book page must prerender cleanly).
- [ ] **Step 11: Commit** — `feat(refinery): KDP book pipeline + pilot book (soccer fundamentals 6-8)`

---

### Task 4: Prod loader-sync workflow

**Files:**
- Create: `.github/workflows/curriculum-sync.yml`

- [ ] **Step 1: Write the workflow**

```yaml
name: Sync curriculum content to production

on:
  push:
    branches: [main]
    paths:
      - "src/lib/curriculum/content/**"

jobs:
  load:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: npm
      - run: npm ci
      - name: Load curriculum into production
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
          ALLOW_CURRICULUM_SEED: "yes"
          ALLOW_PROD_AUDIT: "yes"
        run: |
          npx tsx scripts/curriculum-load.ts --org aspire-sports | tee -a "$GITHUB_STEP_SUMMARY"
```

Note: intentionally NO `--steal-guidance`. The loader is idempotent and additive; a no-op run prints an all-unchanged table.

- [ ] **Step 2: Validate syntax** — `npx yaml-lint .github/workflows/curriculum-sync.yml` if available, else `python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/curriculum-sync.yml'))"` → no error.
- [ ] **Step 3: Commit** — `feat(refinery): auto-sync curriculum content to prod on merge`. (Live validation happens on this PR's own merge only if content files changed; otherwise first real refine-PR merge validates it — note this in the PR body.)

---

### Task 5: The skill — SKILL.md, mode references, DIRECTIVES.md, doc conventions

**Files:**
- Create: `.claude/skills/curriculum-refinery/SKILL.md`
- Create: `.claude/skills/curriculum-refinery/references/audit.md`, `references/research.md`, `references/refine.md`, `references/products.md`
- Create: `docs/curriculum/DIRECTIVES.md`, `docs/curriculum/audits/README.md`, `docs/curriculum/research/README.md`, `docs/curriculum/books/README.md`

- [ ] **Step 1: SKILL.md**

```markdown
---
name: curriculum-refinery
description: Refine the Aspire curriculum and generate print/KDP products. Modes: audit (coverage review), research (international best-practice sweep), refine (implement directives → PR), products (minibooks, activity books, KDP books → PR). Use when the user asks to audit/refine/update the curriculum or produce guides/books.
---

# Curriculum Refinery

Dispatcher: `/curriculum-refinery <mode> [args]`. Read the mode's reference
file before acting: `references/{audit,research,refine,products}.md`.

**Substrate:** `src/lib/curriculum/content/**` is the source of truth. Never
write to any database. The loader (`scripts/curriculum-load.ts`) syncs merged
content to prod via `.github/workflows/curriculum-sync.yml`.

**Hard rules (all modes):**
- Never touch DB schema, migrations, or non-content/non-product code.
- `refine`/`products` work on a branch and end in a PR — never merge it.
- `audit`/`research` write only under `docs/curriculum/` and commit to main.
- Content counts only grow or hold. Removals need an explicit directive AND
  a PR-body warning that the loader cannot delete rows.
- Gate before any PR: `npx vitest run tests/unit/curriculum` green,
  `npx tsc --noEmit` clean, loader `--dry-run` table pasted into the PR body.
- Every research claim carries a citation URL. YouTube-sourced drills are
  adapted into our own words and format — never transcribed.
- Prod DB reads (audit --with-usage) need the user's per-run approval.

**Mode selection:** `audit` → read-only findings report. `research` →
findings brief + proposed directives. `refine` → implement directives.
`products` → generate/refresh minibooks, activity books, KDP books.
No mode given → ask which, listing the four with one-line descriptions.
```

- [ ] **Step 2: references/audit.md** — full workflow: enumerate content via `CURRICULUM_CONTENT` (a scratch `npx tsx` script logging counts per sport × domain × stage); dispatch parallel read-only reviewer agents for (a) coverage matrix, (b) depth consistency (missing `comprehensiveGuide`/progression levels/coaching points), (c) semantic reference health beyond `validateRegistry`, (d) product staleness — for each file under `src/data/minibooks/` and `src/pages/books/` with a provenance header, compare `parseProvenance` SHA against `git log -1 --format=%h -- src/lib/curriculum/content`; (e) optional `--with-usage`: per the `prod-db-access-via-railway` memory, ask the user before connecting, then read-only counts of assessed skills / session-activity usage. Output template: ranked findings (Critical/Important/Minor), coverage table, `## Proposed directives` section. Write to `docs/curriculum/audits/YYYY-MM-DD-audit.md`, commit directly to main.

- [ ] **Step 3: references/research.md** — source categories verbatim from the spec §research (international federations & academies priority list: DFB, KNVB, England FA DNA, Belgian FA, JFA, Iceland model, Ajax, La Masia; US federations baseline; LTAD literature; YouTube coaching content via transcripts/descriptions + channel reputation). Workflow: parallel WebSearch/WebFetch agents per category; every finding = {claim, citation URL, relevance-to-our-content note}; adversarial filter agent kills uncited or stale (>3y unless foundational) findings. Output: `docs/curriculum/research/YYYY-MM-DD-brief.md` + append surviving proposals to `docs/curriculum/DIRECTIVES.md` under `## Proposed (research YYYY-MM-DD)`. Commit directly to main. Never edit content files in this mode.

- [ ] **Step 4: references/refine.md** — directive sources in priority order (inline arg → unchecked `- [ ]` lines in DIRECTIVES.md → latest audit's findings only with `--from-audit`). Workflow: branch `refinery/refine-YYYY-MM-DD`; per work-item dispatch a writer agent anchored on `docs/curriculum/content-architecture.md` + 2–3 same-kind exemplar entries; then adversarial reviewers per item (sport accuracy, age/stage fit, principles consistency, reference integrity). Check off implemented directive lines in the same PR. Run the gates (see SKILL.md). PR body: what changed per directive + loader dry-run table + removal warning when applicable.

- [ ] **Step 5: references/products.md** — Tier 1 (minibooks/activity books): data files conform to `src/data/minibooks/_template.ts`; new activity-book pages follow the existing minibook .astro pattern + print CSS; every generated file starts with `provenanceHeader(sha)` where sha = `git log -1 --format=%h -- src/lib/curriculum/content`. Tier 2 (KDP books): read the book spec in `docs/curriculum/books/<slug>.md`; implement its `## Iteration notes` since the last render; regenerate the manuscript page; render via `npx tsx scripts/generate-minibook-pdfs.ts --book <slug>`; Read the PDF and self-QA (mirrored margins, running heads, page numbers, no split cards, TOC page numbers resolve) before handing to the user; report page count + spine width. Branch `refinery/products-YYYY-MM-DD`, PR with the rendered-PDF path listed (PDFs stay untracked — `pdfs/` is gitignored; the reviewer re-renders).

- [ ] **Step 6: DIRECTIVES.md seed**

```markdown
# Curriculum Directives

Standing instructions for `/curriculum-refinery refine`. One directive per
line, checkbox format. Refine checks items off in the PR that implements
them. Delete a proposed line to veto it.

## Backlog (seeded 2026-07-05)

- [ ] Baseball has 1 skill — build out a starter baseball skill set across
      all four domains (target: ≥12 skills, fundamentals + skill-building)
- [ ] Hockey has skills but 0 activities — author hockey activities covering
      its 13 skills (target: ≥15 activities)
- [ ] Session plans exist only for soccer (11) and basketball (7) — add
      hockey session plans (target: ≥4, fundamentals)
- [ ] Review the 2026-07-04 consolidation's "kept — judged distinct" list
      (docs ref: .superpowers/sdd/cr-consolidation-report.md) — confirm the
      soccer Shooting umbrella reads coherently post-merge

## Proposed (research YYYY-MM-DD)
<!-- research mode appends here; owner curates -->
```

- [ ] **Step 7: Directory READMEs** — one paragraph each: `audits/` (dated audit reports, direct-committed), `research/` (dated cited briefs, direct-committed), `books/` (one spec per book; `## Iteration notes` drives the next `products --book` run).
- [ ] **Step 8: Verify** — the skill loads: `/curriculum-refinery` with no args should be answerable purely from SKILL.md (mode list). Grep all five files for paths they reference (`scripts/generate-minibook-pdfs.ts`, `provenance`, `DIRECTIVES.md`) — no dangling references.
- [ ] **Step 9: Commit** — `feat(refinery): curriculum-refinery skill, mode references, directives seed`

---

### Task 6 (CONTROLLER ONLY): verification + ship

1. Full gates in the worktree: `npx tsc --noEmit`, `./scripts/with-bws.sh npx vitest run tests/unit`, `./scripts/with-bws.sh npm run build`.
2. Smoke the pipeline pieces: render one minibook + the pilot book locally; confirm page count/spine output.
3. PR → CI green → user merges. If the PR touched no `src/lib/curriculum/content/**` file, note in the PR body that `curriculum-sync.yml` validates on the first refine-merge.
4. Post-merge: invoke `/curriculum-refinery audit` as the skill's first live run (read-only) — validates the skill end-to-end and produces the baseline audit that seeds the first real refine cycle.

## Self-review notes

- Spec coverage: audit/research/refine/products modes → Task 5; minibook first assignment → Task 2 (machinery in Task 1); KDP pipeline (spec §products Tier 2: book spec, manuscript, render, iteration, provenance) → Tasks 1+3; loader sync → Task 4; guardrails → Global Constraints + SKILL.md hard rules; deliverables 1–7 all mapped.
- Chromium can't do `@page` margin boxes natively — paged.js dependency is deliberate and confined to book pages (minibooks keep the existing native-print path).
- Counts asserted nowhere as exact in skill docs (content will grow) — only DIRECTIVES targets, which are floors.
