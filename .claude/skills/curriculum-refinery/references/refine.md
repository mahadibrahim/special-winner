# Refine mode

Implements curriculum directives. Ends in a PR — **never merge it**. Only
touches `src/lib/curriculum/content/**` (and its tests) plus the directive
checkboxes in `docs/curriculum/DIRECTIVES.md`. No schema, no migrations, no
unrelated code.

## 1. Resolve the work items (priority order)

1. **Inline arg** — if the mode was invoked with explicit work (e.g.
   `/curriculum-refinery refine "build out baseball fundamentals skills"`),
   that is the work item, full stop.
2. **Unchecked `- [ ]` lines in `docs/curriculum/DIRECTIVES.md`** — default
   when no arg is given. Take items from `## Backlog` first, then any
   curated `## Proposed (research ...)` lines the owner has left unchecked
   (a line still present under a Proposed heading means it wasn't vetoed).
3. **`--from-audit`** — restrict to unchecked lines that trace back to the
   most recent file under `docs/curriculum/audits/` (its own
   `## Proposed directives` section), ignoring the rest of the backlog.

## 2. Branch

`git checkout -b refinery/refine-YYYY-MM-DD` (today's date) from `main`.

## 3. Per work-item implementation

For each directive, dispatch one **writer agent**, anchored on:
- `docs/curriculum/content-architecture.md` — the authoritative format for
  whatever content kind is being added (Activity Card Format, Session Plan
  Format, Skill Assessment Format, Development Stage Overview Format).
- **2–3 same-kind exemplar entries** already in the registry — e.g. adding
  a baseball skill, hand the agent 2–3 existing soccer or basketball skills
  from `src/lib/curriculum/content/{soccer,basketball}/skills.ts` at a
  comparable stage so tone, field depth (`comprehensiveGuide`,
  `progressionLevels`, `coachingPoints`), and structure match.

Then dispatch **adversarial reviewer agents** per item (parallel, read-only
against the diff):
- **Sport accuracy** — is the technique/tactic description correct for the
  sport (a soccer reviewer should not wave through a hockey-specific cue
  mislabeled as soccer).
- **Age/stage fit** — does the content match the stage's `keyPrinciples`
  and developmental appropriateness (no adult-level tactical complexity in
  a `discovery`-stage entry).
- **Principles consistency** — does the new content contradict or ignore
  `coachGuidance.principles` that apply to its sport/stage scope.
- **Reference integrity** — any natural-key reference (skill slug,
  domain name, stage slug) the new entry cites must resolve; re-run
  `validateRegistry` mentally against the new entries, don't just trust the
  writer agent.

Revise until reviewers are clean, then **check off the directive's `- [ ]`
line** in `docs/curriculum/DIRECTIVES.md` (`- [x]`) in the same PR — don't
leave implemented directives unchecked for a future PR to find.

## 4. Content-count rule

Per the Global Constraints: content counts only grow or hold. If a
directive requires removing an entry, it must be an **explicit** directive
line saying so, and the PR body must carry a warning that the loader
(`scripts/curriculum-load.ts`) upserts by natural key and cannot delete
rows — a removed entry in the registry does not delete the corresponding
DB row; that requires a manual follow-up migration or script, out of scope
for this skill.

## 5. Gates (must all pass before opening the PR)

```bash
npx vitest run tests/unit/curriculum   # registry, provenance, snapshot tests — must be green
npx tsc --noEmit                       # zero errors
```

Then a loader dry-run against staging, to prove the new content
upserts cleanly:

```bash
./scripts/with-bws.sh bash -c 'ALLOW_CURRICULUM_SEED=yes npx tsx scripts/curriculum-load.ts --org aspire-sports --dry-run'
```

(`with-bws.sh` supplies the staging `DATABASE_URL`; `--dry-run` only reads
current rows and prints the plan — it writes nothing. Never pass
`--steal-guidance` from this skill.)

## 6. PR body

- One bullet per directive implemented, describing what changed and where.
- The loader `--dry-run` table pasted verbatim.
- A removal warning (see §4) if any directive removed content.
- Do not merge — hand the PR to the user/reviewer.
