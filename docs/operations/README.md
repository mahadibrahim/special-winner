# Operations Catalog

This directory holds the source-of-truth operating model for Aspire Sports.

## Layout

- `catalog/` — source YAML files (the canonical operating model)
  - `roles/` — one file per role
  - `features/` — one file per platform feature stub
  - `artifacts/` — checklist / form / signature / event / counter templates
  - `activities/` — one file per game-day activity
- `artifacts/` — generated outputs (committed; PRs show downstream effects)
  - `manuals/role.<id>.md` — per-role manual chapters (worker roles only)
  - `automation-backlog.json` — engineering input
  - `runbooks/<venue>/<date>.md` — generated on demand
  - `addendums/<sport>.md` — generated on demand
  - `raci-matrix.csv` — generated on demand

## Editing

1. Branch from `main`.
2. Edit YAML files in `catalog/`. One activity per file. See `docs/superpowers/specs/2026-05-06-game-day-operating-model-design.md` for the schema.
3. Run `npm run catalog:validate` to check schema, references, and smell flags.
4. Run `npm run catalog:render` to regenerate artifacts.
5. Commit catalog edits + regenerated artifacts in the same PR. CI rejects PRs where `artifacts/` is out of sync with `catalog/`.

## Catalog change migration

Every catalog-modifying PR description must include either:

- `migration: none — additive only` (when the change purely adds new activities/roles/features/artifacts), or
- A migration plan covering: which in-flight events are affected, whether they snapshot at the old catalog or upgrade, and any one-off operator notifications needed.

In-flight events default to snapshotting at the catalog version present at scheduling time.

## Ad-hoc views

```
npm run catalog:render -- --view raci-matrix
npm run catalog:render -- --view sport-addendum --sport outdoor:flag_football
npm run catalog:render -- --view runbook --venue worthington --date 2026-06-03
```

## Quarterly review

The Director walks the catalog quarterly:

- Activities not modified in 90+ days: still accurate?
- Activities with `accountable: role.director` outside `post_day`: should this be delegated yet?
- Features in `automation-backlog.json` that are still `stub` after a year: still relevant or drop?

## See also

- Design spec: `docs/superpowers/specs/2026-05-06-game-day-operating-model-design.md`
- Implementation plan: `docs/superpowers/plans/2026-05-06-game-day-catalog-infrastructure.md`
- CLI: `scripts/ops-catalog/`
