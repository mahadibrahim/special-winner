from dataclasses import dataclass
from typing import List
from engine.schema import Assumptions
from engine.revenue_year1 import Year1RevenueLine
from engine.revenue_cohort import CohortRevenueLine


@dataclass
class TamReport:
    addressable_kids: int
    implied_market_share_by_year: List[float]


def compute_tam_check(
    a: Assumptions,
    y1_lines: List[Year1RevenueLine],
    cohort_lines: List[CohortRevenueLine],
) -> TamReport:
    tam_per_loc = a.expansion.locations.tam_per_location
    by_year = a.expansion.locations.by_year

    def tam_for_year(year: int) -> int:
        return tam_per_loc * by_year.get(year, 1)

    shares: List[float] = []

    y1_unique = sum(
        l.kids_registered for l in y1_lines
        if l.sport in ("soccer", "flag") and l.season == "fall"
    )
    shares.append(y1_unique / tam_for_year(2026))

    for year in range(2027, 2031):
        year_kids = max(
            (l.kids_registered for l in cohort_lines
             if l.season_year == year and l.sport in ("soccer", "flag")),
            default=0,
        )
        shares.append(year_kids / tam_for_year(year))

    return TamReport(
        addressable_kids=tam_for_year(2026),
        implied_market_share_by_year=shares,
    )
