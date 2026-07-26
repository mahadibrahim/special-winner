# Lulu wraparound cover generator for Aspire Sports minibooks

**Date:** 2026-07-26
**Status:** Approved design, implementing
**Scope:** `scripts/generate-minibook-covers.ts` (new), `scripts/generate-minibook-pdfs.ts` (patch),
`scripts/pdf-profiles.ts` (add `countPdfPages` helper). Output: `pdfs/covers/<slug>-cover.pdf` (gitignored).

## Purpose

The interior pipeline (`scripts/generate-minibook-pdfs.ts` + `pdf-profiles.ts`, `kdp-6x9` profile)
already renders each minibook's pages to a 6×9in interior PDF. Lulu's print-on-demand (POD) API
also requires a single-page **wraparound cover PDF** — back cover, spine, and front cover laid out
side by side on one page sized to the exact trim + spine width for that interior's page count. This
script generates that cover PDF from the same minibook data the `.astro` page already renders from,
styled with the sport's brand color, with no server required beyond what's needed to read data files.

## Dimension spec + formula-vs-API note

Lulu 6×9in perfect-bound POD package: `0600X0900BWSTDPB060UW444MXX` (same package id as
`src/lib/lulu/formats.ts`'s `6x9_bw`).

- Height = 9 + 2 × 0.125in bleed = **9.25in** (top/bottom bleed).
- Width = 0.125 (back bleed) + 6 (back trim) + spine + 6 (front trim) + 0.125 (front bleed)
  = **12.25in + spine**.
- Spine width formula (KDP white-paper constant, already used for interiors):
  `spineWidthInches(pages) = pages * 0.002252` (`scripts/pdf-profiles.ts`).
- Text/logo safe area: keep all text ≥ 0.5in inside each panel's **trim** edge (not the bleed edge),
  and clear of the spine seam. Background art bleeds to the full document edge.

**Verified against Lulu's live API.** Sandbox creds (`./scripts/with-bws.sh`) were live during
implementation, so `POST {LULU_API_BASE}/cover-dimensions/` (`{pod_package_id, interior_page_count}`)
was queried directly for several page counts:

| pages | our formula width | Lulu API width | our height | Lulu API height |
|---|---|---|---|---|
| 32  | 12.322in | 12.389in (892pt) | 9.25in | 9.25in (666pt) |
| 64  | 12.394in | 12.458in (897pt) | 9.25in | 9.25in (666pt) |
| 444 | 13.250in | 13.306in (958pt) | 9.25in | 9.25in (666pt) |

Findings:
- **Height matches exactly** (9.25in / 666pt) at every page count — the 0.125in bleed assumption is
  correct.
- **Spine growth rate matches**: Lulu's width grows ~0.1602pt/page ≈ 0.002225in/page across the
  sampled range, consistent with the 0.002252in/page constant (the ~1% difference is pt-rounding
  noise from Lulu returning integer points).
- **Width has a constant ~5pt (~0.069in) offset** our flat `12.25in` doesn't account for, at every
  page count. Likely a hinge/scoring allowance Lulu adds for perfect-bound wraps that isn't in the
  public KDP-derived formula. This is a real, reproducible discrepancy, not sampling noise.

Per the task's design contract ("prefer THEIR numbers when reachable"): `generate-minibook-covers.ts`
queries the live endpoint when sandbox creds are configured and **uses Lulu's returned width/height
for the rendered PDF**, falling back to the formula only when the API is unreachable or credentials
aren't configured. Both numbers are always printed, plus a match/mismatch note (0.01in tolerance) —
so a formula-vs-API drift is visible on every run, not just this one.

## Template content decisions

- **Front cover**: full-bleed sport-color background (`--{sport}-primary` / `--{sport}-dark` gradient,
  same variables as `src/styles/print-guide.css`'s `.guide-{sport}` classes — hardcoded here as a
  small hex map since this script runs outside the Astro/CSS pipeline; source cited in code comment),
  book title + subtitle (from the same `book.meta` object the `.astro` page reads), and the Aspire
  logo inside a white rounded chip (so the logo never clashes with a sport color that matches its own
  ink, e.g. hockey's blue background against the logo's blue mark).
- **Back cover**: white background, a short generic on-brand blurb (not book-specific — these are a
  series), the Aspire logo (dark variant, no chip needed on white), and `aspiresportsohio.com`.
- **Spine**: sport color only, no text, whenever `pages < 80` (Lulu's own guidance that spine text
  is unreliable/illegible below that page count for 6×9 trade paperbacks). Above 80 pages this script
  still renders color-only for now — spine text is a follow-up, not in scope for this pass.

## CLI contract

```
tsx scripts/generate-minibook-covers.ts --slug <minibook-slug> --pages <interior-page-count>
```

- Both flags are **required**. Missing either prints a usage error and exits non-zero.
- `--slug` must match a file in `src/data/minibooks/<slug>.ts` (same slugs as
  `MINIBOOK_SLUGS` in `generate-minibook-pdfs.ts`); a missing file is a clear fatal error naming the
  expected path.
- `--pages` is the **interior page count** for that render (from generate-minibook-pdfs.ts's newly
  printed per-slug page count — see below), used for both the spine-width formula and the Lulu API
  query.
- Output: `pdfs/covers/<slug>-cover.pdf`.
- Non-fatal warning (does not exit non-zero) when `--pages < 32`: Lulu's POD minimum page count for
  this package is 32 pages; a cover can still be generated (e.g. for local proofing) but the interior
  won't be orderable below that.

## Interior page-count reporting (`generate-minibook-pdfs.ts` patch)

Minibook `.astro` pages have no paged.js instrumentation (unlike `--book` mode, which runs
`pagedjs`'s `Previewer` client-side and sets `window.__pagedPageCount`) — minibooks paginate purely
via native Chromium `@page` CSS rules during print, so there's no in-page JS page count to read.
Minibook mode now reads the page count back out of the PDF Chromium just wrote (new
`countPdfPages()` in `pdf-profiles.ts`: tries `pdfinfo` first, falls back to a byte-level scan for
non-`/Type /Pages` page objects if `pdfinfo` isn't on `PATH`) and prints it in the same
`pages: N, spine: X.XXXXin` format book mode already uses — that count is what gets passed to
`generate-minibook-covers.ts --pages`.

## Page-count minimum note

Lulu's minimum page count for the `0600X0900BWSTDPB060UW444MXX` package is 32 pages. This is a
**warn-only** check in both the interior and cover scripts — sub-32-page renders are still useful for
local proofing and drafts; only the actual Lulu order attempt should hard-fail on it.
