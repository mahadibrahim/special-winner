from dataclasses import dataclass, field
from datetime import date
from typing import Dict, List, Optional
import numpy_financial as npf
from engine.schema import Assumptions
from engine.cashflow import CashflowRow


@dataclass
class PartnerReturnsRow:
    month: date
    contribution: float = 0.0
    business_ending_balance: float = 0.0
    total_distribution: float = 0.0
    distribution_by_partner: Dict[str, float] = field(default_factory=dict)
    cumulative_distribution_by_partner: Dict[str, float] = field(default_factory=dict)


@dataclass
class PartnerReturnsReport:
    monthly_rows: List[PartnerReturnsRow]
    total_contribution_by_partner: Dict[str, float]
    total_distribution_by_partner: Dict[str, float]
    payback_month: Optional[date]
    irr: Optional[float]        # monthly IRR on business-level cash flows
    moic: Optional[float]


def build_partner_returns(a: Assumptions, cashflow: List[CashflowRow]) -> PartnerReturnsReport:
    partners = list(a.capital.equity_split.keys())
    per_partner_contrib = a.capital.contribution_per_founder

    rows: List[PartnerReturnsRow] = []
    cumulative_dist = {p: 0.0 for p in partners}
    cumulative_contrib = {p: 0.0 for p in partners}
    payback_month: Optional[date] = None

    total_contribution = per_partner_contrib * len(partners)
    reserve_floor = a.capital.working_capital_reserve_floor

    for cf_row in cashflow:
        row = PartnerReturnsRow(
            month=cf_row.month,
            business_ending_balance=cf_row.ending_balance,
            distribution_by_partner={p: 0.0 for p in partners},
            cumulative_distribution_by_partner={p: 0.0 for p in partners},
        )

        # Contributions on the month they land
        if cf_row.contributions > 0:
            for p in partners:
                row.contribution += per_partner_contrib
                cumulative_contrib[p] += per_partner_contrib

        # Distribution rule: only distribute if ending balance exceeds reserve_floor.
        # Split distribution 50/50 (per equity_split).
        excess = cf_row.ending_balance - reserve_floor
        if excess > 0:
            # First pay back any unreturned contributions 50/50 up to excess
            total_returned_so_far = sum(cumulative_dist.values())
            still_owed = max(0.0, total_contribution - total_returned_so_far)
            if still_owed > 0:
                payback_amount = min(excess, still_owed)
                for p in partners:
                    share = payback_amount * a.capital.equity_split[p]
                    row.distribution_by_partner[p] += share
                    cumulative_dist[p] += share
                row.total_distribution += payback_amount
                excess -= payback_amount

            # Any remaining excess is also distributed 50/50 (the "then split" step)
            if excess > 0:
                for p in partners:
                    share = excess * a.capital.equity_split[p]
                    row.distribution_by_partner[p] += share
                    cumulative_dist[p] += share
                row.total_distribution += excess

        for p in partners:
            row.cumulative_distribution_by_partner[p] = cumulative_dist[p]

        # Payback month: first month cumulative distributions >= total contributions
        if payback_month is None and sum(cumulative_dist.values()) >= total_contribution:
            payback_month = cf_row.month

        rows.append(row)

    # IRR on business-level monthly cash flows: contributions (negative) + distributions (positive)
    series = []
    for i, cf_row in enumerate(cashflow):
        outflow = -cf_row.contributions if cf_row.contributions else 0
        inflow = rows[i].total_distribution
        series.append(outflow + inflow)
    try:
        irr_monthly = npf.irr(series)
        irr = (1 + irr_monthly) ** 12 - 1 if irr_monthly is not None else None
    except Exception:
        irr = None

    total_dist = sum(cumulative_dist.values())
    moic = total_dist / total_contribution if total_contribution > 0 else None

    return PartnerReturnsReport(
        monthly_rows=rows,
        total_contribution_by_partner={p: per_partner_contrib for p in partners},
        total_distribution_by_partner=cumulative_dist,
        payback_month=payback_month,
        irr=irr,
        moic=moic,
    )
