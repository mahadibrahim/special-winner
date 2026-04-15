"""Regression guard: with Plan-1-equivalent overrides forced at runtime, the model
must reproduce the Plan 2 baseline NI numbers within 2%.

The default `assumptions.yaml` has been tuned for the pitch (multi-location,
travel enabled, merchandise). To keep this regression guard meaningful, we load
the YAML and then FORCE IT back to Plan-1-equivalent (single location, travel
disabled, merchandise disabled) and verify the Y1-Y5 operational-year NI totals
still match the post-Plan-2 baseline captured after commit 448e9e6.

Known intentional Plan 1 → Plan 2 drift (~8% cumulative NI below Plan 1):
- Per-age-band int() truncation in revenue_year1 vs Plan 1's pooled truncation
- Winter skills now runs its own cohort curve (spec §4), not cross-sell derived

Comparison is by OPERATIONAL year (months 1-12, 13-24, ...) not calendar year.
"""
from copy import deepcopy
from pathlib import Path
from engine.schema import load_assumptions
from engine.revenue_year1 import build_year1_revenue
from engine.revenue_cohort import build_cohort_revenue_for_location
from engine.revenue_travel import build_travel_revenue_for_location
from engine.costs import build_cost_schedule
from engine.pnl import build_monthly_pnl


PLAN2_BASELINE_NI_BY_OP_YEAR = {
    1: 5648,
    2: 63039,
    3: 83587,
    4: 114677,
    5: 145952,
}
PLAN2_BASELINE_CUMULATIVE_NI = 412903

TOLERANCE = 0.02  # 2%


def _force_plan1_equivalent(a):
    """Deepcopy + force expansion to Plan-1-equivalent (single loc, no travel, no merch)."""
    a2 = deepcopy(a)
    a2.expansion.locations.by_year = {2026: 1, 2027: 1, 2028: 1, 2029: 1, 2030: 1}
    if a2.expansion.travel is not None:
        a2.expansion.travel.launch_year = 2099
    a2.merchandise = None
    return a2


def _run_plan1_equivalent_model():
    a = load_assumptions(Path(__file__).parent.parent / "assumptions.yaml")
    a = _force_plan1_equivalent(a)
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
    start = (op_year - 1) * 12
    end = start + 12
    return sum(r.net_income for r in pnl[start:end])


def test_default_yaml_has_three_expected_sports():
    a = load_assumptions(Path(__file__).parent.parent / "assumptions.yaml")
    sport_names = {s.name for s in a.sports}
    assert sport_names == {"soccer", "flag", "winter_skills"}


def test_plan2_y1_net_income_within_tolerance():
    pnl = _run_plan1_equivalent_model()
    y1_ni = _op_year_ni(pnl, 1)
    expected = PLAN2_BASELINE_NI_BY_OP_YEAR[1]
    assert abs(y1_ni - expected) <= max(abs(expected) * TOLERANCE, 500), \
        f"Y1 NI drift: got ${y1_ni:,.0f}, expected ${expected:,.0f}"


def test_plan2_y3_net_income_within_tolerance():
    pnl = _run_plan1_equivalent_model()
    y3_ni = _op_year_ni(pnl, 3)
    expected = PLAN2_BASELINE_NI_BY_OP_YEAR[3]
    assert abs(y3_ni - expected) <= abs(expected) * TOLERANCE, \
        f"Y3 NI drift: got ${y3_ni:,.0f}, expected ${expected:,.0f}"


def test_plan2_y5_net_income_within_tolerance():
    pnl = _run_plan1_equivalent_model()
    y5_ni = _op_year_ni(pnl, 5)
    expected = PLAN2_BASELINE_NI_BY_OP_YEAR[5]
    assert abs(y5_ni - expected) <= abs(expected) * TOLERANCE, \
        f"Y5 NI drift: got ${y5_ni:,.0f}, expected ${expected:,.0f}"


def test_plan2_5yr_cumulative_ni_within_tolerance():
    pnl = _run_plan1_equivalent_model()
    total_ni = sum(r.net_income for r in pnl)
    expected = PLAN2_BASELINE_CUMULATIVE_NI
    assert abs(total_ni - expected) <= abs(expected) * TOLERANCE, \
        f"5yr cumulative NI drift: got ${total_ni:,.0f}, expected ${expected:,.0f}"
