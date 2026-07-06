# Training walkthrough videos

Six scripted product tours, each recorded as a 1280×720 video with
timestamped captions and per-step screenshots. Regenerated on demand —
never committed, never run in CI.

## Prerequisites

1. A dev server running against a **staging** database (never prod — these
   walkthroughs write real rows, guarded by dedicated `training+<role>@…`
   fixtures, but only staging is safe to point at):
   ```bash
   npm run dev:bws
   ```
2. Seed data, including the training fixtures these walkthroughs depend on
   (referee role/account, training applicant, training coach, training
   curriculum sequence):
   ```bash
   npm run db:seed:e2e
   ```
   Re-run this before every regen — several walkthroughs (admin-hire-
   compliance's "mark hired", referee-gameday's score report) reset their
   fixture's "before" state on every seed run so the recorded video always
   shows the full flow rather than an already-completed one.

## Regenerating

```bash
npm run training:videos                      # all six
npm run training:videos -- coach-core        # just one, by file-name substring
```

`TRAINING_BASE_URL` overrides the default `http://localhost:4321` if the dev
server is on a different port/host.

## Output layout

```
training/output/<workflow>/
  video.webm       # 1280x720 recording of the whole tour
  captions.json    # [{ index, caption, timestampMs, screenshot, deckSlug? }, …]
  00-*.png          # per-step screenshots, one per tour.step() call
  01-*.png
  …
```

`training/output/` is gitignored — nothing here is repo content.

## Feeding the training decks

Steps tagged with a `deckSlug` (an ops-catalog activity id minus its `act.`
prefix) ALSO copy their screenshot to
`training/screenshots/<role>/<deckSlug>.png` — the exact path the deck
generator reads. Unlike `training/output/`, this directory IS repo content
and gets committed — it's the real asset the deck generator embeds, and the
render embeds whatever is present automatically (no flag). After a video
regen:

```bash
npm run catalog:render
```

produces `docs/operations/artifacts/training/role.<id>.deck.html` files with
real screenshots inlined wherever a walkthrough supplied one. Most
walkthrough steps have no catalog counterpart — see the plan's Scouting
Finding 1 — so only `referee-gameday` (2 slugs) and `venue-manager` (1 slug)
currently feed a deck slot.

## Workflows

| Workflow | Role | Signs in as | What it shows |
|---|---|---|---|
| `coach-core` | coach | `TEST_USERS.coach` | Roster → attendance → player assessment |
| `coach-practices` | coach | `TEST_USERS.coach` | Practice sessions, sequence progress, reflection |
| `admin-hire-compliance` | director | `TEST_USERS.admin` | Applications → mark hired → coach credentials |
| `admin-sequencing` | director | `TEST_USERS.admin` | Curriculum sequence → attach to a season |
| `referee-gameday` | ref | `TRAINING_USERS.referee` | Assigned matches → final score report |
| `venue-manager` | venue_manager | `TEST_USERS.admin` | Command center → check-in → reports |

`TEST_USERS`/`TRAINING_USERS` are defined in `tests/utils/test-helpers.ts`
and `src/lib/db/seeds/seed-e2e-tests.ts` respectively — walkthroughs import
them rather than hardcoding credentials.

## Known issues found while building this pipeline

- **No page under the Aspire chrome mounts sonner's `<Toaster />`.**
  `src/layouts/BaseLayout.astro` never renders one; only five standalone
  SoccerOne marketing pages mount their own local `<Toaster />`. Every
  `toast.success`/`toast.error` call in every admin/coach component (58
  files import from `"sonner"`) is a silent no-op today — nothing appears
  on screen. Discovered while writing the `admin-sequencing` walkthrough,
  which had to assert on the attach API's own network response instead of
  the (never-rendered) success toast. Not fixed as part of this plan —
  mounting a global `<Toaster />` touches shared layout used by every page
  in the app, out of this plan's scope.
