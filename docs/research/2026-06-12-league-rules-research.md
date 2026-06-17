# League rules competitive research — Aspire rulebook source

**Date:** 2026-06-12
**Purpose:** Reverse-engineer an Aspire Sports rulebook (adult indoor, adult outdoor 7v7, coed addendum, youth rec) and a recommendation for how to publish rules on the site so they're clear and findable.
**Method:** Deep-research workflow — 5 angles, 22 sources fetched, 99 claims extracted, top 25 adversarially verified. 21 confirmed, 4 refuted. Operator facts are self-published rulebooks/FAQ pages (PDFs dated 2025-26).
**Operators:** Arena Sports, Resolute Athletic Complex (Columbus), Stars Indoor Sports (Columbus), SportsOhio (Dublin), plus US Youth Soccer / US Soccer policy for youth standards.

> **RESOLVED 2026-06-12 (founder):** All Aspire fields have **walls/boards**. The rulebook follows the **walled-arena branch** (Arena / Stars model), NOT the open-turf model. That means Aspire DOES adopt: kick-ins (or play-off-the-wall) at the perimeter, a **three-line violation in place of offside**, **boarding penalties**, GK throw-in/distribution restarts for end-netting balls, and ceiling restarts. Where this doc earlier said "do not copy the walled rules," that was the no-walls assumption — it is now reversed.

> **⚠️ SUPERSEDED IN PART (2026-06-17) — canonical product doc: `docs/sports/adult-soccer-leagues.md`** (transcribed from the published League Guide). This research stays authoritative as the **rulebook** source, **except** where it conflicts with the published offering:
> - **Season:** the published league is **7 games, NO playoffs** (the "8-game + playoffs" below was an outdoor/market estimate).
> - **Roster:** **up to 14 (7 to play)** (the "max 18" below was a market norm).
> The League Guide wins on those two points; everything else here (walled-arena rules, coed addendum, conduct/cards, standings, mercy) stands.

---

## Game format (indoor adult)

- **Clock:** two **24-minute running-clock halves**, 2-min halftime (Resolute / SportsOhio Columbus standard). Clock doesn't stop for fouls or subs. *(3-0)*
- **Format:** 7v7 incl. keeper (Aspire's stated format — fits norms; Arena/men's often 6v6). *(3-0)*
- **No offside** — universal indoor convention; state it explicitly. *(3-0, partly argument-from-silence + secondary corroboration)*
- **Restarts:** all kicks **direct**, taken within 5 seconds; **no goalkeeper punts** (punt → direct free kick at top of arc); **ball off ceiling/netting** restarts where it last crossed out (top of arc if over the penalty area). *(2-1 / 3-0)*
- **Substitution:** free / on-the-fly, outgoing player leaves before replacement enters. *(3-0)*
- **WALLED-VENUE rules Aspire ADOPTS** (all fields have boards — founder-confirmed): three-line violation in place of offside, boarding penalty, kick-in (or play-off-the-wall) at the perimeter, GK throw-in from penalty arc for end-netting balls, ceiling restart. Model directly on the Arena/Stars rulebooks. *(3-0 these exist at Arena/Stars)*

## Game format (outdoor 7v7 summer)

- 7v7 or 11v11, **40-minute halves**, ~8-game season; molded cleats OK outdoors. *(3-0)*

## Safety & conduct

