from pathlib import Path
from engine.schema import load_assumptions
from engine.revenue_year1 import build_year1_revenue
from engine.revenue_cohort import build_cohort_revenue_for_location
from engine.revenue_travel import build_travel_revenue_for_location
from engine.costs import build_cost_schedule
from engine.pnl import build_monthly_pnl
from engine.cashflow import build_monthly_cashflow
from writers.workbook import build_empty_workbook
from writers.costs_tab import write_costs_tab
from writers.pnl_tab import write_pnl_tab
from writers.cashflow_tab import write_cashflow_tab


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


def test_financial_tabs_write_without_error():
    a = load_assumptions(Path("assumptions.yaml"))
    y1, cohort, travel, costs = _inputs(a)
    pnl = build_monthly_pnl(a, y1, cohort, travel, costs)
    cf = build_monthly_cashflow(a, y1, cohort, travel, costs)
    wb = build_empty_workbook(a)
    write_costs_tab(wb, costs)
    write_pnl_tab(wb, pnl)
    write_cashflow_tab(wb, cf)
    assert wb["Costs"]["A1"].value is not None
    assert wb["P&L"]["A1"].value is not None
    assert wb["Cash Flow"]["A1"].value is not None


def test_pnl_tab_has_60_month_rows():
    a = load_assumptions(Path("assumptions.yaml"))
    y1, cohort, travel, costs = _inputs(a)
    pnl = build_monthly_pnl(a, y1, cohort, travel, costs)
    wb = build_empty_workbook(a)
    write_pnl_tab(wb, pnl)
    ws = wb["P&L"]
    data_rows = [r for r in ws.iter_rows(min_row=3, values_only=True) if r[0] is not None]
    assert len(data_rows) == 60
