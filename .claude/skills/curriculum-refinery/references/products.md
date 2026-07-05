# Products mode

Generates/refreshes print products from the content registry. Ends in a
PR — **never merge it**. Branch `refinery/products-YYYY-MM-DD` (today's
date). Rendered PDFs are gitignored (`pdfs/`) — list the render path in the
PR body instead of committing the binary; the reviewer re-renders locally.

## Tier 1: minibooks & activity books

- **Minibooks**: 15 fixed slugs, one per sport × skill combination —
  `soccer-{passing,dribbling,shooting,defending,game-intelligence}`,
  `basketball-{ball-handling,defending,game-intelligence,passing,shooting}`,
  `hockey-{defending,passing,shooting,skating,stickhandling}`. Each has a
  data file `src/data/minibooks/<slug>.ts` and page
  `src/pages/minibooks/<slug>.astro`. New/edited data files must conform to
  the shape in `src/data/minibooks/_template.ts` (meta, introduction,
  scienceFoundation, chapters, playerStories, coachWisdom, etc.) and follow
  `src/data/minibooks/DESIGN-SYSTEM.md` for typography/page-spec rules.
- **Activity books**: same pattern, new sport/domain scope. New pages go in
  `src/pages/books/` or `src/pages/minibooks/` (match whichever existing
  page — e.g. `src/pages/minibooks/soccer-passing.astro` — is closest in
  shape) using the same standalone-HTML-not-BaseLayout pattern (`export
  const prerender = true`, its own `<html>`, importing
  `../../styles/print-guide.css` + `../../styles/minibook.css` or
  `../../styles/book.css` as appropriate) plus print CSS; don't wrap it in
  `BaseLayout` — these are print-only pages, not site navigation.
- **Provenance**: every generated/regenerated Tier 1 file must start with
  `provenanceHeader(sha)` from `src/lib/curriculum/provenance.ts`, where
  `sha` is the current content SHA:
  `git log -1 --format=%h -- src/lib/curriculum/content`.
- **Render**: dev server must be up (`./scripts/with-bws.sh npm run dev` —
  the minibook/book pages read from the content registry, no DB needed at
  request time, but `with-bws` keeps env parity with the rest of the repo).
  Then `npx tsx scripts/generate-minibook-pdfs.ts [--slugs a,b]` (omit
  `--slugs` to render all 15) with the default `letter` profile. Output:
  `pdfs/minibooks/<slug>.pdf`.
- **Self-QA before handing off**: Read each rendered PDF and check the
  print-readiness criteria from `docs/curriculum/audits/2026-07-05-minibook-print-qa.md`
  (cover renders correctly; no text overflow/clipped boxes; no orphaned
  headings; no split activity/drill cards across a page break; all
  `_template.ts` sections present and non-empty; images/logos resolve; no
  broken-image glyphs; typography matches DESIGN-SYSTEM.md). That file is
  the precedent for what "print-ready" means here — match its rigor, don't
  just eyeball page one.

## Tier 2: KDP books

1. Read the book's spec: `docs/curriculum/books/<slug>.md` (e.g. the pilot,
   `docs/curriculum/books/soccer-fundamentals-6-8.md`) — use it as the
   exemplar for spec structure: chapter list, content-pull mapping to
   registry fields, and an `## Iteration notes` section.
2. Implement whatever is unaddressed in `## Iteration notes` since the last
   render (the spec's own notes describe defects/changes still owed — e.g.
   the pilot's notes list 4 fixed print defects with dates; new unaddressed
   notes are the actual to-do list for this run).
3. Regenerate the manuscript page — `src/pages/books/<slug>.astro` — a
   standalone, non-BaseLayout, `prerender = true` page that imports
   `../../styles/book.css`, reads from `CURRICULUM_CONTENT`, and starts
   with the `provenanceHeader` comment (same SHA rule as Tier 1). It must
   set `window.__pagedDone = true` and `window.__pagedPageCount = <n>` once
   paged.js finishes pagination — the render script waits on the former and
   reads the latter for the page count/spine log line.
4. Render: dev server up (`./scripts/with-bws.sh npm run dev`), then
   `npx tsx scripts/generate-minibook-pdfs.ts --book <slug>`
   (optionally `--profile kdp-6x9` or `--profile kdp-8.5x11`; `--book`
   defaults to `kdp-6x9` if no `--profile` is given). Output:
   `pdfs/books/<slug>-interior.pdf`. The script logs `pages: N, spine:
   <spineWidthInches(N)>in` — record both in the PR body.
5. **Self-QA before handing to the user**: Read the PDF and check mirrored
   margins (left/right pages have swapped inside/outside margins per
   `book.css`'s `@page :left`/`@page :right`), running heads (book title on
   verso, chapter title on recto), page numbers present and sequential, no
   split activity/skill/session cards across a page break
   (`break-inside: avoid` classes), and that the table of contents' page
   numbers actually resolve to the right pages once rendered.
6. Update the book spec's `## Iteration notes` with what this render fixed
   or changed, dated, mirroring the pilot spec's existing note style — the
   spec is the durable record; the PDF is disposable and regenerable.

## PR body (both tiers)

- Rendered PDF path(s) (not the PDF itself — `pdfs/` is gitignored).
- Page count + spine width for any KDP book render.
- Self-QA checklist results (pass/fail per item, not just "looks fine").
- Content SHA the render was built from (matches the `provenanceHeader`).
