# Aspire Sports Financial Model — Plan 2 Expansion Layer

**Spec date:** 2026-04-15
**Depends on:** `2026-04-15-aspire-sports-financial-model-design.md` (Plan 1)
**Status:** Design approved, ready for plan authoring

---

## Purpose

Plan 1 produced an honest single-territory baseline for Aspire Sports — a "supplemental lifestyle business" generating ~$449k cumulative net income over 5 years in Dublin/Powell. Accurate but incomplete: it does not represent the actual growth thesis behind the partner pitch, which is multi-vector expansion. Plan 2 adds the three real growth vectors to the model so a partner conversation can distinguish between the organic floor and the upside of execution.

**Audience for the spec:** the implementer subagents that will execute Plan 2 tasks. Every decision must be inferable from this document without consulting the design conversation.

**Audience for the resulting model:** the same partner pitch audience as Plan 1 — a prospective operating partner who will commit capital and labor to run the business.

## Context

The current model (post-Plan 1, post-premium-lens rebaseline, post-bug-fixes at commit `4a015d5`) models:
- One territory (Dublin/Powell)
- Two rec sports (soccer, flag) plus a winter skills clinic
- One tier (rec league format at premium price)
- A single pooled cohort per sport that compounds via retention × referral multiplier

It does not model: geographic expansion, new sport lines, a travel/AAU tier, or the upgrade funnel from rec to travel.

## What changes from Plan 1

Plan 2 is a schema refactor plus three new engines, wrapped by a per-location orchestrator.

### 1. Schema refactor — sports as a list

Soccer, flag, and winter skills become entries in a unified `sports: List[SportConfig]` list. Per-sport fields that were hardcoded in `Pricing` / `Demand` / `Retention` move into `SportConfig`. Winter skills uses the same schema as soccer and flag; the only differences are its venue type (indoor turf half-field), weeks per season (12), roster size (8), and its own retention curve. Per-session pricing is restated as per-12-week-block pricing ($25/session × 12 weeks = $300/block) so the math unifies cleanly.

`SportConfig`:

```python
class SportConfig(BaseModel):
    name: str
    launch_year: int
    price: LowBaseHigh                      # per season (or per 12-week block for clinics)
    weeks_per_season: int
    hours_per_unit: float                   # hours per game/session
    units_per_week: float                   # games/sessions per week per team/group
    roster_size: int                        # kids per team/group
    venue_type: Literal["outdoor_field", "indoor_turf_half", "indoor_turf_full", "gym"]
    seasons: List[Season]                   # which seasons this sport runs in
    target_teams_y1: Dict[str, int]         # age-band → team count, year 1 of any location
    fill_rate: LowBaseHigh
    s1_to_s2: LowBaseHigh
    s2_to_s3: LowBaseHigh
    s3_plus: LowBaseHigh
```

`Pricing` loses: `soccer_*`, `flag_*`, `winter_skills_*` blocks. Keeps: `family_discount_rate`, `sibling_discount_rate`, `uniform_fee`, `payment_processing_rate`, `payment_processing_flat`.

`Demand` loses: `target_teams_*`, `*_fill_rate`, `season_growth_rate`. Keeps nothing — remove the class or leave it empty for future use.

`Retention` loses: `soccer_*`, `flag_*`, `winter_skills_retention`. Keeps: `cross_sell_rate` (no longer used — flag for removal), `referral_multiplier` (cross-cutting, still applies).

### 2. New top-level sections

`ExpansionConfig` wraps three blocks at the assumptions root level.

```python
class LocationConfig(BaseModel):
    by_year: Dict[int, int]                          # {2026: 1, 2027: 1, 2028: 2, ...}
    new_location_fill_rate_boost: LowBaseHigh        # added to Y1 fill for locations beyond the first
    tam_per_location: int = 10500                    # Dublin/Powell default

class TravelConfig(BaseModel):
    launch_year: int                                 # earliest year travel is active
    target_teams_direct_y1: Dict[str, int]           # age-band → team count for direct acquisition
    travel_roster_size: int
    direct_fill_rate: LowBaseHigh
    rec_to_travel_upgrade_rate: LowBaseHigh          # % of eligible rec cohort kids who upgrade each season
    travel_price: LowBaseHigh                        # per season
    travel_weeks_per_season: int
    travel_coach_hourly_premium: float               # multiplier on head_coach_hourly
    travel_s1_to_s2: LowBaseHigh
    travel_s2_to_s3: LowBaseHigh
    travel_s3_plus: LowBaseHigh

class ExpansionConfig(BaseModel):
    locations: LocationConfig
    travel: Optional[TravelConfig] = None            # None → travel tier disabled
```

