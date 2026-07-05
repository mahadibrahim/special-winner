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
  5. Your First Sessions (from: soccer session plans, fundamentals)
  6. Talking to Parents (from: coach resources + development-loop overview)

## Content pull, as generated

- Chapter 1 draws from `STAGES` (discovery + fundamentals philosophy/keyPrinciples/coachRole)
  and 12 curated `coachGuidance.principles` (natural-key title match): the 7 sport/stage-agnostic
  principles, plus soccer-scoped and/or discovery|fundamentals-scoped ones. Excludes principles
  scoped to other sports (basketball's "Lower the Hoop") or later stages (skill-building+).
- Chapter 2 draws from all 4 `DOMAINS` entries (technical/tactical/physical/psychological).
- Chapter 3 draws from `skills` where `sport === "soccer"` and `stage === "fundamentals"`
  (18 skills as of the source SHA below; the `discovery` stage has no soccer-specific skills
  in the registry — stage-level content for discovery lives in Chapter 1 instead).
- Chapter 4 draws from `activities` where `sport === "soccer"` and `appropriateStages` includes
  `"fundamentals"` or `"discovery"` (23 activities as of the source SHA below).
- Chapter 5 draws from `sessionPlans` where `sport === "soccer"` and `stage === "fundamentals"`
  (6 session plans as of the source SHA below). Titled "Your First Sessions" rather than a
  specific count so the chapter title never overpromises relative to what the registry
  actually contains — the count grows as the registry grows without a title rewrite.
- Chapter 6 draws from 2 `coachGuidance.resources` filtered to parent-communication topics
  (natural-key title match) plus a short prose gloss on the discovery → fundamentals
  development-loop transition already described in Chapter 1's stage data.
- A handful of activities (5) and session plans (4) carry an alternate "v2-rich" long-form
  field — a multi-thousand-character, phase-by-phase live coaching script in `howToPlay` /
  `coachingNotes`, versus the ~150-2000-char field most entries have. The book page prints the
  short form (activity `description`, or the field itself when it's already short) and leans on
  `coachingPoints`/`commonMistakes`/`variations`/structure segments for actionable detail, rather
  than dumping raw multi-page scripts (with `SAY:`/`PHASE`/markdown-checkbox syntax) into the
  print layout. See Iteration notes.

## Iteration notes

<!-- Owner: write render feedback here; `products --book soccer-fundamentals-6-8` implements it. -->

- 2026-07-05: First render (117 pages) surfaced 5 defects, all fixed before the pilot PDF was
  accepted — see `.superpowers/sdd/rf-task-3-report.md` for the full checklist writeup:
  1. `.copyright-page`/`.toc-page` both forced `break-before: right`, and `.chapter-title` ALSO
     forced `break-before: right` on top of the enclosing `section.chapter`'s own right-break —
     together these inserted 3 avoidable blank pages before Chapter 1 even started. Front matter
     now uses a plain `break-before: page`; only the section-level rule forces chapters to a
     right-hand page.
  2. Long-form activities (`howToPlay` > 400 chars) fell back to `description` for the "how to
     play" summary, but the card *also* printed `description` unconditionally above it —
     duplicating the same paragraph twice on "Ball Mastery Circle" and 4 siblings. Fixed with an
     equality guard.
  3. Those same activities' `makeEasier`/`makeHarder` fields are structured multi-line text
     (`SIGNS THEY'RE STRUGGLING:\n• ...`) but were rendered as one inline paragraph — a wall of
     text with literal `•` characters that also pushed "Ball Mastery Circle" across a page
     break mid-thought. Added a small line-based renderer (label lines ending in `:` become
     mini-headers, `•`/`-` lines become a real `<ul>`).
  4. 4 of 6 session plans' `coachingNotes` field is a 6,800-8,600-char markdown-formatted
     "Complete Coach's Guide" duplicating the whole session (checkboxes, `##` headers, `**bold**`)
     — printed raw as an italic paragraph, it dumped literal markdown syntax onto the page.
     Since the `structure` segments above already cover the session, `coachingNotes` now only
     prints when short (<700 chars, matching the 2 plans that use it as a real pull-quote).
  5. The back-matter skill index rendered its `<a href="#skill-...">` links with default
     browser blue/underline styling and no page reference. Added `.back-matter-index a` color/
     underline reset plus a `target-counter` `::after` rule (same technique as the TOC) so the
     index reads "Ball Control, 22" instead of a bare, unstyled, page-less list.
  - Final render: 91 pages, spine 0.2049in. Checklist (cover, TOC with resolved page numbers,
    mirrored margins, running heads, page numbers, no split activity cards, chapter starts on a
    right-hand page) verified clean on cover + TOC + front matter + a chapter-3 spread + the
    chapter-4 activities spread + chapter 5 + chapter 6 + the back-matter index.
