# Aspire Sports Financial Model — Design Spec

**Date:** 2026-04-15
**Status:** Approved, ready for implementation planning
**Author:** Mahad Ibrahim (with Claude)

---

## 1. Purpose

Build a 5-year financial model for the Aspire Sports operating business (the youth sports programs to be run in Central Ohio — not the SaaS platform that will power them).

The model has four concurrent uses, in priority order:

1. **Partner pitch** — primary near-term use. The model is the central artifact in conversations with a potential local operating partner who will contribute both cash and labor.
2. **Operating plan** — a real monthly budget to run the Year 1 launch against.
3. **Go/no-go discipline** — stress-tested enough to reveal whether the business is viable before either partner commits material capital.
4. **Franchise unit economics foundation** — Year 1 is modeled as a single unit so that later corporate locations and eventual franchisees inherit a credible template.

The founder is comfortable with operational assumptions and is **least confident about customer acquisition cost (CAC)**. The model must treat CAC as a first-class, heavily stress-tested variable.

## 2. Business context

### Geographic scope
- Year 1 focus: **Dublin (43016/43017) and Powell (43065)**, Ohio.
- Target market: parents of kids ages ~5–14 in high-income suburban zips with existing willingness to pay for premium youth activities.
- Expansion-capable: model parameterizes "number of target zips" so adding a third zip in Year 2 is an input change, not a rewrite.

### Product strategy — two anchor sports, complementary seasons
- **Rec soccer** and **rec flag football** are the two launch sports.
- Both are outdoor and share fields, coaches, and seasonal rhythm.
- Both are fall-heavy, so the ~4-month winter dead zone (December–March) is filled with an **indoor skills training academy** running out of a known underutilized indoor facility.

### Sequencing (multi-year)
1. **Year 1 — Rec leagues (soccer + flag) + winter skills training.** The identity: a league operator that also trains.
2. **Year 2 — Competitive club / travel teams.** Natural upsell from the winter skills academy; kids who trained weekly are the first tryout pool, parents already trust the coaching.
3. **Year 3 — School-partner programs.** Top-of-funnel acquisition channel feeding kids into leagues and competitive teams; not a standalone business.
4. **Year 3–4 — Facility decision gate.** Optional. Modeled as a "go/no-go" with its own mini-pitch inside the main model; *not* a committed line item. Only triggered once four revenue streams can justify the lease.

The partner pitch story: capital-light first, capex last. Year 1 demonstrates demand and cash flow on low-risk offerings; material capital deployment waits until the franchise unit template is proven.

### Positioning thesis
The pitch is "**a better product than i9**, priced the same."

Market research confirms i9 Sports (Dublin/Hilliard/Westerville/Powell) is successfully charging $169–$189 for 6-week commercial rec seasons, while paying coaches ~$14/hr with template programs and no meaningful curriculum. Aspire's differentiation is:

- **Higher coach pay (~$22/hr base case)** to attract better coaches.
- **Structured curriculum** — the uncommitted curriculum work (guides, minibooks, practice planner) in the codebase becomes the pitch's physical differentiation, not a side feature.
- **Better retention** as the financial expression of the product differentiation.

Retention is the single most important assumption in the model, because every point of retention improvement compounds across 5 years. "Better product than i9" must cash out as a higher retention curve in the model or the pitch is empty.

### Data point that shapes the pitch
The research surfaced that **Resolute Athletic Complex's $20/session small-group soccer training in Columbus is currently sold out**. This is the single most valuable data point from market research: it's proof of unmet demand at a price Aspire can match or beat. Should be the opening slide of the partner pitch.

## 3. Partner / capital structure (base case)

- **Dual-operator partnership.** Both partners contribute cash **and** labor, doing different work.
  - Founder role (mahad): product, software, curriculum, marketing strategy.
  - Local partner role: local operations, facility relationships, coaching hires, on-the-ground execution.
