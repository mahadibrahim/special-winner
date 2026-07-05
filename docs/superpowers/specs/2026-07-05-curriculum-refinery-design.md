# Curriculum Refinery — Design

**Companion to:** `2026-07-04-curriculum-recovery-design.md` (§8 reserved this spec).

## Goals

Three, stated by the owner:

1. **Stay current** — track the latest approaches to youth coaching and training and fold them into our curriculum.
2. **Implement** — make improvements land in our programs (the coach portal content coaches actually use).
3. **Publish** — produce print/KDP-ready books and print collateral that present our approach.

## Context

The curriculum lives as version-controlled TypeScript content modules in
`src/lib/curriculum/content/**` (66 skills, 104 activities, 18 practice
templates, 99 coach-guidance rows across 4 sports) with a registry
cross-reference validator (`validateRegistry`). An idempotent loader
(`scripts/curriculum-load.ts --org <slug> [--dry-run]`, guarded by
`ALLOW_CURRICULUM_SEED` / `ALLOW_PROD_AUDIT`) syncs content to any DB;
prod and staging were loaded 2026-07-05. The coach portal (session planner,
assessments) and parent development pages consume the DB. Print surfaces:
`/guides/*` (DB-driven, prerendered — update automatically on loader sync)
and `/minibooks/*` (hand-authored data files in `src/data/minibooks/*`,
rendered to PDF by `scripts/generate-minibook-pdfs.ts` — Playwright
print-to-PDF, currently Letter-format only).

Content quality reference: `docs/curriculum/content-architecture.md`.
Known content gaps (from recovery): baseball has 1 skill, hockey has skills
but no activities, only soccer/basketball have session plans.

## Shape

One user-invoked Claude Code skill — **`/curriculum-refinery <mode>`** — with
four modes forming a loop. No cron, no in-app UI, no autonomous runs. Modes
that change content or product files (`refine`, `products`) end in a branch +
PR; nothing merges itself. Read-only modes (`audit`, `research`) write only
report files under `docs/curriculum/` and commit them directly (docs-only
commits skip the deploy-affecting workflows by existing convention).

```
research ──► DIRECTIVES.md ──► refine ──► PR ──► merge ──► loader sync (CI)
    ▲                                                        │
    │                                                        ▼
  audit ◄──────────── coach portal / guides / books ◄────────┘
```

### Mode: `audit` (read-only)

Fans out read-only review agents over the content tree:

- **Coverage matrix** — skills × domain × stage × sport; activities and
  session plans per sport/stage. Flags structural gaps (e.g. baseball).
- **Depth consistency** — entries missing `comprehensiveGuide`, progression
  levels, coaching points; depth variance within a sport.
