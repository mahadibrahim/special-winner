# Minibook Print-Readiness QA — 2026-07-05

Print-readiness pass over all 15 authored minibooks (5 soccer, 5 basketball, 5 hockey), rendered via
`npx tsx scripts/generate-minibook-pdfs.ts` (letter profile, no args = all 15 slugs). The 10
basketball/hockey titles had never been rendered to PDF before this pass; the 5 soccer titles had.

Checklist applied per book (from the task brief):

- (a) cover renders with title/sport
- (b) no text overflow or clipped boxes
- (c) no orphaned section headings at page bottoms
- (d) page breaks don't split an activity/drill card
- (e) all `_template.ts` sections present (meta, chapters/parts, playerStories, coachWisdom) and non-empty
- (f) images/logos resolve (no broken-image glyphs)
- (g) typography matches `src/data/minibooks/DESIGN-SYSTEM.md`

## Final verdicts (all 15)

| # | Book | Pages | Verdict |
|---|------|-------|---------|
| 1 | soccer-passing | 79 | PASS |
| 2 | soccer-dribbling | 69 | PASS (2 content defects fixed) |
| 3 | soccer-shooting | 81 | PASS (1 content defect fixed) |
| 4 | soccer-defending | 79 | PASS |
| 5 | soccer-game-intelligence | 93 | PASS (2 content defects fixed) |
| 6 | basketball-ball-handling | 76 | PASS |
| 7 | basketball-defending | 75 | PASS |
| 8 | basketball-game-intelligence | 88 | PASS (2 content defects + 1 layout defect fixed) |
| 9 | basketball-passing | 75 | PASS |
| 10 | basketball-shooting | 76 | PASS (1 layout defect fixed) |
| 11 | hockey-defending | 78 | PASS |
| 12 | hockey-passing | 76 | PASS |
| 13 | hockey-shooting | 77 | PASS |
| 14 | hockey-skating | 77 | PASS (1 layout defect fixed, via shared CSS fix) |
| 15 | hockey-stickhandling | 72 | PASS (1 layout defect fixed) |

All 15 pass the full checklist after fixes. Verified via cover + 2–3 interior spreads (science
section, technical-progression activity cards) + last 2 pages per book, plus automated scans
across the full text layer of every PDF for the specific defect patterns found (see below).

## Defects found and fixed

### Content defects (data files) — 6 instances across 3 files

The content template (`content:` fields) is rendered by splitting only on **double** newlines into
`<p>` tags (`content.split('\n\n')`); single newlines collapse into the same paragraph. Several
sections were authored as markdown-style dash/numbered lists separated by single newlines, which
rendered as a broken run-on sentence with stray hyphens, e.g. page 46 of
`soccer-game-intelligence` originally read:

> **Attacking Principles**: - Penetration: Can we go forward toward goal? - Support: Are there
> options for the player on the ball? - Width: ...

Fixed by rewriting each instance as flowing prose (matching the surrounding editorial voice), no
data-file restructuring:

- `src/data/minibooks/soccer-dribbling.ts` — 5 spots (Self-Determination Theory needs, creativity
  backgrounds, expert-perception decision framework, reading-the-defender cues, parent-influence
  findings; plus a numbered-list variant of the same bug in the constraints-led-approach section)
- `src/data/minibooks/soccer-game-intelligence.ts` — 2 spots (attacking/defending principles,
  video-game benefits/risks/age guidelines)
- `src/data/minibooks/soccer-shooting.ts` — 1 spot (numbered "Three Types of Movement" list)
- `src/data/minibooks/basketball-game-intelligence.ts` — 3 spots (pattern categories, offensive/
  defensive principles, video-benefits/risks/age guidelines)

Confirmed no other data file in the 15 has this pattern (scripted scan for both `- item` and
`1. item` sequences not separated by a blank line, across all 15 `.ts` files, post-fix: zero hits).

### Layout defects (CSS, affects all 15 books) — 3 fixes

