"""Generate aspire-financial-model.xlsx from assumptions.yaml.

Run: python build_model.py
Output: output/aspire-financial-model.xlsx
"""
from pathlib import Path
from engine.schema import load_assumptions
from engine.revenue_year1 import build_year1_revenue
from engine.revenue_cohort import build_cohort_revenue
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
from writers.cashflow_tab import write_cashflow_tab
from writers.partner_returns_tab import write_partner_returns_tab
from writers.sensitivity_tab import write_sensitivity_tab
from writers.scenarios_tab import write_scenarios_tab
from writers.tam_tab import write_tam_tab


def main() -> None:
    here = Path(__file__).parent
    a = load_assumptions(here / "assumptions.yaml")

    y1_lines = build_year1_revenue(a)
    cohort_lines = build_cohort_revenue(a, y1_lines)
    cost_schedule = build_cost_schedule(a)
    pnl_rows = build_monthly_pnl(a, y1_lines, cohort_lines, cost_schedule)
    cashflow_rows = build_monthly_cashflow(a, y1_lines, cohort_lines, cost_schedule)
    partner_report = build_partner_returns(a, cashflow_rows)
    tornado = build_tornado(a)
    scenarios = run_scenarios(a)
    tam = compute_tam_check(a, y1_lines, cohort_lines)

    wb = build_empty_workbook(a)
    write_cover_tab(wb, a)
    write_assumptions_tab(wb, a)
    write_revenue_year1_tab(wb, y1_lines)
    write_revenue_cohort_tab(wb, cohort_lines)
    write_costs_tab(wb, cost_schedule)
    write_pnl_tab(wb, pnl_rows)
    write_cashflow_tab(wb, cashflow_rows)
    write_partner_returns_tab(wb, partner_report)
    write_sensitivity_tab(wb, tornado)
    write_scenarios_tab(wb, scenarios)
    write_tam_tab(wb, tam)

    out_path = here / "output" / "aspire-financial-model.xlsx"
    save_workbook(wb, out_path)
    print(f"Wrote {out_path}")


if __name__ == "__main__":
    main()
