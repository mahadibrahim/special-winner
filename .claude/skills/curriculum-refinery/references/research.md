# Research mode

Read-only against the codebase. Never edits `src/lib/curriculum/content/**`,
`src/data/minibooks/**`, or `src/pages/books/**` — this mode only produces a
brief and proposed directives. Writes land under `docs/curriculum/` and
commit directly to main (docs-only commits skip the deploy-affecting
workflows — see CLAUDE.md release process).

## Source categories (search all that apply to the requested scope)

- **International federations & academies** (priority order): DFB (Germany),
  KNVB (Netherlands), England FA "DNA" curriculum, Belgian FA, JFA (Japan),
  the Iceland coaching-education model, Ajax academy methodology, La Masia
  (Barcelona) methodology.
- **US federations baseline**: US Soccer, USA Basketball, USA Hockey
  coaching-education curricula — used as the floor, not the ceiling; the
  international sources above are where differentiated, evidence-based
  practice usually lives.
- **LTAD literature**: Long-Term Athlete Development model and its
  sport-specific adaptations (Balyi et al. and successors) — the stage
  philosophy (`STAGES` in the registry) should trace back to this
  literature, not just federation marketing copy.
- **YouTube coaching content**: search for channel/session content via
  transcripts and video descriptions (WebFetch on the video page, not
  screen-scraping video frames), plus channel reputation (subscriber count,
  federation/academy affiliation, upvote ratio) as a credibility signal.
  **Never transcribe** — every drill/finding sourced from a video must be
  rewritten in our own words and fitted into our Activity/Session/Skill
  formats (`docs/curriculum/content-architecture.md`).

## Workflow

1. Scope the sweep from the mode arg (e.g. a sport, a domain, a stage, or a
   specific backlog item from `docs/curriculum/DIRECTIVES.md`).
2. Dispatch parallel WebSearch/WebFetch agents, one per source category
   above that's in scope. Each agent returns a list of
   `{ claim, citationUrl, relevanceNote }` — the relevance note ties the
   claim to a specific gap in our content (a sport/domain/stage cell, or a
   named skill/activity).
3. **Adversarial filter agent**: reviews every returned finding and kills
   any that are (a) uncited (no working URL), or (b) stale — more than 3
   years old unless the source is foundational (e.g. original LTAD papers,
   long-standing federation doctrine that hasn't been superseded). Only
   findings that survive this filter become proposals.
4. Write the brief with every surviving finding, its citation, and which
   directive it would become. Every claim in the brief must carry a URL —
   an uncited sentence is a bug in the brief, not a stylistic nit.
5. Append surviving proposals to `docs/curriculum/DIRECTIVES.md` under a new
   `## Proposed (research YYYY-MM-DD)` section (the seed file already has
   this heading pattern — reuse it, don't create a second one). Each line
   is a checkbox directive the owner can curate (delete to veto, leave to
   let `refine` mode pick it up later).

## Output template

`docs/curriculum/research/YYYY-MM-DD-brief.md`:

```markdown
# Curriculum Research Brief — YYYY-MM-DD

Scope: <sport/domain/stage or backlog item requested>

## Findings

### <Source category, e.g. "DFB / KNVB">
- **Claim**: ...
  **Citation**: <https://...>
  **Relevance**: applies to <sport>/<domain>/<stage> — <why>

## Findings killed by the adversarial filter
- <claim> — killed: uncited / stale (published YYYY, no working corroboration)

## Proposed directives (also appended to DIRECTIVES.md)
- [ ] ...
```

Commit both files directly to main. Do not open a branch or PR for
`research` mode — only `refine` and `products` end in a PR.
