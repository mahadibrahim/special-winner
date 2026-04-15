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
class CashflowRow:
    month: date
    contributions: float = 0.0
    receipts: float = 0.0
    disbursements: float = 0.0
    net_change: float = 0.0
    ending_balance: float = 0.0


def build_monthly_cashflow(
    a: Assumptions,
    y1_lines: List[Year1RevenueLine],
    cohort_lines: List[CohortRevenueLine],
    travel_lines: List[TravelRevenueLine],
    cost_schedule: List[CostScheduleRow],
) -> List[CashflowRow]:
    start = parse_year_month(a.start_month)
    months = month_sequence(start, a.horizon_months)
    month_index = {m: i for i, m in enumerate(months)}
    rows = [CashflowRow(month=m) for m in months]
    sports_by_name: Dict[str, SportConfig] = {s.name: s for s in a.sports}

    contrib_idx = a.capital.contribution_month - 1
    total_contribution = a.capital.contribution_per_founder * a.costs.num_founders
    rows[contrib_idx].contributions = total_contribution

    for line in y1_lines:
        if line.cash_month in month_index:
            rows[month_index[line.cash_month]].receipts += line.net_revenue
    for line in cohort_lines:
        if line.cash_month in month_index:
            rows[month_index[line.cash_month]].receipts += line.net_revenue
    for line in travel_lines:
        if line.cash_month in month_index:
            rows[month_index[line.cash_month]].receipts += line.net_revenue

    for line in y1_lines:
        if line.cash_month in month_index:
            sport = sports_by_name.get(line.sport)
            if sport is None:
                continue
            vc = compute_variable_costs_for_line(a, line, sport)
            rows[month_index[line.cash_month]].disbursements += vc["total"]

    for line in cohort_lines:
        if line.cash_month in month_index:
            sport = sports_by_name.get(line.sport)
            if sport is None:
                continue
            vc = compute_variable_costs_for_line(a, line, sport)
            rows[month_index[line.cash_month]].disbursements += vc["total"]

    for line in travel_lines:
        if line.cash_month in month_index:
            vc = compute_variable_costs_for_travel_line(a, line)
            rows[month_index[line.cash_month]].disbursements += vc["total"]

    for i, cs in enumerate(cost_schedule):
        rows[i].disbursements += (
            cs.software + cs.insurance + cs.bookkeeping + cs.founder_time
            + cs.marketing + cs.cash_curriculum
        )

    running = 0.0
    for r in rows:
        r.net_change = r.contributions + r.receipts - r.disbursements
        running += r.net_change
        r.ending_balance = running

    return rows
