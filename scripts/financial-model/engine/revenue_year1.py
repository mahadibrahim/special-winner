from dataclasses import dataclass
from datetime import date
from typing import List, Literal
from engine.schema import Assumptions
from engine.calendar import registration_month_for_season, Season


Sport = Literal["soccer", "flag", "winter_skills"]


@dataclass
class Year1RevenueLine:
    sport: Sport
    season: Season
    season_year: int
    teams_or_groups: int
    kids_registered: int
    gross_revenue: float
    discounts: float
    processing_fees: float
    net_revenue: float
    cash_month: date


def _league_kids(assumptions: Assumptions, sport: Sport, season: Season) -> tuple[int, int]:
    """Return (teams, kids) for a league sport/season, applying fill rate and growth."""
    if sport == "soccer":
        target_teams = sum(assumptions.demand.target_teams_soccer_y1_fall.values())
        roster = assumptions.pricing.soccer_roster_size
        fill = assumptions.demand.soccer_fill_rate.base
    elif sport == "flag":
        target_teams = sum(assumptions.demand.target_teams_flag_y1_fall.values())
        roster = assumptions.pricing.flag_roster_size
        fill = assumptions.demand.flag_fill_rate.base
    else:
        raise ValueError(f"Not a league sport: {sport}")

    if season == "spring":
        target_teams = round(target_teams * (1 + assumptions.demand.season_growth_rate.base))

    kids = int(target_teams * roster * fill)
    return target_teams, kids


def _apply_discounts_and_fees(
    gross: float, assumptions: Assumptions, kids: int
) -> tuple[float, float, float]:
    """Return (discounts, processing_fees, net_revenue)."""
    # Sibling discount heuristic: assume ~25% of kids are siblings getting the sibling rate
    sibling_rate = assumptions.pricing.sibling_discount_rate
    discounts = gross * 0.25 * sibling_rate
    processing = (gross - discounts) * assumptions.pricing.payment_processing_rate + \
                 assumptions.pricing.payment_processing_flat * kids
    net = gross - discounts - processing
    return discounts, processing, net


def compute_season_revenue(
    assumptions: Assumptions,
    sport: Sport,
    season: Season,
    season_year: int,
) -> Year1RevenueLine:
    """Compute a single season×sport revenue line."""
    if sport == "winter_skills":
        groups = assumptions.pricing.winter_skills_sessions_per_week
        kids = int(groups * assumptions.pricing.winter_skills_group_size *
                   assumptions.demand.winter_skills_fill_rate.base)
        # Winter runs 12 weeks × sessions_per_week × group_size × price_per_session
        sessions_in_season = 12 * groups
        price_per_seat = assumptions.pricing.winter_skills_price_per_session.base
        # Gross = kid-sessions × price; but we express as kids × (sessions_in_season/groups) × price for clarity
        gross = kids * 12 * price_per_seat
        teams = groups
    else:
        teams, kids = _league_kids(assumptions, sport, season)
        price = (assumptions.pricing.soccer_price.base if sport == "soccer"
                 else assumptions.pricing.flag_price.base)
        gross = kids * price

    discounts, processing, net = _apply_discounts_and_fees(gross, assumptions, kids)
    cash_month = registration_month_for_season(season, season_year)

    return Year1RevenueLine(
        sport=sport,
        season=season,
        season_year=season_year,
        teams_or_groups=teams,
        kids_registered=kids,
        gross_revenue=gross,
        discounts=discounts,
        processing_fees=processing,
        net_revenue=net,
        cash_month=cash_month,
    )


def build_year1_revenue(assumptions: Assumptions) -> List[Year1RevenueLine]:
    """Build all Year 1 revenue lines: Fall 2026, Winter 2026, Spring 2027."""
    return [
        compute_season_revenue(assumptions, "soccer", "fall", 2026),
        compute_season_revenue(assumptions, "flag", "fall", 2026),
        compute_season_revenue(assumptions, "winter_skills", "winter", 2026),
        compute_season_revenue(assumptions, "soccer", "spring", 2027),
        compute_season_revenue(assumptions, "flag", "spring", 2027),
    ]
