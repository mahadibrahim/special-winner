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
  `npx tsc --noEmit` clean. If the PR touches `src/lib/curriculum/content/**`,
  also paste the loader `--dry-run` table into the PR body (products-mode
  PRs that only touch minibooks/books code don't touch content, so this
  gate doesn't apply to them).
- Every research claim carries a citation URL. YouTube-sourced drills are
  adapted into our own words and format — never transcribed.
- Prod DB reads (audit --with-usage) need the user's per-run approval.

**Mode selection:** `audit` → read-only findings report. `research` →
findings brief + proposed directives. `refine` → implement directives.
`products` → generate/refresh minibooks, activity books, KDP books.
No mode given → ask which, listing the four with one-line descriptions.
