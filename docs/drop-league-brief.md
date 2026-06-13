# The Drop League — Product & Operations Brief

> Imported from `drop_league_brief.docx` (founder-provided) 2026-06-13. Source of truth for the Drop League product line. Confidential / internal.
> **Tagline:** Score goals. Make friends. Drop pounds.

## 1. Overview
A weekly indoor soccer program where weight loss is built into the competitive structure. Players (Men's and Women's divisions) weigh in before each match; pounds dropped during the week become **bonus "Drop Goals"** added to the match score. The table is decided by on-pitch results **plus** off-pitch progress. Not a fitness class with a soccer theme — a properly structured league (refs, standings, trophies, seasons) using sport as the vehicle for sustained weight loss. A **distinct product line** within Aspire: shares the turf + league-management infrastructure but needs its **own registration flow, scoring engine, billing, and coaching role.**

## 2. Who it's for
- **Eligibility: adults BMI ≥ 27.5** (gate at registration). Keeps the environment peer-comfortable; players near a healthy weight have nothing to gain from the weigh-in mechanic.
- No soccer experience required.
- **Men's Division** (18+, BMI 27.5+) — sessions **Mondays**. **Women's Division** — sessions **Wednesdays**. Separate league tables. Private weigh-in before each session.
- Co-ed division is a future-season possibility; launch single-gender.

## 3. Season structure
- **14-week seasons, once/week** on a fixed day (Men's Mon, Women's Wed). Must **not overlap** Aspire's regular recreational league nights on those days.
- **Back-to-back seasons, ~1-week gaps** (subscription is continuous; gaps create cancellation moments). Exceptions: Dec/Jan holiday window + July 4.
- Sample first-year calendar in the brief uses **2025-26 dates** (Season 1 Sep 8 2025 → … → Season 5 Oct 12 2026–Jan 4 2027) — **these are template dates; confirm real dates against the facility calendar.**
- Rules: join at season start (no mid-season registration); **operator-assigned teams of 6-8** (players join as individuals); final weight carries forward as next season's start weight; reaching healthy BMI → "maintenance scoring," stay active; subscription rolls across seasons, no re-enrollment until cancel.

## 4. Session schedule
Two divisions on separate nights so one coach + ref cover both. **50-min session** = 15 weigh-in + 30 match + 5 debrief. Session times TBD at launch, **fixed all season**. Confirm no Mon/Wed regular-league overlap.

## 5. Match format
6-a-side (7 if dimensions allow). Two 14-min halves, 2-min half. Roll-on/off subs. One ref/match. Min 4 weighed-in players to field a team (else forfeit). May borrow up to 2 weighed-in players from a non-playing roster.

## 6. Scoring system (the core mechanic)
Final score = **Pitch goals + Drop Goals**. A team losing 3-0 on the pitch can still win on the scales.

| Scoring event | Points | Notes |
|---|---|---|
| Team weight-loss bonus | 0.5 pt/player losing vs prior week | Max 5/week (1 per 2 players). Healthy-BMI players earn 1 full pt for maintaining. |
| Individual hat-trick | +1 goal | 3 weeks of loss (non-consecutive). Max 4/season. |
| 5% milestone | +3 goals (one-time) | From season-start weight. |
| 10% milestone | +3 goals (one-time) | From season-start weight. |
| Food diary tracking | +1 goal per 1-3 players tracking | Weekly diary submitted to coach. |
| Weight-gain own goal | −1 goal | Weight exceeds prior week AND season start. Not week 1. |
| Maintenance player | +1 full pt/week | After healthy BMI reached. |

`Final = Pitch + Team bonus + Hat-tricks + Milestones + Food diary − Own goals`. **Bonus goals auto-calculated by the app from weigh-in data**; coach enters pitch score, system produces final. Cup-final tiebreaker: total weight-loss goals → penalty shootout.

## 7. Weigh-in protocol (non-negotiable)
Private (one player + coach, behind a screen). Same calibrated scale, same spot, weekly. **No weigh-in = no play**, no retroactive entry. Never announced/posted. Coach records directly in the app. Injured players still weigh in (counts for team bonus). Coach does a 30-sec genuine check-in each weigh-in — the retention relationship.

