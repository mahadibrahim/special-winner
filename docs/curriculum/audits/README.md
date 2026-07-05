# Audits

Dated coverage/health reports produced by `/curriculum-refinery audit`, one
file per run: `YYYY-MM-DD-audit.md` (or a descriptive suffix, e.g.
`2026-07-05-minibook-print-qa.md` for a narrower QA pass). Audits are
read-only against the content registry and products — they never edit
`src/lib/curriculum/content/**` or the generated product files, so they
commit directly to `main` with no PR. Each report ends with a `##
Proposed directives` section; the owner curates which of those get copied
into `docs/curriculum/DIRECTIVES.md` for a future `refine` run — audit mode
itself never edits `DIRECTIVES.md`.