- **Equity:** 50/50 base case. Adjustable via a single assumption cell if the final deal skews.
- **Cash contributions:** equal, timed at launch + reserve capital called only if needed.
- **Distribution policy:** no distributions until (a) working capital reserve is above a safety floor, and (b) contributed cash is fully returned to both partners. After that, 50/50 based on equity.
- **Founder time imputed at $80K/year per founder** even if cash comp is below that in Year 1. This prevents the P&L from overstating margin.

## 4. Facility arrangement

- A local indoor facility is available via the partner's network (facility owner is a friend of the local partner, facility is underutilized, owner is expanding to a second location).
- **Base case assumes hourly rental at market rate — no friend discount.** Rationale: the pitch must defend itself at face value; a model that depends on favors is fragile. Discount scenarios become upside, not base.
- **Market-rate placeholder:** $175/hr full indoor turf, $95/hr half field, $70/hr gym (anchored to Dublin CRC and Soccer Field Academy Columbus verified rates).
- **Year 3–4 facility acquisition is a separate decision gate**, not a Year 1 commitment.

## 5. Deliverables

Two connected artifacts sharing a single source of truth.

### 5.1 `aspire-financial-model.xlsx` (authoritative)
A real Excel file the partner can take home and tinker with, generated by a Python script in the repo (`scripts/financial-model/build_model.py`). Generated from code so that:
- The whole model is version-controlled and regenerable.
- Assumption or formula changes trigger a re-run and commit.
- "Which version did I email?" chaos is avoided.

Tabs (left to right):
1. **Cover & README** — explanation, audience, confidence levels, changelog.
2. **Assumptions** — every editable input, color-coded by confidence level. The only tab the partner should need to touch to run their own scenarios.
3. **Revenue — Year 1 (bottoms-up)** — team-by-team, session-by-session build for Fall 2026, Winter 2026/27, Spring 2027. Every cell traceable.
4. **Revenue — Years 2–5 (cohort)** — cohort retention engine.
5. **Costs** — variable + fixed, split into "cash out this month" and "expense this month" to support separate P&L and cash flow views.
6. **P&L (monthly + annual roll-up)** — standard income statement.
7. **Cash flow (monthly)** — the tab partners care most about. Shows when cash goes negative and when it recovers.
8. **Partner returns** — contributions, distributions, payback month, IRR, MOIC.
9. **Sensitivity** — tornado chart + two-variable heatmaps.
10. **TAM sanity check** — Dublin + Powell addressable kids vs. implied market share.
11. **Scenarios** — base / downside / upside columns.

### 5.2 `scripts/financial-model/web/` (interactive overlay)
A small Astro page inside this repo at `/internal/financial-model`, **behind auth — not public**. Reads the same underlying assumptions YAML and renders:
- Slider panel for the top ~10 assumptions (price, fill rate, retention, CAC, season structure).
- Live-updating charts: monthly revenue, cash balance, cumulative partner distributions, Year 5 net income.
- Scenario toggler: base / downside / upside in one click.
- Partner returns waterfall (interactive view of contributions, distributions, cumulative return by month).
- Print-to-PDF view for pitch-meeting handout.

Designed to be *usable in the meeting itself*: the partner asks "what if CAC doubles?" and the founder moves a slider and the answer appears before the partner finishes the question.

### 5.3 Data flow
- `scripts/financial-model/assumptions.yaml` is the **single source of truth**.
- The Python build script reads YAML and emits the xlsx.
- The web app reads the same YAML at build time for its defaults.
- When an assumption changes: edit YAML → re-run script (regenerates xlsx) → rebuild site.
- One source, two outputs. The spreadsheet and the web app can never disagree.

### 5.4 Time horizon and granularity
- **5 years, monthly.** 60 columns.
- Rolled up to annual summary views for the P&L so no one has to stare at 60 columns by default.
- Monthly granularity is non-negotiable because youth sports is seasonal — registration windows, venue payments, and coach payroll all hit in specific months, and partners must be able to see the cash timing.

## 6. Model structure — four layers

### Layer 1 — Assumptions (inputs)

Organized into six named groups in `assumptions.yaml`:

1. **`pricing`** — per-sport price, season structure, roster size, uniform fee, family/sibling discount %.
2. **`demand`** — fill rate per age band per sport, team count ramp by season.
3. **`retention`** — cohort retention curves (separate for soccer, flag, winter skills) plus cross-sell rate between programs.
4. **`acquisition`** — CAC per channel + channel mix by year. Blended CAC is computed, not typed.
5. **`costs`** — coach hourly rates, venue rates, per-registration variable costs, fixed monthly costs, founder time imputed, curriculum amortization.
6. **`capital`** — partner cash contributions, timing, working capital loan terms, distribution policy.

Every assumption has three columns: **low / base / high**. Base drives the main model; low and high feed sensitivity.

### Layer 2 — Year 1 Revenue Engine (bottoms-up)

For each (season, program, age band):

```
Teams/groups filled  =  f(target_teams, fill_rate)
Kids registered      =  teams × roster_size × fill_rate
Gross revenue        =  kids × price_per_season
- Family discounts   =  gross × discount_rate
- Sibling discounts  =  sibling_kids × sibling_discount
- Processing fees    =  gross × 2.9% + $0.30 × transaction_count
= Net revenue
```

Cash timing rules:
- Fall registration opens July → cash in July, season runs Sept–Oct (coach + venue cost out).
- Spring registration opens January → cash in January, season runs Apr–May.
- Winter skills registration opens November → cash in Nov/Dec, sessions run Dec–Mar.

Every revenue dollar traces to a specific team of specific kids at a specific price in a specific month. No handwaving allowed at this layer.

### Layer 3 — Years 2–5 Cohort Retention Engine

Cohort mechanics replace "Year 2 = Year 1 × growth factor":

```
Cohort_2026F (Fall 2026 new registrations)
  → Season 2 (Spring 2027): Cohort_2026F × retention[1→2]
  → Season 3 (Fall 2027):   × retention[2→3]
  → Season 4 (Spring 2028): × retention[3→4]
  → ...

Season N total = Σ(all prior cohorts × their cumulative retention) + new cohort this season
```

New-cohort acquisition Year 2+ grows from three drivers:
- Warm referrals from existing families (`referral_multiplier` × prior cohort size).
- School relationships strengthening (school channel share grows).
- Modest paid digital scaling.

Cross-sell modeled the same way:
- Fall 2026 soccer families → Winter 2026/27 skills clinic × `cross_sell_rate` → higher retention curve thereafter.
- Cross-sold families are measurably stickier in every youth sports business; model gives them a separate retention curve.

Year 4+ franchise expansion handled as a **separate mini-model**: "Location 2 opens Year 4 with its own cohort engine and its own cost structure, minus curriculum/software costs which are amortized at the corporate level." This is how the franchise scalability story shows up in dollars.

### Layer 4 — Cost Engine

**Variable costs** (auto-scale with volume):
- Coach hours × hourly rate, calculated from (games/week × weeks × teams) + (skills sessions × sessions/week × weeks).
- Venue hours × venue rate (outdoor fields + indoor turf + gym).
- Uniforms, payment processing, per-player insurance rider.

**Fixed costs by month:**
- Software (Aspire platform = negligible internal cost; third-party SaaS like Stripe, Twilio).
- Insurance (general liability, participant accident).
- Bookkeeping / legal / accounting.
- Marketing by channel (matches CAC assumptions).
- Founder time ($80K × 2 / 12).
- Curriculum amortization (one-time dev / 36 months).
- Facility commitment (starts at $0 — hourly rental only — toggleable if block time is negotiated later).

**Cash vs. expense split:** every cost line splits into "cash out this month" (cash flow tab) and "expense this month" (P&L). Diverges for curriculum (cash out Year 1, expense amortized), insurance (quarterly cash, monthly expense), etc.

## 7. Sensitivity, scenarios, partner returns, outputs

### 7.1 Sensitivity analysis

**One-variable sensitivity (tornado chart)** — each key input flexes low to high while others stay at base. Output: Year 3 cumulative net income. Variables flexed:
- Year 1 fill rate
- Season-over-season retention rate
- Blended CAC
- Base price per season
- Winter skills cross-sell rate
- Coach hourly rate
- Indoor turf hourly rate
- Paid digital share of acquisition mix
- Referral multiplier Year 2+