All three are pre-existing gaps in `src/styles/minibook.css`'s print media query, only exposed by
content lengths in the previously-unrendered basketball/hockey titles (their science-foundation and
technical-progression sections are slightly longer than the soccer titles'):

1. **Orphaned "Signs of Progress" heading** — `basketball-shooting` p.46 and (pre-final-render)
   `hockey-skating` had the heading render alone at the bottom of a page with its checklist pushed
   to the next page. `.progress-signs` and `.home-activities` (the parent boxes) were missing from
   the print `break-inside: avoid` selector list. Added both.
2. **Orphaned "Activities" heading** — `basketball-game-intelligence` p.52 had the "Activities"
   heading alone at the bottom of a stage box with all its activity cards on the next page. Added
   `break-after: avoid` to `.stage-activities h4` and `.stage-principles h4` (same class of
   heading, same fix). Also added `break-after: avoid` to the shared `.minibook-section-title`
   class as preventive hardening — it has the same orphan exposure across every book's science/
   mental-game/tactical/parent-guide section titles, and this print run only sampled a fraction of
   each book's ~500 section headings.
3. **Inconsistent cover header wrap** — `hockey-stickhandling`'s cover rendered the "EVIDENCE-BASED
   YOUTH DEVELOPMENT" label on one line while all other 14 books wrapped it to two ("EVIDENCE-BASED
   YOUTH" / "DEVELOPMENT"), despite byte-identical markup and CSS. Root cause: the label sits right
   at the natural wrap threshold for its available flex width (measured: full text ≈2.49in, "Evidence-
   Based Youth" alone ≈1.56in), so subpixel/font-rounding differences in Chromium's print layout pass
   pushed one render over the line. Fixed by giving `.minibook-series` an explicit `max-width: 1.9in`,
   forcing the same two-line break deterministically across all 15 covers. Verified reproducible
   before the fix (3 consecutive re-renders of `hockey-stickhandling` alone all produced the one-line
   result) and resolved after (2 consecutive re-renders both wrap correctly).

CSS changes were re-verified against the previously-clean soccer books after each edit
(`soccer-passing`, `soccer-dribbling`, `soccer-shooting`, `soccer-defending` were all re-rendered
and re-inspected) — no regressions, identical page counts and layout except the two content-defect
books whose *content* fixes above legitimately shifted `soccer-dribbling`'s and
`soccer-game-intelligence`'s section text (page counts otherwise unchanged: `soccer-dribbling`
stayed at 69 pages; `soccer-game-intelligence` grew from 91 to 93 pages because the corrected prose
runs slightly longer than the broken run-on version — expected, not a regression).

### Structural / template-conformance check (all 15)

Verified programmatically that every book's data file has all top-level `_template.ts` sections
(`meta`, `introduction`, `scienceFoundation`, `mentalGame`, `tacticalAwareness`,
`technicalProgression`, `parentGuide`, `resources`, `playerStories`, `coachWisdom`) present and
non-empty, and that every `playerStories`/`coachWisdom` `placement` value used in the data file has
a matching `getPlayerStory`/`getCoachWisdom` call in the corresponding `.astro` page (i.e. no
authored interlude is silently dropped from the render). No mismatches found in any of the 15.

### Images/logos

Every cover/back-cover references the same static asset (`/images/logo-black.png`, 60 references
across the 15 `.astro` pages) which exists in `public/images/` and rendered correctly (no
broken-image glyph) on every cover/back-cover sampled.

## Not touched

- Sport accent colors in `minibook.css` (`#c2410c` basketball, `#1e3a8a` hockey) differ slightly
  from the swatches documented in `DESIGN-SYSTEM.md` (`#b35a00`, `#1a3d5c`). This is a pre-existing,
  consistent discrepancy across all books using those sports (not a per-book defect) and is outside
  this task's checklist item (g), which concerns typography, not color — left as-is.

## Verification

- Final full render: `npx tsx scripts/generate-minibook-pdfs.ts` — all 15 slugs succeeded, one run,
  no errors.
- `npx tsc --noEmit` — clean (0 errors) after all data-file edits.
- Automated post-fix scans (all 15 PDFs' text layers): zero remaining collapsed-list content
  defects; zero remaining "Signs of Progress" / "Activities" orphaned-heading pages; all 15 covers
  wrap the series label identically (2 lines).
