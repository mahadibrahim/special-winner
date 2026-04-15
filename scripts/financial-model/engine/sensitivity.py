from dataclasses import dataclass
from typing import List, Callable
from copy import deepcopy
from engine.schema import Assumptions, LowBaseHigh
from engine.revenue_year1 import build_year1_revenue
from engine.revenue_cohort import build_cohort_revenue
from engine.costs import build_cost_schedule
from engine.pnl import build_monthly_pnl


@dataclass
class TornadoBar:
    variable: str
    output_low: float
    output_base: float
    output_high: float
    impact: float


def _year3_net_income(a: Assumptions) -> float:
    y1 = build_year1_revenue(a)
    cohort = build_cohort_revenue(a, y1)
    costs = build_cost_schedule(a)
    pnl = build_monthly_pnl(a, y1, cohort, costs)
    return sum(r.net_income for r in pnl[24:36])


def _flex(a: Assumptions, path: str, which: str) -> Assumptions:
    """Set the specified LowBaseHigh path's base value to its .low, .base, or .high."""
    a2 = deepcopy(a)
    obj = a2
    parts = path.split(".")
    for p in parts[:-1]:
        obj = getattr(obj, p)
    field_name = parts[-1]
    lbh: LowBaseHigh = getattr(obj, field_name)
    new_base = getattr(lbh, which)
    setattr(obj, field_name, LowBaseHigh(low=lbh.low, base=new_base, high=lbh.high))
    return a2


_SENSITIVITY_VARIABLES = [
    ("soccer_fill_rate", "demand.soccer_fill_rate"),
    ("flag_fill_rate", "demand.flag_fill_rate"),
    ("soccer_s1_to_s2_retention", "retention.soccer_s1_to_s2"),
    ("soccer_s2_to_s3_retention", "retention.soccer_s2_to_s3"),
    ("cross_sell_rate", "retention.cross_sell_rate"),
    ("referral_multiplier", "retention.referral_multiplier"),
    ("blended_cac_y1", "acquisition.blended_cac_y1"),
    ("soccer_price", "pricing.soccer_price"),
    ("flag_price", "pricing.flag_price"),
    ("head_coach_hourly", "costs.head_coach_hourly"),
    ("indoor_turf_full_hourly", "costs.indoor_turf_full_hourly"),
]


def build_tornado(a: Assumptions) -> List[TornadoBar]:
    base_output = _year3_net_income(a)
    bars: List[TornadoBar] = []
    for name, path in _SENSITIVITY_VARIABLES:
        try:
            a_low = _flex(a, path, "low")
            a_high = _flex(a, path, "high")
            out_low = _year3_net_income(a_low)
            out_high = _year3_net_income(a_high)
            bars.append(TornadoBar(
                variable=name, output_low=min(out_low, out_high),
                output_base=base_output, output_high=max(out_low, out_high),
                impact=abs(out_high - out_low),
            ))
        except AttributeError:
            # variable path not found — skip
            continue
    bars.sort(key=lambda b: b.impact, reverse=True)
    return bars
