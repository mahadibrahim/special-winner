"""Regression guard: default assumptions.yaml must reproduce Plan 2 baseline within 2%.

Reference: the first commit at which all Plan 2 engines landed and ran end-to-end
against the default (single-location, travel-disabled, rec-only) assumptions.yaml.

Known Plan 1 → Plan 2 drift (intentional refactor consequences, NOT silent regressions):
- Per-age-band int() truncation in revenue_year1 loses ~1 kid per sport per season vs
  Plan 1's pooled int() truncation. Small effect that compounds through the cohort.
- Winter skills now runs its own cohort on its own retention curve rather than being
  derived from a cross-sell multiplier on the rec pool (spec §4). Plan 1 winter grew
  with rec; Plan 2 winter decays on its own s1→s2 / s2→s3 / s3+ curve.
- Cumulative 5-year NI drifts ~8% below the Plan 1 baseline as a result. This is a
  known, documented intentional change — the Plan 2 numbers are slightly MORE
  conservative, which is appropriate for a partner pitch.

This test pins the Plan 2 baseline numbers with 2% tolerance so future refactors
cannot silently drift. If a future change legitimately changes these numbers,
update the constants below and document why.

Comparison is by OPERATIONAL year (months 1-12, 13-24, ...) not calendar year,
because revenue recognition straddles calendar years (Jul 2026 - Jun 2027 = Y1).
"""
from pathlib import Path
from engine.schema import load_assumptions
from engine.revenue_year1 import build_year1_revenue
from engine.revenue_cohort import build_cohort_revenue_for_location
from engine.revenue_travel import build_travel_revenue_for_location
from engine.costs import build_cost_schedule
from engine.pnl import build_monthly_pnl


# Plan 2 post-fix baseline NI by operational year (months 1-12, 13-24, ..., 49-60).
# Captured after T13 with season_growth_rate restored to soccer/flag at base 0.25.
PLAN2_BASELINE_NI_BY_OP_YEAR = {
    1: 5648,    # Y1 = months 1-12 = Jul 2026 - Jun 2027
    2: 63039,   # Y2
    3: 83587,   # Y3
    4: 114677,  # Y4
    5: 145952,  # Y5
}
PLAN2_BASELINE_CUMULATIVE_NI = 412903

# Plan 1 reference for context only (not used by assertions).
# Plan 1 cumulative was $449,276. Plan 2 is ~8% below, intentionally, due to the
# refactor consequences documented in the module docstring above.
PLAN1_REFERENCE_CUMULATIVE_NI = 449276

TOLERANCE = 0.02  # 2% — catches future drift from the Plan 2 baseline


def _run_default_model():
    a = load_assumptions(Path(__file__).parent.parent / "assumptions.yaml")
    y1 = build_year1_revenue(a, location_id=0, location_launch_year=2026)
    cohort = build_cohort_revenue_for_location(
        a, y1, location_id=0, location_launch_year=2026, is_new_location=False,
    )
    travel = build_travel_revenue_for_location(
        a, cohort, location_id=0, location_launch_year=2026,
    )
    costs = build_cost_schedule(a)
    pnl = build_monthly_pnl(a, y1, cohort, travel, costs)
    return pnl


def _op_year_ni(pnl, op_year: int) -> float:
    """Sum net income for operational year N (months (N-1)*12 through N*12-1)."""
    start = (op_year - 1) * 12
    end = start + 12
    return sum(r.net_income for r in pnl[start:end])


def test_default_yaml_is_single_location_rec_only():
    """The committed default assumptions.yaml must be configured for the Plan 1
    equivalent (single location, travel disabled, soccer + flag + winter_skills)."""
    a = load_assumptions(Path(__file__).parent.parent / "assumptions.yaml")
    assert all(count == 1 for count in a.expansion.locations.by_year.values())
    assert a.expansion.travel is None or a.expansion.travel.launch_year >= 2099
    sport_names = {s.name for s in a.sports}
    assert sport_names == {"soccer", "flag", "winter_skills"}


def test_plan2_y1_net_income_within_tolerance():
    pnl = _run_default_model()
    y1_ni = _op_year_ni(pnl, 1)
    expected = PLAN2_BASELINE_NI_BY_OP_YEAR[1]
    assert abs(y1_ni - expected) <= max(abs(expected) * TOLERANCE, 500), \
        f"Y1 NI drift: got ${y1_ni:,.0f}, expected ${expected:,.0f}"


def test_plan2_y3_net_income_within_tolerance():
    pnl = _run_default_model()
    y3_ni = _op_year_ni(pnl, 3)
    expected = PLAN2_BASELINE_NI_BY_OP_YEAR[3]
    assert abs(y3_ni - expected) <= abs(expected) * TOLERANCE, \
        f"Y3 NI drift: got ${y3_ni:,.0f}, expected ${expected:,.0f}"


def test_plan2_y5_net_income_within_tolerance():
    pnl = _run_default_model()
    y5_ni = _op_year_ni(pnl, 5)
    expected = PLAN2_BASELINE_NI_BY_OP_YEAR[5]
    assert abs(y5_ni - expected) <= abs(expected) * TOLERANCE, \
        f"Y5 NI drift: got ${y5_ni:,.0f}, expected ${expected:,.0f}"


def test_plan2_5yr_cumulative_ni_within_tolerance():
    pnl = _run_default_model()
    total_ni = sum(r.net_income for r in pnl)
    expected = PLAN2_BASELINE_CUMULATIVE_NI
    assert abs(total_ni - expected) <= abs(expected) * TOLERANCE, \
        f"5yr cumulative NI drift: got ${total_ni:,.0f}, expected ${expected:,.0f}"
