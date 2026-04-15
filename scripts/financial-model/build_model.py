"""Generate aspire-financial-model.xlsx from assumptions.yaml.

Run: python build_model.py
Output: output/aspire-financial-model.xlsx
"""
from pathlib import Path
from typing import List, Tuple
from engine.schema import load_assumptions, Assumptions
from engine.revenue_year1 import build_year1_revenue, Year1RevenueLine
from engine.revenue_cohort import build_cohort_revenue_for_location, CohortRevenueLine
from engine.revenue_travel import build_travel_revenue_for_location, TravelRevenueLine
from engine.costs import build_cost_schedule
from engine.pnl import build_monthly_pnl
from engine.cashflow import build_monthly_cashflow
from engine.partner_returns import build_partner_returns
from engine.sensitivity import build_tornado
from engine.scenarios import run_scenarios
from engine.tam import compute_tam_check
from writers.workbook import build_empty_workbook, save_workbook
from writers.cover_tab import write_cover_tab
from writers.assumptions_tab import write_assumptions_tab
from writers.revenue_year1_tab import write_revenue_year1_tab
from writers.revenue_cohort_tab import write_revenue_cohort_tab
from writers.costs_tab import write_costs_tab
from writers.pnl_tab import write_pnl_tab
from writers.pnl_annual_tab import write_pnl_annual_tab
from writers.cashflow_tab import write_cashflow_tab
from writers.partner_returns_tab import write_partner_returns_tab
from writers.sensitivity_tab import write_sensitivity_tab
from writers.scenarios_tab import write_scenarios_tab
from writers.tam_tab import write_tam_tab
from writers.expansion_summary_tab import write_expansion_summary_tab


def _location_launch_years(a: Assumptions) -> List[Tuple[int, int]]:
    """Return [(location_id, launch_year)] sorted by launch_year ascending.

    Parses a.expansion.locations.by_year to determine when each location becomes
    active. Location 0 launches in the earliest year. Location N launches in the
    first year where by_year[year] >= N+1.
    """
    by_year = a.expansion.locations.by_year
    sorted_years = sorted(by_year.keys())
    if not sorted_years:
        return [(0, 2026)]

    max_count = max(by_year.values())
    result: List[Tuple[int, int]] = []
    for loc_id in range(max_count):
        for y in sorted_years:
            if by_year[y] >= loc_id + 1:
                result.append((loc_id, y))
                break
    return result


def main() -> None:
    here = Path(__file__).parent
    a = load_assumptions(here / "assumptions.yaml")

    all_y1_lines: List[Year1RevenueLine] = []
    all_cohort_lines: List[CohortRevenueLine] = []
    all_travel_lines: List[TravelRevenueLine] = []

    for loc_id, launch_year in _location_launch_years(a):
        is_new = (loc_id > 0)
        y1_lines = build_year1_revenue(a, location_id=loc_id, location_launch_year=launch_year)
        cohort_lines = build_cohort_revenue_for_location(
            a, y1_lines, location_id=loc_id, location_launch_year=launch_year, is_new_location=is_new,
        )
        travel_lines = build_travel_revenue_for_location(
            a, cohort_lines, location_id=loc_id, location_launch_year=launch_year,
        )
        all_y1_lines.extend(y1_lines)
        all_cohort_lines.extend(cohort_lines)
        all_travel_lines.extend(travel_lines)

    cost_schedule = build_cost_schedule(a)
    pnl_rows = build_monthly_pnl(a, all_y1_lines, all_cohort_lines, all_travel_lines, cost_schedule)
    cashflow_rows = build_monthly_cashflow(a, all_y1_lines, all_cohort_lines, all_travel_lines, cost_schedule)
    partner_report = build_partner_returns(a, cashflow_rows)
    tornado = build_tornado(a)
    scenarios = run_scenarios(a)
    tam = compute_tam_check(a, all_y1_lines, all_cohort_lines)

    wb = build_empty_workbook(a)
    write_cover_tab(wb, a)
    write_assumptions_tab(wb, a)
    write_revenue_year1_tab(wb, all_y1_lines)
    write_revenue_cohort_tab(wb, all_cohort_lines)
    write_costs_tab(wb, cost_schedule)
    write_pnl_annual_tab(wb, pnl_rows)
    write_pnl_tab(wb, pnl_rows)
    write_cashflow_tab(wb, cashflow_rows)
    write_partner_returns_tab(wb, partner_report)
    write_sensitivity_tab(wb, tornado)
    write_scenarios_tab(wb, scenarios)
    write_tam_tab(wb, tam)
    write_expansion_summary_tab(wb, a, all_y1_lines, all_cohort_lines, all_travel_lines, pnl_rows)

    out_path = here / "output" / "aspire-financial-model.xlsx"
    save_workbook(wb, out_path)
    print(f"Wrote {out_path}")


if __name__ == "__main__":
    main()
