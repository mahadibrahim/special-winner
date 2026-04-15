from dataclasses import dataclass
from typing import List
from copy import deepcopy
from engine.schema import Assumptions, LowBaseHigh
from engine.revenue_year1 import build_year1_revenue
from engine.revenue_cohort import build_cohort_revenue_for_location
from engine.revenue_travel import build_travel_revenue_for_location
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
    """Downside: shift every sport's fill_rate and s1_to_s2 toward their low values."""
    a2 = deepcopy(a)
    for sport in a2.sports:
        sport.fill_rate = LowBaseHigh(
            low=sport.fill_rate.low * 0.7,
            base=sport.fill_rate.low,
            high=sport.fill_rate.base,
        )
        sport.s1_to_s2 = LowBaseHigh(
            low=sport.s1_to_s2.low,
            base=sport.s1_to_s2.low,
            high=sport.s1_to_s2.base,
        )
    return a2


def _overlay_high(a: Assumptions) -> Assumptions:
    a2 = deepcopy(a)
    for sport in a2.sports:
        sport.fill_rate = LowBaseHigh(
            low=sport.fill_rate.base,
            base=sport.fill_rate.high,
            high=sport.fill_rate.high,
        )
        sport.s1_to_s2 = LowBaseHigh(
            low=sport.s1_to_s2.base,
            base=sport.s1_to_s2.high,
            high=sport.s1_to_s2.high,
        )
    return a2


def _run_one(name: str, a: Assumptions) -> ScenarioResult:
    y1 = build_year1_revenue(a, location_id=0, location_launch_year=2026)
    cohort = build_cohort_revenue_for_location(
        a, y1, location_id=0, location_launch_year=2026, is_new_location=False,
    )
    travel = build_travel_revenue_for_location(
        a, cohort, location_id=0, location_launch_year=2026,
    )
    costs = build_cost_schedule(a)
    pnl = build_monthly_pnl(a, y1, cohort, travel, costs)
    year1_rev = sum(r.revenue for r in pnl[:12])
    year3_ni = sum(r.net_income for r in pnl[24:36])
    year5_ni = sum(r.net_income for r in pnl[48:60])
    running = 0
    min_cash = 0
    for r in pnl:
        running += r.net_income
        if running < min_cash:
            min_cash = running
    return ScenarioResult(
        name=name, year1_revenue=year1_rev,
        year3_net_income=year3_ni, year5_net_income=year5_ni,
        min_cash_balance=min_cash,
    )


def run_scenarios(a: Assumptions) -> List[ScenarioResult]:
    return [
        _run_one("base", a),
        _run_one("downside", _overlay_low(a)),
        _run_one("upside", _overlay_high(a)),
    ]
