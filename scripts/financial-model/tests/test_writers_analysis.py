from pathlib import Path
from engine.schema import load_assumptions
from engine.revenue_year1 import build_year1_revenue
from engine.revenue_cohort import build_cohort_revenue_for_location
from engine.revenue_travel import build_travel_revenue_for_location
from engine.costs import build_cost_schedule
from engine.cashflow import build_monthly_cashflow
from engine.partner_returns import build_partner_returns
from engine.sensitivity import build_tornado
from engine.scenarios import run_scenarios
from engine.tam import compute_tam_check
from writers.workbook import build_empty_workbook
from writers.partner_returns_tab import write_partner_returns_tab
from writers.sensitivity_tab import write_sensitivity_tab
from writers.scenarios_tab import write_scenarios_tab
from writers.tam_tab import write_tam_tab


def test_analysis_tabs_populate():
    a = load_assumptions(Path("assumptions.yaml"))
    y1 = build_year1_revenue(a, location_id=0, location_launch_year=2026)
    cohort = build_cohort_revenue_for_location(
        a, y1, location_id=0, location_launch_year=2026, is_new_location=False,
    )
    travel = build_travel_revenue_for_location(
        a, cohort, location_id=0, location_launch_year=2026,
    )
    costs = build_cost_schedule(a)
    cf = build_monthly_cashflow(a, y1, cohort, travel, costs)
    pr = build_partner_returns(a, cf)
    tornado = build_tornado(a)
    scenarios = run_scenarios(a)
    tam = compute_tam_check(a, y1, cohort)

    wb = build_empty_workbook(a)
    write_partner_returns_tab(wb, pr)
    write_sensitivity_tab(wb, tornado)
    write_scenarios_tab(wb, scenarios)
    write_tam_tab(wb, tam)

    assert wb["Partner Returns"]["A1"].value is not None
    assert wb["Sensitivity"]["A1"].value is not None
    assert wb["Scenarios"]["A1"].value is not None
    assert wb["TAM Check"]["A1"].value is not None