`Assumptions` gains `sports: List[SportConfig]` and `expansion: ExpansionConfig`.

### 3. Revenue Y1 engine — iterate over sports list

`revenue_year1.py` is rewritten to iterate over `a.sports` filtered by `launch_year <= 2026`. For each active (sport × season × location), it produces a `Year1RevenueLine`. `Year1RevenueLine` gains two fields:

- `location_id: int` — which location produced this line
- `age_band: str` — which age band within the sport's roster distribution

The `Sport` Literal is removed — sport names are strings drawn from `a.sports`. The `teams_or_groups` field is renamed `teams` (winter_skills "groups" become "teams" in the unified model).

### 4. Cohort engine — per-location, per-age-band

`revenue_cohort.py` is rewritten. The scalar `soccer_size` / `flag_size` pooled state becomes:

```python
cohort_state: Dict[Tuple[int, str, str], int]  # (location_id, sport_name, age_band) -> current size
```

Each location runs its own cohort, launched in its `launch_year` from `LocationConfig.by_year`. Each sport runs its own cohort, launched in its `launch_year` from `SportConfig.launch_year`. Retention rates come from the sport config, not from hardcoded `a.retention.soccer_*`. Age bands are preserved so the travel upgrade funnel can filter to U9+.

The `cross_sell_rate` logic is removed. Winter skills is now a sport with its own cohort, not derived from the rec pool.