**Two-variable heatmaps** for the most-coupled pairs:
- Retention × CAC → Year 5 net income
- Fill rate × price → Year 1 cash breakeven month
- Facility block-time rate × winter fill rate → winter season profitability

Color-coded cells: green = target met, red = not met. Supports "what combination of things would have to go wrong for me to lose money" partner conversations.

### 7.2 Scenarios

Three pre-configured columns of assumption values:

- **Base case** — conservative but not doom. Passes the "would a disciplined operator take this deal" test.
- **Downside case** — fill rate −30%, retention −15 points, CAC +50%, paid digital share 40% (vs. 10%), one winter season fails to launch. Models "we miss on execution but don't fold." Size partner's capital contribution to survive this scenario.
- **Upside case** — fill rate matches i9 density, retention 80%+, referral multiplier 1.4, Year 3 franchise location at 60% of Year 1 unit ramp. Models "'better product' thesis works." This is the IRR number that justifies the partner saying yes.

Each scenario runs the full model end-to-end; partner sees three complete P&Ls side by side.

### 7.3 Partner returns tab

Answers four questions explicitly:

1. **How much cash am I putting in, and when?** Monthly contribution timeline per partner.
2. **When does the business start paying me back?** Monthly distributions line, exact payback month highlighted.
3. **What's my total return?** 5-year cumulative distributions, IRR, MOIC, compared against benchmarks (5-year CD, S&P 500, typical small-business 15–25% IRR).
4. **What's my downside?** Max cumulative cash at risk in downside scenario, recovery if business closes at Year 2.

The downside answer is on the page, not hidden. Partners who see downside disclosed upfront trust the upside more.

### 7.4 Output views

**In the xlsx, four summary views:**
- 5-year P&L summary (rolled up from monthly).
- Monthly cash balance chart.
- Unit economics dashboard (LTV, CAC, LTV/CAC, payback months per family) — copy-pasteable into future franchise prospectus.
- "One-page summary" — 8–10 numbers the partner needs to decide. Revenue, net income, cash balance, partner payback month, IRR, MOIC, downside recovery, Year 5 franchise-readiness flag.

**In the web app, five interactive views:**
- Dashboard
- Scenario toggler
- Slider panel (live-edit top 10 assumptions)
- P&L and cash flow charts (monthly, 60 months)
- Partner returns waterfall

## 8. Base case assumptions (v1 starting values)

Researched from Central Ohio operators (April 2026). Not all verified locally — see §9 for gaps.

| Line item | Base case | Confidence |
|---|---|---|
| Soccer rec registration | $175 / 8-week season | Anchored to $169 i9 Columbus floor; outdoor discount vs. indoor basketball |
| Flag football rec registration | $175 / 7-week season | Matches NFL Flag Columbus $175 late fee and i9 range floor |
| Season structure | Variable — `weeks_per_season` × `seasons_per_year` are editable cells | Defaults to 8×2 soccer, 7×2 flag; toggleable to i9-style 6×3 in sensitivity |
| Winter skills clinic | $25/session, 8 kids/coach | Anchored to Resolute $20 and Soccer Field Academy $40 |
| Indoor turf rental | $175/hr full, $95/hr half | Mid-range between Soccer Field Academy Columbus verified $135 full and operator rate cards |
| Gym rental | $70/hr | Dublin CRC verified |
| Outdoor field rental | $35/hr per field placeholder | NOT verified — needs phone outreach |
| Head coach pay | $22/hr | Slightly above Columbus market avg $18.66 to attract quality; supports "better product" positioning |
| Assistant coach pay | $16/hr | Above i9's $14 baseline |
| Blended Year 1 CAC | $18/new registration | Derived from channel mix below |
| Blended Year 2 CAC | $12 | Retention and referrals compound; paid share shrinks |
| Blended Year 3+ CAC | $8 | Organic/referral dominant |
| Marketing % of revenue | 8–10% Y1, 5–7% Y2, ~4% Y3+ | Disciplined end of local-service benchmark |
| **Retention — season 1 to 2** | **70%** | Youth sports industry norm; headline assumption |
| **Retention — season 2 to 3** | **85%** | Returning families are measurably stickier |
| **Retention — season 3+** | **90%** | Established loyalty tier |
| Cross-sell rate (leagues → winter skills) | 25% | Founder judgment; sensitivity-tested |
| Referral multiplier (Year 2+) | 1.2 | Each prior-year family generates 0.2 new referrals on average |
| Founder time imputed | $80K × 2 | Standard for founder-operator rec sports business |
| Partner cash contribution | Placeholder — equal for both partners | TBD in deal conversation |

