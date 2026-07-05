# Curriculum Directives

Standing instructions for `/curriculum-refinery refine`. One directive per
line, checkbox format. Refine checks items off in the PR that implements
them. Delete a proposed line to veto it.

## Backlog (seeded 2026-07-05)

- [ ] Baseball has 1 skill — build out a starter baseball skill set across
      all four domains (target: ≥12 skills, fundamentals + skill-building)
- [ ] Hockey has skills but 0 activities — author hockey activities covering
      its 13 skills (target: ≥15 activities)
- [ ] Session plans exist only for soccer (11) and basketball (7) — add
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
- [ ] Sport-specific coach guidance floor for hockey + baseball: ≥1 prompt,
      1 resource, 1 principle each
- [ ] Discovery-stage starter set per sport: ≥4 skills weighted PH/PS over
      technique, per the stage's own philosophy (defer toward 2027 youth
      launch)

## Proposed (research YYYY-MM-DD)
<!-- research mode appends here; owner curates -->
