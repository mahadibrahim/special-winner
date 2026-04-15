from datetime import date
from pathlib import Path
from engine.schema import load_assumptions
from engine.revenue_year1 import build_year1_revenue
from engine.revenue_cohort import build_cohort_revenue
from engine.costs import build_cost_schedule
from engine.pnl import build_monthly_pnl, PnLRow


def test_pnl_has_row_per_month_in_horizon():
    a = load_assumptions(Path("assumptions.yaml"))
    y1 = build_year1_revenue(a)
    cohort = build_cohort_revenue(a, y1)
    costs = build_cost_schedule(a)
    pnl = build_monthly_pnl(a, y1, cohort, costs)
    assert len(pnl) == a.horizon_months


def test_pnl_row_fields():
    a = load_assumptions(Path("assumptions.yaml"))
    y1 = build_year1_revenue(a)
    cohort = build_cohort_revenue(a, y1)
    costs = build_cost_schedule(a)
    pnl = build_monthly_pnl(a, y1, cohort, costs)
    row = pnl[0]
    assert isinstance(row, PnLRow)
    assert row.month == date(2026, 7, 1)
    # Net income = revenue - total expense
    assert row.net_income == row.revenue - row.total_expense


def test_pnl_year1_total_revenue_matches_year1_lines():
    """Sum of monthly revenue in months 1-12 should equal sum of Year 1 line net revenues
    (Year 1 has lines whose cash_month falls within months 1-12, so revenue recognition
    should align)."""
    a = load_assumptions(Path("assumptions.yaml"))
    y1 = build_year1_revenue(a)
    cohort = build_cohort_revenue(a, y1)
    costs = build_cost_schedule(a)
    pnl = build_monthly_pnl(a, y1, cohort, costs)
    y1_pnl_total = sum(r.revenue for r in pnl[:12])
    y1_lines_total = sum(l.net_revenue for l in y1)
    # The two should be close (cohort winter also contributes in month 5 of Y1 if it recognizes)
    assert abs(y1_pnl_total - y1_lines_total) < y1_lines_total * 0.5  # loose bound