### Year 1 acquisition channel mix (drives blended CAC)

| Channel | Share of Year 1 regs | Unit CAC |
|---|---|---|
| Partner/founder network + direct referrals | ~35% | ~$0 ($5 t-shirt) |
| School partnerships + PTO donations | ~30% | $10–15 (PTO donation per reg) + coach time in fixed costs |
| Micro-influencer parents + local Facebook groups | ~15% | ~$5 |
| Signature community event ("Try Aspire" day) | ~10% | $15–25 |
| Narrow paid digital (Meta + Google) | ~10% | $40–60 |

The real cost of Year 1 marketing is founder time, not dollars. The model makes this visible via the founder-time line in fixed costs.

## 9. Known unknowns and data gaps

To be closed by direct local outreach before the partner meeting:

1. **i9 Sports** Dublin/Hilliard/Powell actual prices (soccer and flag), season length, roster size.
2. **Soccer First Dublin** hourly indoor turf rate.
3. **Resolute Athletic Complex** evening/weekend turf rate.
4. **At least one school district** (Hilliard or Dublin City Schools) outdoor field permit rate.
5. **Dublin P&R, Westerville P&R, New Albany Parks** outdoor field rental rates for commercial operators.
6. **Upper Arlington Bob Crane** and **Worthington Community Center** gym hourly rates.
7. **NFL Flag Columbus** roster size and games/week.
8. **The actual facility arrangement** with the partner's friend — what hourly/block rate the owner will quote.

The model flags each unverified base case value in the Assumptions tab with a "LOW CONFIDENCE — needs outreach" note. The partner meeting should include a slide titled "numbers we'll firm up in the next 30 days" rather than pretending everything is precise.

## 10. Out of scope for v1

Explicitly not built in the first version of the model:

- Tax modeling (federal/state/local). Model runs pre-tax; taxes noted as a ~20–25% haircut on distributions.
- Debt financing beyond a simple working capital loan line. No modeled bank debt.
- The Aspire SaaS platform's internal revenue/costs as a separate business line. Platform is treated as an internal tool.
- Multi-location franchise corporate overhead detail. The Year 4 franchise mini-model is rough; a proper franchise model is a separate spec when Location 2 becomes real.
- Detailed HR/benefits modeling for employees. Coaches are modeled as 1099 contractors in v1.
- Facility acquisition/buildout capex. Modeled only as a Year 3+ optional gate with placeholder numbers.

## 11. Open questions to resolve before implementation

None blocking. The following can be filled in during implementation or before the partner meeting:

- Actual partner cash contribution amounts (TBD in deal conversation).
- Outdoor field rental rates (phone outreach).
- i9 Sports verified Columbus pricing (phone outreach).
- Facility owner's actual quoted rate (conversation).
- Retention curve is anchored to the values in Section 8 (70% → 85% → 90%); the rising shape reflects the empirical pattern that families who stay past the first renewal become measurably stickier. Can be adjusted when the partner weighs in.

## 12. Implementation sequencing (for the follow-up plan)

Suggested order when writing the implementation plan:

1. `assumptions.yaml` schema + base case values.
2. Python build script scaffold + xlsx generator.
3. Year 1 bottoms-up revenue engine.
4. Cost engine.
5. P&L and cash flow tabs.
6. Cohort retention engine (Years 2–5).
7. Partner returns tab.
8. Sensitivity + scenarios.
9. Web app scaffold (Astro page behind auth).
10. Web app slider panel + live charts.
11. Cover/README + one-page summary.
12. Documentation for regenerating the model.

---

**End of design spec.**
