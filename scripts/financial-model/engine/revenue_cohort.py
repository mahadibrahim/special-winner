from dataclasses import dataclass, field
from datetime import date
from typing import List
from engine.schema import Assumptions
from engine.calendar import registration_month_for_season, Season
from engine.revenue_year1 import Year1RevenueLine


@dataclass
class Cohort:
    origin_season_index: int
    size: int


@dataclass
class CohortRevenueLine:
    sport: str
    season: Season
    season_year: int
    kids_registered: int
    gross_revenue: float
    net_revenue: float
    cash_month: date


def apply_retention(cohort: Cohort, rate: float) -> Cohort:
    """Return a new cohort with size = int(size × rate). Origin index preserved."""
    return Cohort(
        origin_season_index=cohort.origin_season_index,
        size=int(cohort.size * rate),
    )


def _retention_for_season_age(a: Assumptions, sport: str, seasons_since_origin: int) -> float:
    """Return the retention rate to apply for moving a cohort from season N to N+1."""
    if sport == "soccer":
        if seasons_since_origin == 1:
            return a.retention.soccer_s1_to_s2.base
        if seasons_since_origin == 2:
            return a.retention.soccer_s2_to_s3.base
        return a.retention.soccer_s3_plus.base
    if sport == "flag":
        if seasons_since_origin == 1:
            return a.retention.flag_s1_to_s2.base
        if seasons_since_origin == 2:
            return a.retention.flag_s2_to_s3.base
        return a.retention.flag_s3_plus.base
    return a.retention.winter_skills_retention.base


def _season_sequence_after_year1() -> List[tuple[Season, int]]:
    """Return the (season, year) tuples for Years 2-5 (Fall 2027 → Spring 2031)."""
    result = []
    for year in range(2027, 2031):  # 2027..2030
        result.append(("fall", year))
        result.append(("winter", year))
        result.append(("spring", year + 1))
    return result


def build_cohort_revenue(
    a: Assumptions,
    year1_lines: List[Year1RevenueLine],
) -> List[CohortRevenueLine]:
    """Build Years 2-5 revenue lines using cohort retention.

    Simplified model: each sport has a single pooled cohort starting from Year 1 sizes.
    Each season the cohort shrinks by the appropriate retention factor, then a new
    acquisition cohort is added sized as (prior_year_same_season × referral_multiplier
    + fresh_acquisition_growth). For v1 we combine retention and referral into a single
    net rate: effective_rate = retention × referral_multiplier.
    """
    lines: List[CohortRevenueLine] = []

    # Starting cohort sizes by sport from Year 1 combined totals
    y1_soccer = sum(l.kids_registered for l in year1_lines if l.sport == "soccer")
    y1_flag = sum(l.kids_registered for l in year1_lines if l.sport == "flag")

    soccer_size = y1_soccer
    flag_size = y1_flag
    ref_mult = a.retention.referral_multiplier.base

    season_sequence = _season_sequence_after_year1()
    for idx, (season, season_year) in enumerate(season_sequence):
        # Skip winter for league lines (soccer/flag) — they only run fall+spring
        if season == "winter":
            # Build a single winter_skills line sized off current soccer+flag pool × cross_sell
            winter_kids = int((soccer_size + flag_size) * a.retention.cross_sell_rate.base)
            winter_price = a.pricing.winter_skills_price_per_session.base * 12  # 12 sessions
            winter_gross = winter_kids * winter_price
            winter_net = winter_gross * 0.94  # rough discount + processing
            lines.append(CohortRevenueLine(
                sport="winter_skills",
                season=season,
                season_year=season_year,
                kids_registered=winter_kids,
                gross_revenue=winter_gross,
                net_revenue=winter_net,
                cash_month=registration_month_for_season(season, season_year),
            ))
            continue

        # Apply retention to both sports
        seasons_since_origin = (idx // 3) + 2  # rough mapping
        soccer_rate = _retention_for_season_age(a, "soccer", seasons_since_origin)
        flag_rate = _retention_for_season_age(a, "flag", seasons_since_origin)

        soccer_size = int(soccer_size * soccer_rate * ref_mult)
        flag_size = int(flag_size * flag_rate * ref_mult)

        # Soccer line
        soccer_gross = soccer_size * a.pricing.soccer_price.base
        soccer_net = soccer_gross * 0.94
        lines.append(CohortRevenueLine(
            sport="soccer",
            season=season,
            season_year=season_year,
            kids_registered=soccer_size,
            gross_revenue=soccer_gross,
            net_revenue=soccer_net,
            cash_month=registration_month_for_season(season, season_year),
        ))

        # Flag line
        flag_gross = flag_size * a.pricing.flag_price.base
        flag_net = flag_gross * 0.94
        lines.append(CohortRevenueLine(
            sport="flag",
            season=season,
            season_year=season_year,
            kids_registered=flag_size,
            gross_revenue=flag_gross,
            net_revenue=flag_net,
            cash_month=registration_month_for_season(season, season_year),
        ))

    return lines
