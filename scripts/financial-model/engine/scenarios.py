from dataclasses import dataclass
from typing import List
from copy import deepcopy
from engine.schema import Assumptions, LowBaseHigh
from engine.revenue_year1 import build_year1_revenue
from engine.revenue_cohort import build_cohort_revenue
from engine.costs import build_cost_schedule
from engine.pnl import build_monthly_pnl


@dataclass
class ScenarioResult:
    name: str
    year1_revenue: float
    year3_net_income: float
    year5_net_income: float
    min_cash_balance: float


def _overlay_low(a: Assumptions) -> Assumptions:
    """Downside: use low values where appropriate and apply additional stress."""
    a2 = deepcopy(a)
    # Fill rates to low
    a2.demand.soccer_fill_rate = LowBaseHigh(
        low=a.demand.soccer_fill_rate.low * 0.7,
        base=a.demand.soccer_fill_rate.low,
        high=a.demand.soccer_fill_rate.base,
    )
    a2.demand.flag_fill_rate = LowBaseHigh(
        low=a.demand.flag_fill_rate.low * 0.7,
        base=a.demand.flag_fill_rate.low,
        high=a.demand.flag_fill_rate.base,
    )
    # Retention to low
    a2.retention.soccer_s1_to_s2 = LowBaseHigh(
        low=a.retention.soccer_s1_to_s2.low, base=a.retention.soccer_s1_to_s2.low,
        high=a.retention.soccer_s1_to_s2.base,
    )
    a2.retention.flag_s1_to_s2 = LowBaseHigh(
        low=a.retention.flag_s1_to_s2.low, base=a.retention.flag_s1_to_s2.low,
        high=a.retention.flag_s1_to_s2.base,
    )
    return a2


def _overlay_high(a: Assumptions) -> Assumptions:
    a2 = deepcopy(a)
    a2.demand.soccer_fill_rate = LowBaseHigh(
        low=a.demand.soccer_fill_rate.base, base=a.demand.soccer_fill_rate.high,
        high=a.demand.soccer_fill_rate.high,
    )
    a2.demand.flag_fill_rate = LowBaseHigh(
        low=a.demand.flag_fill_rate.base, base=a.demand.flag_fill_rate.high,
        high=a.demand.flag_fill_rate.high,
    )
    a2.retention.soccer_s1_to_s2 = LowBaseHigh(
        low=a.retention.soccer_s1_to_s2.base, base=a.retention.soccer_s1_to_s2.high,
        high=a.retention.soccer_s1_to_s2.high,
    )
    a2.retention.flag_s1_to_s2 = LowBaseHigh(
        low=a.retention.flag_s1_to_s2.base, base=a.retention.flag_s1_to_s2.high,
        high=a.retention.flag_s1_to_s2.high,
    )
    return a2


def _run_one(name: str, a: Assumptions) -> ScenarioResult:
    y1 = build_year1_revenue(a)
    cohort = build_cohort_revenue(a, y1)
    costs = build_cost_schedule(a)
    pnl = build_monthly_pnl(a, y1, cohort, costs)
    year1_rev = sum(r.revenue for r in pnl[:12])
    year3_ni = sum(r.net_income for r in pnl[24:36])
    year5_ni = sum(r.net_income for r in pnl[48:60])
    # min cash balance proxy = min monthly net income cumulative
    running = 0
    min_cash = 0
    for r in pnl:
        running += r.net_income
        if running < min_cash:
            min_cash = running
    return ScenarioResult(
        name=name, year1_revenue=year1_rev, year3_net_income=year3_ni,
        year5_net_income=year5_ni, min_cash_balance=min_cash,
    )


def run_scenarios(a: Assumptions) -> List[ScenarioResult]:
    return [
        _run_one("base", a),
        _run_one("downside", _overlay_low(a)),
        _run_one("upside", _overlay_high(a)),
    ]
