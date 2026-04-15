from dataclasses import dataclass
from datetime import date
from typing import List, Literal, Dict
from engine.schema import Assumptions
from engine.calendar import registration_month_for_season
from engine.revenue_cohort import CohortRevenueLine


# Hardcoded age-band eligibility for rec-to-travel upgrade funnel.
# Per spec open question #3: soccer U10+U12, flag 3-4+5-6.
ELIGIBLE_BANDS_FOR_UPGRADE: Dict[str, List[str]] = {
    "soccer": ["U10", "U12"],
    "flag": ["3-4", "5-6"],
}


@dataclass
class TravelRevenueLine:
    sport: str
    season: Literal["fall", "winter", "spring"]
    season_year: int
    location_id: int
    kids_registered: int
    gross_revenue: float
    net_revenue: float
    cash_month: date
    origin_channel: Literal["direct", "upgrade"]


def _eligible_rec_kids(
    cohort_lines: List[CohortRevenueLine], season_year: int
) -> int:
    total = 0
    for line in cohort_lines:
        if line.season_year != season_year:
            continue
        eligible = ELIGIBLE_BANDS_FOR_UPGRADE.get(line.sport, [])
        if line.age_band in eligible:
            total += line.kids_registered
    return total


def build_travel_revenue_for_location(
    a: Assumptions,
    cohort_lines: List[CohortRevenueLine],
    location_id: int,
    location_launch_year: int,
) -> List[TravelRevenueLine]:
    """Build travel tier revenue lines for one location across the horizon.

    Two streams:
    - Direct: target_teams_direct_y1 × roster × fill, in travel launch year of location
    - Upgrade: rec_to_travel_upgrade_rate × eligible_rec_cohort_kids, each subsequent year

    Direct and upgrade kids merge into a shared travel pool that retains on the travel
    curve. For v1 we emit one line per (origin_channel, season_year) pair.
    """
    if a.expansion.travel is None:
        return []
    travel = a.expansion.travel
    if travel.launch_year > location_launch_year + 4:  # out of 5yr horizon
        return []

    lines: List[TravelRevenueLine] = []
    effective_launch = max(travel.launch_year, location_launch_year)

    travel_pool = 0
    ref_mult = a.retention.referral_multiplier.base

    for year in range(effective_launch, location_launch_year + 5):
        direct_teams = sum(travel.target_teams_direct_y1.values())
        direct_kids = int(direct_teams * travel.travel_roster_size * travel.direct_fill_rate.base)

        eligible = _eligible_rec_kids(cohort_lines, year)
        upgrade_kids = int(eligible * travel.rec_to_travel_upgrade_rate.base)

        if year == effective_launch:
            travel_pool = direct_kids + upgrade_kids
        else:
            retained = int(travel_pool * travel.travel_s2_to_s3.base * ref_mult)
            travel_pool = retained + direct_kids + upgrade_kids

        for channel, kids in [("direct", direct_kids), ("upgrade", upgrade_kids)]:
            if kids == 0:
                continue
            gross = kids * travel.travel_price.base
            net = gross * 0.94
            lines.append(TravelRevenueLine(
                sport="travel",
                season="fall",
                season_year=year,
                location_id=location_id,
                kids_registered=kids,
                gross_revenue=gross,
                net_revenue=net,
                cash_month=registration_month_for_season("fall", year),
                origin_channel=channel,
            ))

    return lines
