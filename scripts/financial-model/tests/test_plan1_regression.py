"""Regression guard: default assumptions.yaml must reproduce Plan 1 baseline within 2%.

Reference commit: 4a015d5 (Plan 1 post-premium-lens, post-bug-fixes)
"""
from pathlib import Path
from engine.schema import load_assumptions
from engine.revenue_year1 import build_year1_revenue
from engine.revenue_cohort import build_cohort_revenue_for_location
from engine.revenue_travel import build_travel_revenue_for_location
from engine.costs import build_cost_schedule
from engine.pnl import build_monthly_pnl


PLAN1_NI_BY_YEAR = {
    2026: 3188,
    2027: 28771,
    2028: 63337,
    2029: 85229,
    2030: 115011,
}
PLAN1_CUMULATIVE_NI = 361250

TOLERANCE = 0.02  # 2%


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


def test_default_yaml_is_single_location_rec_only():
    """Sanity check: the committed default assumptions.yaml must be configured
    for the Plan 1 equivalent (single location, travel disabled)."""
    a = load_assumptions(Path(__file__).parent.parent / "assumptions.yaml")
    assert all(count == 1 for count in a.expansion.locations.by_year.values())
    assert a.expansion.travel is None or a.expansion.travel.launch_year >= 2099
    sport_names = {s.name for s in a.sports}
    assert sport_names == {"soccer", "flag", "winter_skills"}


def test_plan1_y1_net_income_within_tolerance():
    pnl = _run_default_model()
    y1_ni = sum(r.net_income for r in pnl if r.month.year == 2026)
    expected = PLAN1_NI_BY_YEAR[2026]
    assert abs(y1_ni - expected) <= max(abs(expected) * TOLERANCE, 500), \
        f"Y1 NI drift: got ${y1_ni:,.0f}, expected ${expected:,.0f}"


def test_plan1_y3_net_income_within_tolerance():
    pnl = _run_default_model()
    y3_ni = sum(r.net_income for r in pnl if r.month.year == 2028)
    expected = PLAN1_NI_BY_YEAR[2028]
    assert abs(y3_ni - expected) <= abs(expected) * TOLERANCE, \
        f"Y3 NI drift: got ${y3_ni:,.0f}, expected ${expected:,.0f}"


def test_plan1_y5_net_income_within_tolerance():
    pnl = _run_default_model()
    y5_ni = sum(r.net_income for r in pnl if r.month.year == 2030)
    expected = PLAN1_NI_BY_YEAR[2030]
    assert abs(y5_ni - expected) <= abs(expected) * TOLERANCE, \
        f"Y5 NI drift: got ${y5_ni:,.0f}, expected ${expected:,.0f}"


def test_plan1_5yr_cumulative_ni_within_tolerance():
    pnl = _run_default_model()
    total_ni = sum(r.net_income for r in pnl)
    expected = PLAN1_CUMULATIVE_NI
    assert abs(total_ni - expected) <= abs(expected) * TOLERANCE, \
        f"5yr cumulative NI drift: got ${total_ni:,.0f}, expected ${expected:,.0f}"
