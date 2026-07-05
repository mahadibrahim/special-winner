# Audit mode

Read-only. Produces `docs/curriculum/audits/YYYY-MM-DD-audit.md`, committed
directly to main (docs-only commits skip deploy-affecting workflows — see
CLAUDE.md release process). Never edits `src/lib/curriculum/content/**`,
`src/data/minibooks/**`, or `src/pages/books/**`.

## 1. Enumerate the registry

Write a scratch script (don't commit it — use the scratchpad dir) that
imports the registry and logs counts per sport × domain(technical/tactical/
physical/psychological) × stage:

```ts
// scratchpad/curriculum-audit.mjs (or .ts via tsx)
import { CURRICULUM_CONTENT, validateRegistry } from "../src/lib/curriculum/content/index.ts";

const violations = validateRegistry(CURRICULUM_CONTENT);
console.log("validateRegistry violations:", violations.length, violations);

for (const kind of ["skills", "activities", "sessionPlans"]) {
  const rows = CURRICULUM_CONTENT[kind];
  const bySportStage = {};
  for (const r of rows) {
    const key = `${r.sport}/${r.stage ?? "n/a"}`;
    bySportStage[key] = (bySportStage[key] ?? 0) + 1;
  }
  console.log(kind, bySportStage);
}
```

Run with `npx tsx scratchpad/curriculum-audit.mjs`. This gives the raw
coverage numbers the report's coverage table is built from. Cross-reference
`docs/curriculum/content-architecture.md` for what each content kind is
supposed to contain (Activity Card Format, Session Plan Format, Skill
Assessment Format sections) — depth findings measure against that spec, not
vibes.

## 2. Dispatch parallel read-only reviewer agents

Fan out independent agents (they don't share state, so run them
concurrently):

- **(a) Coverage matrix** — sport × domain × stage grid from step 1; flag
  cells that are empty or thin relative to siblings (e.g. baseball has 1
  skill total vs. soccer's dozens).
- **(b) Depth consistency** — for every skill, check for a populated
  `comprehensiveGuide`, `progressionLevels` (5 levels), and non-empty
  `coachingPoints` (types in `src/lib/curriculum/content/types.ts`). Flag
  skills missing any of the three.
- **(c) Semantic reference health** — `validateRegistry` (from step 1) only
  checks structural things (unique slugs, resolvable natural-key
  references). This agent reads content in context: do cross-references
  make sporting sense (e.g. a soccer activity citing a basketball skill by
  coincidence of slug), do progressions actually get harder level to level,
  do coaching points contradict the stage's `keyPrinciples`.
- **(d) Product staleness** — for every file under `src/data/minibooks/*.ts`
  and `src/pages/books/*.astro` that carries a provenance header, extract
  its SHA with `parseProvenance` (`src/lib/curriculum/provenance.ts`) and
  diff against the current content SHA: `git log -1 --format=%h -- src/lib/curriculum/content`.
  Any product whose embedded SHA predates that commit is stale — list it
  with how many content commits behind it is (`git log --oneline <sha>..HEAD -- src/lib/curriculum/content | wc -l`).
- **(e) Optional `--with-usage`** — only when the mode arg includes
  `--with-usage`. This needs a live prod DB connection: ask the user to
  approve prod access and to provide the connection path (the owner keeps
  a note on the Railway credential procedure); never scan credential
  stores yourself. Once approved, run read-only counts only
  (assessed-skill counts, session-plan activity usage) — no writes, no
  schema queries.

## 3. Output template

```markdown
# Curriculum Audit — YYYY-MM-DD

## Coverage table
| Sport | Domain | Stage | Skills | Activities | Session plans |
|-------|--------|-------|--------|------------|----------------|
| ... |

## Findings

### Critical
- ...

### Important
- ...

### Minor
- ...

## Proposed directives
- [ ] ...
```

Write the file to `docs/curriculum/audits/YYYY-MM-DD-audit.md` (today's
date). Commit directly to main — no branch, no PR. If findings suggest
concrete backlog items, also append them under a new `## Proposed
(audit YYYY-MM-DD)`-style section — but per the Global Constraints, audit
never edits `DIRECTIVES.md` itself; that's `research` mode's job. Surface
proposals in the audit's own `## Proposed directives` section and let the
owner copy what they want into `docs/curriculum/DIRECTIVES.md`.
