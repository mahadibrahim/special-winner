from dataclasses import dataclass
from datetime import date
from typing import List
from engine.schema import Assumptions
from engine.calendar import parse_year_month, month_sequence
from engine.revenue_year1 import Year1RevenueLine
from engine.revenue_cohort import CohortRevenueLine
from engine.costs import CostScheduleRow, compute_variable_costs_for_line, compute_variable_costs_for_cohort_line


@dataclass
class PnLRow:
    month: date
    revenue: float = 0.0
    variable_cost: float = 0.0
    fixed_expense: float = 0.0
    total_expense: float = 0.0
    net_income: float = 0.0


def build_monthly_pnl(
    a: Assumptions,
    y1_lines: List[Year1RevenueLine],
    cohort_lines: List[CohortRevenueLine],
    cost_schedule: List[CostScheduleRow],
) -> List[PnLRow]:
    """Build a monthly P&L for the full horizon. Revenue is recognized in the
    month it is collected (cash_month) for simplicity in v1."""
    start = parse_year_month(a.start_month)
    months = month_sequence(start, a.horizon_months)
    month_index = {m: i for i, m in enumerate(months)}
    rows = [PnLRow(month=m) for m in months]

    # Revenue: recognize in cash_month
    for line in y1_lines:
        if line.cash_month in month_index:
            rows[month_index[line.cash_month]].revenue += line.net_revenue
    for line in cohort_lines:
        if line.cash_month in month_index:
            rows[month_index[line.cash_month]].revenue += line.net_revenue

    # Variable costs: Year 1 lines spread uniformly across months 1-12 (v1
    # simplification preserved). Cohort lines (Y2-5) land in each line's
    # cash_month, matching the P&L's revenue recognition timing.
    y1_var_total = sum(compute_variable_costs_for_line(a, l)["total"] for l in y1_lines)
    monthly_var = y1_var_total / 12
    for i in range(min(12, len(rows))):
        rows[i].variable_cost += monthly_var

    for line in cohort_lines:
        if line.cash_month in month_index:
            vc = compute_variable_costs_for_cohort_line(a, line)
            rows[month_index[line.cash_month]].variable_cost += vc["total"]

    # Fixed expense from cost schedule
    for i, cs in enumerate(cost_schedule):
        rows[i].fixed_expense = cs.total_fixed_expense

    # Total and net income
    for r in rows:
        r.total_expense = r.variable_cost + r.fixed_expense
        r.net_income = r.revenue - r.total_expense

    return rows
