from dataclasses import dataclass
from datetime import date
from typing import List
from engine.schema import Assumptions, SportConfig, Season
from engine.calendar import registration_month_for_season


@dataclass
class Year1RevenueLine:
    sport: str
    season: Season
    season_year: int
    location_id: int
    age_band: str
    teams: int
    kids_registered: int
    gross_revenue: float
    discounts: float
    processing_fees: float
    net_revenue: float
    cash_month: date


def _apply_discounts_and_fees(
    gross: float, a: Assumptions, kids: int
) -> tuple[float, float, float]:
    sibling_rate = a.pricing.sibling_discount_rate
    discounts = gross * 0.25 * sibling_rate
    processing = (gross - discounts) * a.pricing.payment_processing_rate \
                 + a.pricing.payment_processing_flat * kids
    net = gross - discounts - processing
    return discounts, processing, net


def compute_season_revenue_for_sport(
    a: Assumptions,
    sport: SportConfig,
    season: Season,
    season_year: int,
    location_id: int,
) -> List[Year1RevenueLine]:
    """One line per age band in the sport's target_teams_y1 mapping."""
    if season not in sport.seasons:
        return []

    lines: List[Year1RevenueLine] = []
    fill = sport.fill_rate.base
    price = sport.price.base
    cash_month = registration_month_for_season(season, season_year)

    for age_band, team_count in sport.target_teams_y1.items():
        # Spring seasons grow target_teams per sport.season_growth_rate if set.
        # Fall (and winter) seasons use target_teams_y1 directly.
        if season == "spring" and sport.season_growth_rate is not None:
            team_count = round(team_count * (1 + sport.season_growth_rate.base))
        kids = int(team_count * sport.roster_size * fill)
        gross = kids * price
        discounts, processing, net = _apply_discounts_and_fees(gross, a, kids)
        lines.append(Year1RevenueLine(
            sport=sport.name,
            season=season,
            season_year=season_year,
            location_id=location_id,
            age_band=age_band,
            teams=team_count,
            kids_registered=kids,
            gross_revenue=gross,
            discounts=discounts,
            processing_fees=processing,
            net_revenue=net,
            cash_month=cash_month,
        ))
    return lines


def build_year1_revenue(
    a: Assumptions,
    location_id: int = 0,
    location_launch_year: int = 2026,
) -> List[Year1RevenueLine]:
    """Build all Year 1 revenue lines for one location. Y1 for a location means
    the first operating year of that location — soccer/flag/winter_skills each
    running their first season under the location's launch year."""
    lines: List[Year1RevenueLine] = []
    active_sports = [s for s in a.sports if s.launch_year <= location_launch_year]

    for sport in active_sports:
        for season in sport.seasons:
            # Year offset: spring seasons of a "Y1" calendar push into the next year
            if season == "spring":
                sy = location_launch_year + 1
            elif season == "winter":
                sy = location_launch_year
            else:
                sy = location_launch_year
            lines.extend(compute_season_revenue_for_sport(a, sport, season, sy, location_id))

    return lines
