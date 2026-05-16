# Admin deep-dive · audit findings

**Date:** 2026-05-17
**Method:** Manual click-through against prod (`https://aspiresportsohio.com`) signed in as `mahad.ibrahim@gmail.com` (super_admin). Console errors captured via Chrome MCP.
**Pre-reqs satisfied:** PR #59 merged. Day-0 seed live in prod (1 sport, 4 venues, 8 age groups, 4 programs, 3 seasons, 2 teams, 4 games, FOUNDERS code). Gmail dot-trick normalization active.

## Severity scale

- **P0** — blocks customer journey (signin fails, payment fails, registration cannot complete)
- **P1** — admin can't do their job (can't create / approve / edit core entities)
- **P2** — polish (copy issues, slow page, misleading affordances, broken-looking empty states)

## Effort scale

- **S** ≤2h · **M** ~½ day · **L** 1-2 days · **XL** ≥3 days (deferred → follow-up issue)

## Findings by page

<!--
Template:

### /admin/<path> — <name>
- **Status:** OK | EMPTY-STATE | PARTIAL | BROKEN
- **Severity:** none | P0 | P1 | P2
- **Effort:** S | M | L | XL (deferred → issue link)
- **Fix PR:** Plan | People | Money | Setup | Reports | Customer-flow | deferred
- **Findings:**
  - <bullet>
- **Notes:**
  - <optional>
-->

---

## Summary table (populated at end of audit)

| Page | Status | Severity | Effort | Fix PR |
| --- | --- | --- | --- | --- |