- **Reference health** — `validateRegistry` plus semantic checks (activities
  whose `skillsDeveloped` don't match their described purpose).
- **Product staleness** — generated products whose provenance SHA (see
  Products) predates the content files they draw from.
- **Usage (optional, `--with-usage`)** — read-only prod queries (Railway
  credential path per `prod-db-access-via-railway` memory; requires the
  owner's per-run approval): which skills get assessed, which activities
  appear in sessions, domains with sparse assessment coverage.

Output: `docs/curriculum/audits/YYYY-MM-DD-audit.md` — ranked findings with
a proposed-directives section the owner can copy into DIRECTIVES.md. No
content changes.

### Mode: `research` (read-only + directives)

The "stay current" pillar. Web-research agents sweep defined source
categories: national federation curricula and their updates (US Soccer,
USA Basketball, USA Hockey grassroots), LTAD/athlete-development literature,
and reputable coaching-education publications. Each finding must carry a
citation and a concrete claim ("X federation moved U8 to 4v4 in 2025").

Output: `docs/curriculum/research/YYYY-MM-DD-brief.md` (findings +
citations + relevance assessment against our current content) and proposed
directive lines appended to `docs/curriculum/DIRECTIVES.md` under a dated
`## Proposed (research YYYY-MM-DD)` heading. The owner curates — deleting a
proposed line is a veto; `refine` only implements what survives.

### Mode: `refine` (writes content, ends in PR)

Directive sources, in priority order:

1. Inline argument: `/curriculum-refinery refine "add 10 baseball skills"`
2. `docs/curriculum/DIRECTIVES.md` — standing owner-maintained file (own
   notes, coach feedback, curated research proposals). Lines are checked
   off (`- [x]`) in the same PR that implements them.
3. Latest audit report's ranked findings (only when invoked with `--from-audit`).

Execution (subagent-driven): each work-item gets a writer agent anchored on
`content-architecture.md` plus 2–3 existing high-quality entries of the same
kind as style exemplars; then adversarial reviewers per item (sport accuracy,
age/stage appropriateness, consistency with our coaching principles,
reference integrity). Gate: `validateRegistry` + `tests/unit/curriculum`
pass; loader `--dry-run` against staging runs and its table lands in the PR
body. Content counts may only grow or hold — removals/consolidations require
an explicit directive and get a PR-body warning that the loader cannot
delete (pre-load handling needed, as in the 2026-07-04 consolidation).

### Mode: `products` (writes product files, ends in PR)

Two tiers:

**Tier 1 — print collateral (existing pipeline).** Generate or refresh
minibook data files (`src/data/minibooks/*.ts`, conforming to the existing
minibook type) and **activity books** — new pages under `/minibooks/`
(sport × stage collections: setup, how-to-play, coaching points, equipment,
space) using the existing print CSS. PDFs via the existing script.

**Tier 2 — book projects (KDP pipeline).** Books iterate like code:

- **Book spec** `docs/curriculum/books/<slug>.md` — owner-editable: title,
  audience, sport/stage scope, chapter outline, trim size (default 6×9 in
  for prose guides, 8.5×11 in for activity books), and an **iteration notes**
  section where the owner writes review feedback between renders.
- **Manuscript** — generated Astro page under `src/pages/books/<slug>.astro`
  (prerendered, not linked from site nav) assembling curriculum content per
  the spec: front matter (title page, copyright, TOC), chapters, back matter
  (skill index, about). Layout via a `book.css` print stylesheet with
  `@page` trim size, mirrored margins with gutter, running heads.
- **Render** — `scripts/generate-minibook-pdfs.ts` gains a `--profile kdp`
  path (Playwright `page.pdf` with explicit `width`/`height` for trim size
  instead of `format: "Letter"`, `preferCSSPageSize: true`, fonts embedded
  by Chromium) writing `pdfs/books/<slug>-interior.pdf`. KDP accepts this
  as the paperback interior; cover is out of scope (spine width derives
  from the rendered page count — the script prints it).
- **Iteration loop** — owner reads the PDF → writes notes in the book spec →
  reruns `products --book <slug>` → agents revise structure/layout per
  notes → new PDF, new commit. Content edits flow in automatically at next
  render; book-structure edits never touch curriculum content.
- **Provenance** — every generated product file gets a header comment with
  the content-tree git SHA it rendered from; `audit` flags stale products.

### Loader sync (closes the "implement" loop)

New workflow `.github/workflows/curriculum-sync.yml`: on push to `main`
touching `src/lib/curriculum/content/**`, run
`ALLOW_CURRICULUM_SEED=yes ALLOW_PROD_AUDIT=yes npx tsx scripts/curriculum-load.ts --org aspire-sports`
against prod (reuses the `DATABASE_URL` secret `migrate-prod.yml` already
holds). Idempotent, additive-only, never `--steal-guidance`. Job summary
shows the load table. This removes the manual Railway-credential step from
every refinement cycle.

## Guardrails

- The skill never touches DB schema, migrations, or non-content/product code.
- Every writing mode ends in a PR; the owner merges.
- Prod DB access is read-only (`audit --with-usage`) and per-run approved;
  the only prod write path is the CI loader sync on merged content.
- All generated content passes `validateRegistry` + curriculum unit tests
  before a PR opens.
- Research claims require citations; uncited claims don't become directives.

## Out of scope (YAGNI)

In-app admin UI; scheduled/cron runs; KDP cover generation and upload
automation; shop/Notion delivery; image/diagram generation (activity
diagrams stay text/HTML); coach-feedback ingestion beyond DIRECTIVES.md;
translation/localization.

## Testing

- Skill logic is prompt/workflow, not app code — the testable surfaces are:
  `--profile kdp` PDF rendering (unit-testable page-size math + a smoke
  render in the pre-push checklist), provenance-header parsing (unit), and
  the sync workflow (validated by its first post-merge run's job summary).
- Each `refine`/`products` PR carries the standard repo gates (tsc, unit
  tests, build) via existing CI.

## Deliverables

1. `.claude/skills/curriculum-refinery/SKILL.md` (+ mode reference files)
2. `docs/curriculum/DIRECTIVES.md` (seeded with current known gaps)
3. `docs/curriculum/audits/`, `docs/curriculum/research/`,
   `docs/curriculum/books/` directory conventions
4. `book.css` print stylesheet + one pilot book spec (owner picks the title;
   suggested pilot: *The Aspire Way: Soccer Fundamentals, Ages 6–8* — richest
   content coverage)
5. `--profile kdp` render path in the PDF script
6. `.github/workflows/curriculum-sync.yml`
