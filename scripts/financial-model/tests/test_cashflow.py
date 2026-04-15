from datetime import date
from pathlib import Path
from engine.schema import load_assumptions
from engine.revenue_year1 import build_year1_revenue
from engine.revenue_cohort import build_cohort_revenue_for_location
from engine.revenue_travel import build_travel_revenue_for_location
from engine.costs import build_cost_schedule
from engine.cashflow import build_monthly_cashflow, CashflowRow


def _inputs(a):
    y1 = build_year1_revenue(a, location_id=0, location_launch_year=2026)
    cohort = build_cohort_revenue_for_location(
        a, y1, location_id=0, location_launch_year=2026, is_new_location=False,
    )
    travel = build_travel_revenue_for_location(
        a, cohort, location_id=0, location_launch_year=2026,
    )
    costs = build_cost_schedule(a)
    return y1, cohort, travel, costs


def test_cashflow_row_count_matches_horizon():
    a = load_assumptions(Path("assumptions.yaml"))
    y1, cohort, travel, costs = _inputs(a)
    cf = build_monthly_cashflow(a, y1, cohort, travel, costs)
    assert len(cf) == a.horizon_months


def test_initial_contributions_appear_in_month_1():
    a = load_assumptions(Path("assumptions.yaml"))
    y1, cohort, travel, costs = _inputs(a)
    cf = build_monthly_cashflow(a, y1, cohort, travel, costs)
    assert cf[0].contributions == a.capital.contribution_per_founder * a.costs.num_founders


def test_ending_balance_is_cumulative():
    a = load_assumptions(Path("assumptions.yaml"))
    y1, cohort, travel, costs = _inputs(a)
    cf = build_monthly_cashflow(a, y1, cohort, travel, costs)
    assert cf[0].ending_balance == (cf[0].contributions + cf[0].receipts - cf[0].disbursements)
    assert cf[1].ending_balance == (
        cf[0].ending_balance + cf[1].contributions + cf[1].receipts - cf[1].disbursements
    )
