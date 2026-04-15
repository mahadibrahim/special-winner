from dataclasses import dataclass
from datetime import date
from typing import List, Dict
from engine.schema import Assumptions, SportConfig
from engine.calendar import parse_year_month, month_sequence
from engine.revenue_year1 import Year1RevenueLine
from engine.revenue_cohort import CohortRevenueLine
from engine.revenue_travel import TravelRevenueLine
from engine.costs import (
    CostScheduleRow,
    compute_variable_costs_for_line,
    compute_variable_costs_for_travel_line,
)


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
    travel_lines: List[TravelRevenueLine],
    cost_schedule: List[CostScheduleRow],
) -> List[PnLRow]:
    start = parse_year_month(a.start_month)
    months = month_sequence(start, a.horizon_months)
    month_index = {m: i for i, m in enumerate(months)}
    rows = [PnLRow(month=m) for m in months]
    sports_by_name: Dict[str, SportConfig] = {s.name: s for s in a.sports}

    for line in y1_lines:
        if line.cash_month in month_index:
            rows[month_index[line.cash_month]].revenue += line.net_revenue
    for line in cohort_lines:
        if line.cash_month in month_index:
            rows[month_index[line.cash_month]].revenue += line.net_revenue
    for line in travel_lines:
        if line.cash_month in month_index:
            rows[month_index[line.cash_month]].revenue += line.net_revenue

    for line in y1_lines:
        if line.cash_month in month_index:
            sport = sports_by_name.get(line.sport)
            if sport is None:
                continue
            vc = compute_variable_costs_for_line(a, line, sport)
            rows[month_index[line.cash_month]].variable_cost += vc["total"]

    for line in cohort_lines:
        if line.cash_month in month_index:
            sport = sports_by_name.get(line.sport)
            if sport is None:
                continue
            vc = compute_variable_costs_for_line(a, line, sport)
            rows[month_index[line.cash_month]].variable_cost += vc["total"]

    for line in travel_lines:
        if line.cash_month in month_index:
            vc = compute_variable_costs_for_travel_line(a, line)
            rows[month_index[line.cash_month]].variable_cost += vc["total"]

    for i, cs in enumerate(cost_schedule):
        rows[i].fixed_expense = cs.total_fixed_expense

    for r in rows:
        r.total_expense = r.variable_cost + r.fixed_expense
        r.net_income = r.revenue - r.total_expense

    return rows
