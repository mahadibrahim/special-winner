from dataclasses import dataclass
from typing import List
from engine.schema import Assumptions
from engine.revenue_year1 import Year1RevenueLine
from engine.revenue_cohort import CohortRevenueLine


# Dublin + Powell estimated addressable kids aged 5-12
# Dublin population ~50K, ~15% kids 5-14 ≈ 7,500. Powell ~15K, ~20% kids 5-14 ≈ 3,000.
# Conservative combined: ~10,500 addressable kids in soccer/flag age range.
DUBLIN_POWELL_ADDRESSABLE_KIDS = 10500


@dataclass
class TamReport:
    addressable_kids: int
    implied_market_share_by_year: List[float]


def compute_tam_check(
    a: Assumptions,
    y1_lines: List[Year1RevenueLine],
    cohort_lines: List[CohortRevenueLine],
) -> TamReport:
    """Compare implied unique kids served per year to the addressable market."""
    shares: List[float] = []

    # Year 1: sum of unique kids across all Year 1 league lines (exclude winter_skills
    # to avoid double counting cross-sell)
    y1_unique = sum(l.kids_registered for l in y1_lines
                    if l.sport in ("soccer", "flag") and l.season == "fall")
    shares.append(y1_unique / DUBLIN_POWELL_ADDRESSABLE_KIDS)

    # Years 2-5: max cohort kids per year
    for year in range(2027, 2031):
        year_kids = max(
            (l.kids_registered for l in cohort_lines
             if l.season_year == year and l.sport in ("soccer", "flag")),
            default=0,
        )
        shares.append(year_kids / DUBLIN_POWELL_ADDRESSABLE_KIDS)

    return TamReport(
        addressable_kids=DUBLIN_POWELL_ADDRESSABLE_KIDS,
        implied_market_share_by_year=shares,
    )
