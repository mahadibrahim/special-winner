from datetime import date
from pathlib import Path
from engine.schema import load_assumptions
from engine.revenue_year1 import build_year1_revenue
from engine.revenue_cohort import build_cohort_revenue
from engine.costs import build_cost_schedule
from engine.cashflow import build_monthly_cashflow, CashflowRow


def test_cashflow_row_count_matches_horizon():
    a = load_assumptions(Path("assumptions.yaml"))
    y1 = build_year1_revenue(a)
    cohort = build_cohort_revenue(a, y1)
    costs = build_cost_schedule(a)
    cf = build_monthly_cashflow(a, y1, cohort, costs)
    assert len(cf) == a.horizon_months


def test_initial_contributions_appear_in_month_1():
    a = load_assumptions(Path("assumptions.yaml"))
    y1 = build_year1_revenue(a)
    cohort = build_cohort_revenue(a, y1)
    costs = build_cost_schedule(a)
    cf = build_monthly_cashflow(a, y1, cohort, costs)
    assert cf[0].contributions == a.capital.contribution_per_founder * a.costs.num_founders


def test_ending_balance_is_cumulative():
    a = load_assumptions(Path("assumptions.yaml"))
    y1 = build_year1_revenue(a)
    cohort = build_cohort_revenue(a, y1)
    costs = build_cost_schedule(a)
    cf = build_monthly_cashflow(a, y1, cohort, costs)
    assert cf[0].ending_balance == (
        cf[0].contributions + cf[0].receipts - cf[0].disbursements
    )
    assert cf[1].ending_balance == (
        cf[0].ending_balance + cf[1].contributions + cf[1].receipts - cf[1].disbursements
    )
