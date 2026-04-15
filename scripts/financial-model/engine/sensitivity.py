from dataclasses import dataclass
from typing import List, Callable
from copy import deepcopy
from engine.schema import Assumptions, LowBaseHigh
from engine.revenue_year1 import build_year1_revenue
from engine.revenue_cohort import build_cohort_revenue_for_location
from engine.revenue_travel import build_travel_revenue_for_location
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
    y1 = build_year1_revenue(a, location_id=0, location_launch_year=2026)
    cohort = build_cohort_revenue_for_location(
        a, y1, location_id=0, location_launch_year=2026, is_new_location=False,
    )
    travel = build_travel_revenue_for_location(
        a, cohort, location_id=0, location_launch_year=2026,
    )
    costs = build_cost_schedule(a)
    pnl = build_monthly_pnl(a, y1, cohort, travel, costs)
    return sum(r.net_income for r in pnl[24:36])


def _flex_sport_field(
    a: Assumptions, sport_name: str, field: str, which: str
) -> Assumptions:
    a2 = deepcopy(a)
    for sport in a2.sports:
        if sport.name == sport_name:
            lbh: LowBaseHigh = getattr(sport, field)
            new_base = getattr(lbh, which)
            setattr(sport, field, LowBaseHigh(low=lbh.low, base=new_base, high=lbh.high))
            return a2
    return a2


def _flex_cross_cutting(
    a: Assumptions, path: str, which: str
) -> Assumptions:
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


_SPORT_VARIABLES = [
    ("soccer", "fill_rate", "soccer_fill_rate"),
    ("flag", "fill_rate", "flag_fill_rate"),
    ("soccer", "s1_to_s2", "soccer_s1_to_s2_retention"),
    ("soccer", "s2_to_s3", "soccer_s2_to_s3_retention"),
]

_CROSS_VARIABLES = [
    ("referral_multiplier", "retention.referral_multiplier"),
    ("blended_cac_y1", "acquisition.blended_cac_y1"),
    ("head_coach_hourly", "costs.head_coach_hourly"),
]


def build_tornado(a: Assumptions) -> List[TornadoBar]:
    base_output = _year3_net_income(a)
    bars: List[TornadoBar] = []

    for sport_name, field, label in _SPORT_VARIABLES:
        try:
            a_low = _flex_sport_field(a, sport_name, field, "low")
            a_high = _flex_sport_field(a, sport_name, field, "high")
            out_low = _year3_net_income(a_low)
            out_high = _year3_net_income(a_high)
            bars.append(TornadoBar(
                variable=label, output_low=min(out_low, out_high),
                output_base=base_output, output_high=max(out_low, out_high),
                impact=abs(out_high - out_low),
            ))
        except AttributeError:
            continue

    for label, path in _CROSS_VARIABLES:
        try:
            a_low = _flex_cross_cutting(a, path, "low")
            a_high = _flex_cross_cutting(a, path, "high")
            out_low = _year3_net_income(a_low)
            out_high = _year3_net_income(a_high)
            bars.append(TornadoBar(
                variable=label, output_low=min(out_low, out_high),
                output_base=base_output, output_high=max(out_low, out_high),
                impact=abs(out_high - out_low),
            ))
        except AttributeError:
            continue

    bars.sort(key=lambda b: b.impact, reverse=True)
    return bars
