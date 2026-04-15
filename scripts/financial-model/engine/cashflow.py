from dataclasses import dataclass
from datetime import date
from typing import List
from engine.schema import Assumptions
from engine.calendar import parse_year_month, month_sequence
from engine.revenue_year1 import Year1RevenueLine
from engine.revenue_cohort import CohortRevenueLine
from engine.costs import CostScheduleRow


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
    cost_schedule: List[CostScheduleRow],
) -> List[CashflowRow]:
    """Monthly cash flow: contributions + receipts - disbursements = net change.
    Ending balance is cumulative from month 1."""
    start = parse_year_month(a.start_month)
    months = month_sequence(start, a.horizon_months)
    month_index = {m: i for i, m in enumerate(months)}
    rows = [CashflowRow(month=m) for m in months]

    # Partner contributions land in contribution_month (1-indexed → 0-indexed)
    contrib_idx = a.capital.contribution_month - 1
    total_contribution = a.capital.contribution_per_founder * a.costs.num_founders
    rows[contrib_idx].contributions = total_contribution

    # Revenue cash receipts land in cash_month
    for line in y1_lines:
        if line.cash_month in month_index:
            rows[month_index[line.cash_month]].receipts += line.net_revenue
    for line in cohort_lines:
        if line.cash_month in month_index:
            rows[month_index[line.cash_month]].receipts += line.net_revenue

    # Disbursements: variable costs (allocated uniformly Y1) + cost schedule cash
    from engine.costs import compute_variable_costs_for_line
    y1_var_total = sum(compute_variable_costs_for_line(a, l)["total"] for l in y1_lines)
    monthly_var = y1_var_total / 12
    for i in range(min(12, len(rows))):
        rows[i].disbursements += monthly_var

    for i, cs in enumerate(cost_schedule):
        rows[i].disbursements += (
            cs.software + cs.insurance + cs.bookkeeping + cs.founder_time + cs.marketing + cs.cash_curriculum
        )

    # Net change and cumulative ending balance
    running = 0.0
    for r in rows:
        r.net_change = r.contributions + r.receipts - r.disbursements
        running += r.net_change
        r.ending_balance = running

    return rows