## 8. Coach role
One dedicated coach/session (≠ referee). Pastoral + administrative: weigh-in, data entry, debrief, food-diary collection, flagging players needing support. Not a dietitian; personable/consistent/discreet, basic motivational-interviewing training. ~90 min/session. One coach handles ≤40 players/night and can cover both divisions (different nights).

## 9. Pricing
- **Registration: $25 one-time** (BMI assessment, profile, handbook, team assignment; non-refundable; once per player, not per season).
- **Monthly membership: $95/month** (rolling, no fixed end; covers session, ref, weigh-in, online resources, standing). **Brief benchmarks against Man v Fat's $99/mo US rate** and sets Aspire's at **$95**. *(Founder verbally said $99 — confirm which.)*
- Billing starts at team assignment; continuous across seasons; cancel = stop at end of billing month, re-join next season only.
- Revenue model: 36 players/division/season → $3,420/mo/division; ~$11,970/division/14-wk season; **~$95,760/yr** both divisions × 4 seasons (pre-cost).

## 10. Landing page
Dedicated URL (e.g. `aspiresports.com/drop-league`), Aspire brand. Sections: hero (tagline + "Find your division"), the concept (how it works / who it's for), the dual-score explainer (match-card mockup), division cards (Men's Mon / Women's Wed, dates + spots + register), results/social-proof (once data exists), FAQ, separate Men's/Women's registration CTAs (collect name/email/phone/DOB/height/weight for BMI), footer disclaimer "not affiliated with Man V Fat Ltd."

## 11. Web-app requirements (NEW unless noted)
- **Player registration + BMI gate** (height/weight → BMI; block < 27.5; store season-start weight)
- **Weekly weigh-in entry** (coach screen; delta vs prior week + season start)
- **Bonus goal engine** (auto-applies all §6 rules)
- **Live scoreboard** (pitch + bonus → final; updates table)
- **League table** (extend: add Bonus Goals + Total Goals cols; per-division)
- **Player dashboard** (weight chart, hat-trick tracker, milestone badges, standing)
- **Food diary submission**
- **Season management** (extend: dates, team assignment, weight carry-forward; overlapping Men's-Mon/Women's-Wed seasons)
- **Subscription billing** ($95/mo rolling + $25 reg at signup)
- **Coach dashboard** (roster, fixtures, weigh-in, injured-flag, notes)
- **Landing page** + **email/SMS nudges** (24h reminder, weekly summary)
- **Division selector** (Men's/Women's toggle across all league views)

**New data model:** `player_health_profile`, `weekly_weigh_in`, `match_result`, `food_diary_submission`, `season` (division mens/womens), `subscription`.

**Privacy:** weight is sensitive health data — **encrypted at rest**, visible only to player + coach (never public), explicit consent at registration; only bonus-goal totals (not weights) on scoreboards.

## 12. Pre-launch checklist
Ops (scale, privacy screen, coach, refs, locked session times, calendar block, bibs, trophies); Legal (health responsibility statement, privacy-policy update for weight data, USPTO search for "The Drop League", Man V Fat disclaimer); Web app (BMI gate, billing, weigh-in, scoring engine tested all scenarios, weight carry-forward, dashboard, division selector); Marketing (landing page, confirmation email, 24h reminder, launch social).

## 13. Brand notes
"**The Drop League**" (definite article) formal; "Drop League" shorthand. Tagline "Score goals. Make friends. Drop pounds." Tone = competitive sports league, **never** failing/broken/patient framing; no before/after. In-program language: **weigh-in, Drop Goals, Drop Day, Big Drop** (5%/10% milestone).

---

## Reviewer notes (not in the original brief)
- **Architecture:** Drop League is a **product line build**, not a catalog season or a simple membership tier. It correctly stays OUT of the 2026-27 season seed.
- **Pricing conflict:** brief = **$95/mo**; founder verbally = **$99/mo**. Resolve before billing setup. ($99 is Man v Fat's rate; brief deliberately set $95.)
- **Stale/template artifacts:** the §3 calendar is 2025-26 sample dates; §9 references **"Marion's market size"** — likely a leftover from a Man-v-Fat-franchise template (Aspire is Columbus). Treat city/dates as placeholders.
- **Scheduling conflict to resolve:** Drop runs Men's-Mon / Women's-Wed; the 2026-27 seed places regular leagues on Mondays/Wednesdays too — these must be deconflicted by field/time when scheduling.
