# Curriculum Directives

Standing instructions for `/curriculum-refinery refine`. One directive per
line, checkbox format. Refine checks items off in the PR that implements
them. Delete a proposed line to veto it.

## Backlog (seeded 2026-07-05)

- [x] Baseball has 1 skill — build out a starter baseball skill set across
      all four domains (target: ≥12 skills, fundamentals + skill-building)
- [x] Hockey has skills but 0 activities — author hockey activities covering
      its 13 skills (target: ≥15 activities)
- [x] Session plans exist only for soccer (11) and basketball (7) — add
      hockey session plans (target: ≥4, fundamentals)
- [x] Post-consolidation coherence check (2026-07-04 pass merged 15
      near-duplicate skills): confirm the soccer Shooting umbrella (absorbed
      Shooting-with-Laces) reads coherently, and re-verify the deliberately
      kept-distinct pairs still earn separate entries — soccer Dribbling vs
      Dribbling-with-Inside/Outside, Ball Control vs Ball Mastery-Toe Taps;
      basketball Passing vs specific pass types, Jump Shot vs Pull-Up
      variant, and the three-tier Layup family
      *(verified clean by the 2026-07-05 baseline audit: shooting umbrella
      coherent, no dangling references, progressions monotonic corpus-wide)*

## Adopted from 2026-07-05 baseline audit (owner-approved)

- [x] Backfill `skillsDeveloped` on all 99 untagged activities (soccer 49,
      basketball 50), citing only existing skill slugs; fix the 3 mis-/
      under-tagged activities (layup-lines, 1v1-to-goal, rondo-4v1-v2)
- [x] Fix the 4 fundamentals-tagged elimination games (soccer
      world-cup-game, world-cup-v2, musical-balls; basketball bump-out):
      make a non-eliminating format the default `howToPlay` or retag to
      skill-building+
- [x] Repair the 7 depth gaps: full pillar backfill for 3 soccer guide-only
      skills (dribbling-with-speed, creating-passing-angles,
      enjoyment-of-play); `description` for pick-and-roll-ball-handler,
      coordination, throwing-mechanics; `commonMistakes` for soccer
      coachability
- [x] Add `ageExpectations` + `bestAssessedIn` to the 10 thin basketball
      comprehensiveGuides
- [x] Normalize the 8 audit-flagged soccer skills (6 skill-building/development
      + 2 fundamentals) from 3→5 coaching tips/mistakes/behaviors
      (fundamentals-stage standard)
- [ ] Restore PH/PS above fundamentals: soccer skill-building +PH1/+PS2,
      development +PH1/+PS1; basketball skill-building +PH1/+PS1,
      development +PH1/+PS1 (fundamentals domain-ratio floors)
- [ ] Competitive-stage starter set for soccer + basketball: ≥5 skills each
      (T2/TA1/PH1/PS1); refinement stage gated behind it
- [x] Sport-specific coach guidance floor for hockey + baseball: ≥1 prompt,
      1 resource, 1 principle each
- [ ] Discovery-stage starter set per sport: ≥4 skills weighted PH/PS over
      technique, per the stage's own philosophy (defer toward 2027 youth
      launch)

## Proposed (research 2026-07-05)

Brief: `docs/curriculum/research/2026-07-05-brief.md` (citations there).
Delete a line to veto it; unchecked survivors are fair game for refine.

- [x] Anchor the hockey build-out on ADM/Hockey Canada numbers: station
      blocks 4-10 min, practice mix ~70% skills / 20% small-area games /
      10% team play; adapt the researched game concepts (Sharks & Minnows,
      Clean Your Room, Toy Finder, Corner Tires, 1v1v1 mini nets, Border
      Tag) with our elimination-free defaults
- [x] Anchor baseball fundamentals on USA Baseball LTAD's four core
      competencies (unordered; our sequence is editorial), tee/soft-ball equipment notes, and the
      keep-rules-minimal principle; adapt the researched activity concepts
      (Defend the Castle, grip→step→throw, two-hand catching, Run the Bases)
- [ ] Author PH/PS 9-15 content as maturation-anchored (not fixed-age)
      guidance per the 2021/2022/2025 reviews: pre-PHV = neural/coordination
      emphasis, through-PHV = keep frequency + add coordination; process
      goals + preparatory self-talk at 9-12; autonomy-supportive goal
      ownership at 13-15
- [ ] Competitive-stage (13-15) copy carries the specialization guardrails:
      hours/week ≤ age (ceiling 16), ≥1-2 rest days/week, ≥3 months/year
      off a single sport, delay single-sport specialization to ~13+
      (AOSSM/AAP/NATA)
- [x] Add one coaching principle on relative-age-effect awareness
      (bio-banding / birthday-banding as mitigation options)
- [ ] PLATFORM (not content): US Youth Soccer age-group formation moves to
      an Aug 1–Jul 31 school-year cycle for 2026-27 — audit program
      age-group logic, registration copy, and curriculum age-band text for
      birth-year-cutoff assumptions before the 2026-27 registration cycle
- [ ] Fix 19 stale progressionPath references in the 9 original
      comprehensiveGuide activities (pre-2026-07-11 wave; e.g. shark-attack
      → "3v3 to Small Goals" which doesn't exist) (found: refine 2026-07-11)
- [ ] Add a registry test validating comprehensiveGuide cross-references
      (progressionPath activity names, skillConnections skill names) — they
      are free text today and break silently on renames (found: refine 2026-07-11)
- [ ] Disambiguate the two activities both named "World Cup" (world-cup-v2,
      world-cup-game) — byte-identical display names (found: refine 2026-07-11)
- [ ] Deepen the remaining 24 thin soccer activities (ranks above the
      2026-07-11 depth-pass cut; ranking in that wave's report) (found: refine 2026-07-11)
- [ ] Coach-facing note on US Soccer heading volume limits for ages 11-13
      (≤30 min/wk) at the curriculum/stage level, not just inside
      heading-progression (found: refine 2026-07-11)
- [x] OWNER FEEDBACK (2026-07-12, rehearsal film review): every soccer
      activity must have a usable visual representation for the coach flow
      — audit `diagram`/`setupDiagram` coverage and quality across all
      activities; author missing ones (consistent format the product can
      render on a phone) (refine 2026-07-12: 25 authored, 15 reworked,
      4 basketball width fixes, format enforced by
      tests/unit/curriculum/diagrams.test.ts; product rendering of
      `diagram` in setup/field mode is a separate non-refinery follow-up)
- [ ] OWNER FEEDBACK (2026-07-12): enforce "everybody engaged all the
      time" as a hard authoring principle — audit ALL activities for
      elimination-without-reentry, lines/waiting, and spectator patterns;
      refine violators to constant-engagement variants (king-of-the-ring's
      toe-taps-reentry default is the model); add the rule to the authoring
      checklist so future content can't regress
