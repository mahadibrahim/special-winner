from dataclasses import dataclass
from datetime import date
from typing import List, Dict, Tuple
from engine.schema import Assumptions, SportConfig, Season
from engine.calendar import registration_month_for_season
from engine.revenue_year1 import Year1RevenueLine


@dataclass
class Cohort:
    location_id: int
    sport: str
    age_band: str
    size: int
    origin_year: int


@dataclass
class CohortRevenueLine:
    sport: str
    season: Season
    season_year: int
    location_id: int
    age_band: str
    kids_registered: int
    gross_revenue: float
    net_revenue: float
    cash_month: date


def apply_retention(cohort: Cohort, rate: float) -> Cohort:
    return Cohort(
        location_id=cohort.location_id,
        sport=cohort.sport,
        age_band=cohort.age_band,
        size=int(cohort.size * rate),
        origin_year=cohort.origin_year,
    )


def _retention_rate(sport: SportConfig, seasons_since_origin: int) -> float:
    if seasons_since_origin <= 1:
        return sport.s1_to_s2.base
    if seasons_since_origin == 2:
        return sport.s2_to_s3.base
    return sport.s3_plus.base


def _season_sequence_after_launch(launch_year: int, horizon_years: int = 4) -> List[Tuple[Season, int]]:
    """Return (season, calendar_year) pairs covering the years AFTER the launch year,
    out to launch_year + horizon_years. For each year we emit fall, winter (with year+1
    for Jan-Mar of the following calendar year), spring."""
    result: List[Tuple[Season, int]] = []
    for offset in range(1, horizon_years + 1):
        y = launch_year + offset
        result.append(("fall", y))
        result.append(("winter", y))
        result.append(("spring", y + 1))
    return result


def build_cohort_revenue_for_location(
    a: Assumptions,
    y1_lines: List[Year1RevenueLine],
    location_id: int,
    location_launch_year: int,
    is_new_location: bool,
) -> List[CohortRevenueLine]:
    """Build Years 2-5 revenue lines for a single location's cohort universe.

    Each (sport, age_band) starts as a cohort sized from the y1 lines' kids_registered.
    Retention × referral multiplier compounds each season the sport runs.
    """
    lines: List[CohortRevenueLine] = []
    ref_mult = a.retention.referral_multiplier.base

    # Initialize cohorts from Y1 totals per (sport, age_band)
    cohorts: Dict[Tuple[str, str], int] = {}
    for y1 in y1_lines:
        key = (y1.sport, y1.age_band)
        cohorts[key] = cohorts.get(key, 0) + y1.kids_registered

    active_sports = {s.name: s for s in a.sports if s.launch_year <= location_launch_year}
    season_sequence = _season_sequence_after_launch(location_launch_year, horizon_years=4)

    # Track seasons-since-origin per (sport, age_band) for retention curve lookup
    seasons_elapsed: Dict[Tuple[str, str], int] = {k: 1 for k in cohorts.keys()}

    for idx, (season, season_year) in enumerate(season_sequence):
        for sport_name, sport in active_sports.items():
            if season not in sport.seasons:
                continue
            for age_band in list(cohorts.keys()):
                if age_band[0] != sport_name:
                    continue
                current = cohorts[age_band]
                if current == 0:
                    continue
                seasons_elapsed[age_band] = seasons_elapsed.get(age_band, 1) + 1
                rate = _retention_rate(sport, seasons_elapsed[age_band])
                new_size = int(current * rate * ref_mult)
                cohorts[age_band] = new_size

                gross = new_size * sport.price.base
                net = gross * 0.94  # rough discount + processing — same heuristic as Plan 1
                lines.append(CohortRevenueLine(
                    sport=sport_name,
                    season=season,
                    season_year=season_year,
                    location_id=location_id,
                    age_band=age_band[1],
                    kids_registered=new_size,
                    gross_revenue=gross,
                    net_revenue=net,
                    cash_month=registration_month_for_season(season, season_year),
                ))

    return lines


def get_eligible_rec_kids_for_travel_upgrade(
    cohort_lines: List[CohortRevenueLine],
    season_year: int,
    eligible_bands_by_sport: Dict[str, List[str]],
) -> int:
    """Sum of kids_registered across cohort lines matching the eligibility filter for a given year."""
    total = 0
    for line in cohort_lines:
        if line.season_year != season_year:
            continue
        eligible = eligible_bands_by_sport.get(line.sport, [])
        if line.age_band in eligible:
            total += line.kids_registered
    return total