The brand-equity boost for locations beyond the first is applied by *adding* `LocationConfig.new_location_fill_rate_boost.base` to the sport's base `fill_rate` for that location's **first operating year only** (i.e., the year matching that location's launch year, not calendar Y1 of the model). From that location's second operating year onward, normal retention math governs.

### 5. Travel engine — new file `engine/revenue_travel.py`

Two input streams per location per season once travel is active:

**Direct stream:** `sum(target_teams_direct_y1.values()) × travel_roster_size × direct_fill_rate` kids enter the travel cohort each Y1 of each location where travel is active. Subsequent years retain on the travel curve.

**Upgrade stream:** each season, eligible rec cohort kids (U9+ age bands, see open question 3) convert to travel at `rec_to_travel_upgrade_rate`. The rec cohort is **decremented** by the upgraded kids (no double counting). Upgraded kids merge into the pooled travel cohort and retain on the travel curve from that point forward.

The engine produces `TravelRevenueLine` objects with the same shape as `Year1RevenueLine` plus an `origin_channel: Literal["direct", "upgrade"]` field.

### 6. Costs engine — venue_type routing

`compute_variable_costs_for_line` becomes generic:
- `coach_hours = teams × units_per_week × hours_per_unit × weeks_per_season`
- `coach_cost = coach_hours × a.costs.head_coach_hourly.base`
- `venue_cost = coach_hours × getattr(a.costs, f"{venue_type}_hourly").base` (with the venue_type string mapped to the right field)
- `uniform_cost = a.pricing.uniform_fee × kids_registered`

New helper `compute_variable_costs_for_travel_line` applies the `travel_coach_hourly_premium` multiplier to the coach rate.

The existing `compute_variable_costs_for_cohort_line` is removed; the generic `compute_variable_costs_for_line` handles both Y1 and cohort lines since they share the same shape.

### 7. Orchestrator — `build_model.py`

The orchestrator gains a location loop. For each location in `a.expansion.locations.by_year`, it runs the existing engine stack (revenue_year1 → cohort → travel) with that location's launch year as the origin. Results from all locations are aggregated into master `y1_lines`, `cohort_lines`, `travel_lines` before being passed to `pnl.py`, `cashflow.py`, `partner_returns.py`.

P&L, cashflow, and partner returns do not need changes — they consume line lists and don't care about location origin.

### 8. Writers

**New tab — `Expansion Summary`:** the hero tab for the partner pitch. Columns: Year × (Location × Product Line). Rows: Y1-Y5. Plus summary columns (total revenue, total kids, product-line mix %, active location count) and two top summary rows (**Floor** = single-territory rec-only number, **With expansion** = full multi-vector number).

**Updated tabs:**
- `Assumptions` — renders the sport list dynamically (one section per sport), new Expansion section showing locations.by_year and travel.launch_year
- `Revenue Y1` — adds `location_id` and `age_band` columns
- `Revenue Cohort` — adds `location_id` and `age_band` columns
- `Cover` — updated how-to-use text references Expansion Summary as the primary read

**Unchanged tabs:** P&L, Cash Flow, Partner Returns, Sensitivity, Scenarios, TAM Check.

### 9. Scenarios + Sensitivity + TAM — path updates

- `scenarios.py`: downside/upside overlays flex `fill_rate` and `s1_to_s2` on **all sports** (open question 4). Path traversal changes from `demand.soccer_fill_rate` → iterate over `sports` and patch each.
- `sensitivity.py`: the `_SENSITIVITY_VARIABLES` list is updated to reference the new schema paths. Where a variable is per-sport, the tornado bar aggregates across sports (or tracks per-sport — a small design call in the plan).
- `tam.py`: `DUBLIN_POWELL_ADDRESSABLE_KIDS` constant moves into the YAML as `expansion.locations.tam_per_location`. TAM is scaled linearly: `total_tam = tam_per_location × num_active_locations`. Implied market share per year uses the scaled TAM.

## Decisions on open questions

1. **TAM scaling:** linear with `num_active_locations`. Each new location adds 10,500 addressable kids to the denominator. This assumes new locations land in metros with roughly Dublin/Powell demographics (Central Ohio suburbs). If expansion eventually targets very different metros, a per-location TAM override is a Plan 3 concern.
2. **Age-band inheritance across sports:** each sport defines its own `target_teams_y1` age-band keys. No unified taxonomy. Soccer uses U8/U10/U12, flag uses K-2/3-4/5-6. A kid may be implicitly double-counted if they play both sports — this is acceptable at the precision of this model.
3. **Travel eligibility age filter:** hardcoded mapping in `revenue_travel.py`. Soccer U10 and U12 are eligible; flag 3-4 and 5-6 are eligible; all other bands are not. A code constant, revisable in one place.
4. **Scenarios overlay scope:** flex fill_rate and s1_to_s2 on all sports (not just the first). More honest stress test.

## Scope boundary

**IN (Plan 2 delivers):**
- Sports list schema refactor including winter skills unification
- Multi-location cohort engine with brand-equity boost
- Travel tier engine with direct + upgrade streams, age-band tracking
- Sport launch-year and location launch-year gating
- New Expansion Summary writer tab
- Refreshed Assumptions tab
- Updated engines for P&L, cashflow, scenarios, sensitivity, TAM
- Tests: schema, per-engine, end-to-end, regression guard against Plan 1 baseline

**OUT (deferred to Plan 3 or beyond):**
- Summer camps and camps revenue stream
- Corporate-vs-per-location P&L split (HQ overhead separated from operating costs)
- Salaried staff hiring ramp (coaches remain 1099)
- Tournament, showcase, private training revenue beyond base travel registration
- Aspire-as-franchisor licensing model
- Working capital debt facility modeling
- Tax modeling, equity dilution, employee stock

## Testing strategy

**Regression guard — the critical test.** The default `assumptions.yaml` post-Plan-2 must start in a configuration equivalent to the current Plan 1 baseline: single location (`locations.by_year = {2026: 1, 2027: 1, ..., 2030: 1}`), `travel.launch_year` beyond the model horizon (e.g., 2099), and only soccer/flag/winter_skills in the sports list (no additional sports). Under this default, the regression test runs `build_model.py` and verifies the output Y1-Y5 net income numbers are within 2% of the committed Plan 1 baseline (Y1 ~$6,054, Y5 ~$169,187, cumulative ~$449,275 — reference commit `4a015d5`). This test ensures the Plan 2 refactor does not silently break Plan 1 results. A user who wants to explore expansion must actively edit the YAML (toggle on additional locations, travel, or sport launch years).

**Schema tests:** sport list round-trips, travel block optional, expansion block validates, existing `test_schema.py` ports to new shape.

**Engine math tests:**
- Revenue Y1 with one sport → matches pre-refactor soccer/flag output (regression)
- Revenue Y1 with three sports → correct line count and per-sport breakdown
- Cohort with one location → matches pre-refactor single-pool numbers (regression)
- Cohort with two locations offset 2 years → location 2 Y1 ≈ location 1 Y1 (with brand-equity boost applied)
- Age-band tracking: U8 cohort kids do not appear in U9+ eligibility filters
- Travel direct stream: Y1 team count × roster × fill_rate = expected kids
- Travel upgrade funnel: rec cohort U9+ pool × upgrade_rate = expected upgrade kids, and the rec cohort is decremented
- Travel retention: pooled (direct + upgrade) travel cohort retains on travel curve
- Sport launch year: basketball does not appear in 2026 lines, appears in 2028 lines
- Costs: venue_type routing picks the correct hourly rate
- Costs: travel premium multiplier applied correctly

**End-to-end tests:**
- Full orchestrator run produces a valid xlsx with 12 tabs (11 existing + Expansion Summary)
- Multi-location + multi-sport + travel run produces a sane Y5 revenue (< 5% TAM × location count, > Plan 1 floor)
- Scenarios direction check still holds (downside < base < upside)

## Implementation task sketch

Rough ordering for the writing-plans step. Sixteen tasks:

Each task lands atomically: tests for a given engine are updated alongside that engine's rewrite, not in a separate task. Test updates only become their own task when they're new test files.

```
T1  — Schema refactor: add SportConfig, TravelConfig, LocationConfig, ExpansionConfig; drop deprecated hardcoded sport fields
T2  — Rewrite assumptions.yaml to new schema; update test_schema.py to load the new shape (ports soccer, flag, winter_skills into sports list; single-location default)
T3  — Rewrite revenue_year1.py: iterate over sports list, add location_id + age_band; update test_revenue_year1.py
T4  — Rewrite revenue_cohort.py: per-location per-age-band tracking, launch-year gating, brand-equity boost; update any existing cohort tests
T5  — New revenue_travel.py: direct stream + upgrade funnel + travel cohort retention; new test_revenue_travel.py
T6  — Update costs.py: generic venue_type routing, remove cohort-specific helper, add travel helper; update test_costs.py
T7  — Update pnl.py + cashflow.py: consume aggregated multi-location line lists; update test_pnl.py and test_cashflow.py if needed
T8  — Update scenarios.py + sensitivity.py: patch sport list + update variable path lookups; update their tests
T9  — Update tam.py: multi-location TAM scaling, move constant into YAML; update test_tam.py
T10 — Update build_model.py: location orchestrator loop
T11 — Update existing writer tabs: revenue_year1_tab, revenue_cohort_tab, assumptions_tab, cover_tab; update test_writers_cover_assumptions.py and test_writers_revenue.py
T12 — New expansion_summary_tab writer (hero tab for partner pitch); new test_writers_expansion.py
T13 — New integration test: test_cohort_multi_location (two locations offset 2 years, verify independent evolution)
T14 — New integration test: test_expansion_end_to_end (multi-sport + travel + multi-location full stack)
T15 — Regression guard test: default post-Plan-2 assumptions.yaml produces Y1-Y5 NI within 2% of commit 4a015d5 baseline
T16 — Final code review of full Plan 2 tree against this spec
```

Estimated size: ~1,100 LOC added, ~200 LOC removed. Execution via subagent-driven TDD, probably 3–4 hours wall clock. Tasks T5, T6, T13 likely need a stronger model (sonnet) due to cohort-tracking complexity and the hero-tab design work.

## Success criteria

Plan 2 is complete when:

1. All 16 tasks land with full test coverage
2. The regression guard test passes (Plan 1 config reproduces Plan 1 numbers within 2%)
3. The full expansion-enabled run produces the Expansion Summary tab showing floor vs with-expansion
4. A user can edit `locations.by_year`, sport `launch_year`, or `travel.launch_year` in the YAML, rerun `build_model.py`, and see the corresponding story change in the xlsx
5. Full test suite is green (target: ~80 tests including the new ones)
6. The generated xlsx is something the user would be comfortable putting in front of the operating partner
