# Chain rehearsal: director → coach → parent (soccer)

A ~20-minute scripted walkthrough of the full JTBD chain on staging data:
a director designs and distributes a soccer session, a coach runs it live,
a parent sees the glow. Run it before demos, after big coach-portal
changes, or as the dry run before a real-coach field pilot.

**What this proves that automation doesn't:** the chain feels right with
real soccer content — prompts read sensibly mid-drill, chips sound like a
human wrote them, and nothing in the hand-offs (distribute → notification →
badge → glow → parent feed) feels mechanical.

## Environment

- Start the dev server against staging: `npm run dev:bws` (add `-- --host`
  if you want to drive the coach steps from a real phone on your LAN).
- Three browser profiles (or two browsers + a phone), one per persona:
  - **Director:** `admin@test.aspiresports.com` / `TestAdmin123!`
  - **Coach:** `coach@test.aspiresports.com` / `TestCoach123!`
  - **Parent:** `parent@test.aspiresports.com` / `TestParent123!`
- The seeded coach team has an active roster including the seeded parent's
  child (this linkage is what the coach-glows e2e relies on; if the parent
  step fails, re-run `npm run db:seed:e2e`).

## Act 1 — Director designs and distributes (~7 min)

| # | Do | Expect |
|---|----|--------|
| 1 | As director, open a soccer program's season and its **Blueprint** workspace (Admin → Programs → pick a soccer program → season → Blueprint). | Program-type-aware arc (weeks for classes, days for camps); the season age band visible; template rail on the side, stage-filtered. |
| 2 | Click a template from the rail into an arc slot. Pick one whose stage matches the season's band. | Slot fills; no warning chip. |
| 3 | Deliberately pick an off-stage template for a second slot. | A dismissible stage-skew warning appears — dismiss it and confirm the acknowledgement records (who/when shown on hover or in the slot detail). |
| 4 | Hit **Distribute** and read the preview. | Groups × dates grid; conflicts and already-distributed counts honest; the group noun matches the program type (never "team" for a camp/class). |
| 5 | Confirm distribution. | Success state; the delivery strip appears per slot showing "scheduled" markers per group. |

## Act 2 — Coach runs the session (~8 min)

| # | Do | Expect |
|---|----|--------|
| 6 | As coach, open the dashboard. | "New program plan" card names the director and the program with the right group noun. |
| 7 | Go to Practices; find the distributed session. | Card shows the "Program plan · from {director}" badge and a **Set up session** button. |
| 8 | Open **Set up session**. | Objectives + focus skills up top; segment timeline matches the template the director chose; equipment checklist populated from the drills; roster glance with count. The adapted-note under the plan links to the session page and reads warm, not scolding. |
| 9 | Tap **Start session**. | Field mode: big current-segment card with elapsed timer; next-up peek; attendance sheet appears (everyone defaulted present — flip one kid to absent, tap Done). |
| 10 | Read the prompt card while "in" the first drill. Tap it 3–4 times. | Prompts cycle; at least some are **specific to the drill's skill** (post-refine-wave, every soccer skill has 3). They should read like a coach whispering in your ear, not a fortune cookie. |
| 11 | Tap **advance** to the next segment. | Segment card changes; prompt pool re-anchors to the new drill's skills. |
| 12 | Tap a player chip → tap a glow chip. Tap another player → type a short observation → Save note. | Half-sheet opens with curated soccer glow chips (skill-specific first); both captures accepted with no visible lag; the absent kid's chip renders dimmed. |
| 13 | Tap **End session** → walk the wrap-up: confirm attendance → step 2. | Both captures from step 12 are listed with the players' first names — including any that already synced (this exact path regressed once; see PR #364). |
| 14 | Promote the glow ("Share with family"), keep the observation private, add one line of reflection, **Finish**. | Done screen ("Session wrapped up"). Reload the page — read-only done state. |
| 15 | Back as **director**: reopen the Blueprint delivery strip. | That group's marker flipped to **delivered** (or **adapted** if you edited segments in step 8). |

## Act 3 — Parent sees the glow (~3 min)

| # | Do | Expect |
|---|----|--------|
| 16 | As parent, open the dashboard. | The promoted glow appears in recent glows for their child, phrased exactly as the chip read (curated language, parent-appropriate). |
| 17 | Confirm the private observation is NOT visible anywhere in the parent view. | Only the promoted glow shows; kept-private notes never reach parents. |

## Scoring

Pass = every Expect holds AND nothing in the flow made you wince
(copy, latency, layout on the phone). Log wince-moments even on a pass —
they're the backlog for the polish wave. If any Expect fails, capture the
step number + a screenshot and file it against the coach-session-lifecycle
follow-ups list.
