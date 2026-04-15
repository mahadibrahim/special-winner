from datetime import date
from pathlib import Path
from engine.schema import load_assumptions
from engine.revenue_year1 import build_year1_revenue
from engine.revenue_cohort import build_cohort_revenue_for_location
from engine.revenue_travel import build_travel_revenue_for_location
from engine.costs import build_cost_schedule
from engine.pnl import build_monthly_pnl, PnLRow


def _plan1_inputs(a):
    y1 = build_year1_revenue(a, location_id=0, location_launch_year=2026)
    cohort = build_cohort_revenue_for_location(
        a, y1, location_id=0, location_launch_year=2026, is_new_location=False,
    )
    travel = build_travel_revenue_for_location(
        a, cohort, location_id=0, location_launch_year=2026,
    )
    costs = build_cost_schedule(a)
    return y1, cohort, travel, costs


def test_pnl_has_row_per_month_in_horizon():
    a = load_assumptions(Path("assumptions.yaml"))
    y1, cohort, travel, costs = _plan1_inputs(a)
    pnl = build_monthly_pnl(a, y1, cohort, travel, costs)
    assert len(pnl) == a.horizon_months


def test_pnl_row_fields():
    a = load_assumptions(Path("assumptions.yaml"))
    y1, cohort, travel, costs = _plan1_inputs(a)
    pnl = build_monthly_pnl(a, y1, cohort, travel, costs)
    row = pnl[0]
    assert isinstance(row, PnLRow)
    assert row.month == date(2026, 7, 1)
    assert row.net_income == row.revenue - row.total_expense


def test_pnl_year1_revenue_approximately_matches_y1_lines():
    a = load_assumptions(Path("assumptions.yaml"))
    y1, cohort, travel, costs = _plan1_inputs(a)
    pnl = build_monthly_pnl(a, y1, cohort, travel, costs)
    y1_pnl_total = sum(r.revenue for r in pnl[:12])
    y1_lines_total = sum(l.net_revenue for l in y1)
    assert abs(y1_pnl_total - y1_lines_total) < y1_lines_total * 0.5