- **Slide tackling banned** for field players (keeper exception in the box). *(2-1 / 3-0)*
- **Penalty-box card system** (recommended simpler two-card model from Stars over Arena's three-tier blue/yellow/red):
  - **Yellow = 2-min box**, released early if the opponent scores
  - **Red = 5-min box, no early release + automatic 1-game suspension**
  *(3-0 both operators' structures)*
- **Zero tolerance:** automatic red for spitting on turf / violent conduct; carded player must **leave the facility immediately**; **two reds in a session → suspended rest of session + next session**. *(3-0 Stars)*
- Mandatory: signed waiver before any play.

## Coed addendum

- **Minimum female field players:** Stars requires **2 on the field at all times** (1 to start); Arena requires 1 to start. Keeper is **gender-neutral**, excluded from the count. *(3-0)*
- **Substitution:** females may sub for males, **not vice-versa**. *(3-0)*
- **"Macho/safety rule":** a male driving the ball within arm's reach and above the waist of a female → foul at that spot. *(3-0)*
- **No goal-scoring modifiers** — rare in the market and recommended against (gimmicky, off-brand for social-first). *(3-0 no operator used one)*

## League administration

- **Rosters:** max **18 players**, waivers due by game 1, **roster locks after game 3**; non-rostered players risk forfeit. *(3-0)*
- **Minimum to start / forfeit:** field the minimum (per format) within a **5-minute grace window** or forfeit; forfeit recorded as a fixed score (Arena 3-0, Stars 5-0). Pair with a forfeit fee/deposit to deter no-shows. *(3-0)*
- **Standings:** **3 win / 1 draw / 0 loss**, tiebreakers in order: head-to-head → goal differential → fewest conceded → most wins → most scored. *(2-1, facts verbatim)*
- **Mercy:** record max **5-goal differential** (10-0 logged as 5-0); team down 5+ may add a field player until the gap closes. *(3-0)*
- **Payment enforcement:** non-refundable deposit + late fee enforces full payment before game 1. *(2-1, facts verbatim)*
- **Equipment:** shin guards mandatory; **no cleats indoors** (flat/turf shoes only). *(3-0)*

## Youth rec (U6–U12)

Operators publish game length and rosters but **not** age-band ball/field/heading detail — layer **US Youth Soccer standards** on top:

- Operator-derived: youth **20-minute halves** (Arena); 18-player roster + game-3 lock (Resolute). *(3-0)*
- US Youth Soccer / US Soccer policy (governing standard): **no heading at U11 and younger**; ball **size 3 (U6–U8), size 4 (U9–U12)**; reduced sides and field for younger bands; de-emphasized score-keeping for youngest divisions. *(medium — from governing-body docs, not operators)*

## How to publish rules on the website (the navigation question)

**Market norm:** standalone **dated PDF rulebook** linked from the league page (Resolute, Stars, Arena), sometimes a short inline FAQ. PDFs are authoritative but **hard to search, hard to deep-link, and go stale** — Arena still serves 2020/2021/2022 vintages side by side, which is exactly the confusing navigation the founder wants to avoid.

**Recommendation:** publish rules as a **structured, navigable HTML page** with per-section anchors (indoor adult · outdoor 7v7 · coed addendum · youth rec), version-dated, linked prominently from each league landing page. Keep a printable PDF as a *secondary export*, not the source of truth. This beats the PDF-only norm on discoverability and fits the evergreen-page IA already planned (league landing page → "Rules" anchor).

---

## Caveats

- **Wall-vs-lines** is the biggest applicability caveat — confirm Aspire's physical venue before copying any restart/out-of-bounds rules.
- Dollar figures, point totals, and goal caps are operator business choices, not industry standards — reference points, not mandates.
- Youth age-band detail is from US Youth Soccer policy, not the commercial operators (who didn't publish it).
- **4 refuted claims** (all 1-2): several Stars marketing-page paraphrases lost to the more authoritative Stars PDF — substance mostly preserved in confirmed claims, just sourced to the wrong page. No US Indoor / USSSA / Maryland SoccerPlex / The Plex primary claims survived — governing bodies are underrepresented; a targeted follow-up could firm up the youth section.

## Open questions

1. US Youth Soccer specifics by age band (ball size, field dims, sides, game length, heading cutoff) for the youth section.
2. **Do Aspire's facilities have boards/walls/netting?** Determines the entire restart model.
3. Coed: require 2 female field players (Stars) or 1 to start (Arena)? Any scoring modifier, or macho/safety rule only? (Recommend: 2 on field, no modifier.)
4. What US Indoor / USSSA actually publish — requested but unverified here.

## Key sources

- https://resoluteac.com/soccer-leagues-faqs/ · https://resoluteac.com/youth-soccer/
- https://starsindoorsports.com/wp-content/uploads/2026/03/Adult-Soccer-League-Rules-Spring-2026.pdf
- https://www.arenasports.net/soccer/adult-leagues/rules-regulations/ + dated rulebook PDFs
- https://sportsohio.org/play/sports-activities/soccer/leagues/
- https://www.usyouthsoccer.org/.../Player-Development-Initiatives-2017.pdf · https://www.ussoccer.com/stories/2017/08/five-things-to-know-how-smallsided-standards-will-change-youth-soccer
