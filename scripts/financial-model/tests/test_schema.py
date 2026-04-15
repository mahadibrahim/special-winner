import pytest
from pydantic import ValidationError
from engine.schema import LowBaseHigh, Pricing, Demand


def test_lowbasehigh_holds_three_numbers():
    lbh = LowBaseHigh(low=100, base=175, high=225)
    assert lbh.low == 100
    assert lbh.base == 175
    assert lbh.high == 225


def test_lowbasehigh_rejects_low_greater_than_base():
    with pytest.raises(ValidationError):
        LowBaseHigh(low=200, base=175, high=225)


def test_pricing_parses_soccer_and_flag():
    p = Pricing(
        soccer_price=LowBaseHigh(low=150, base=175, high=200),
        soccer_weeks_per_season=8,
        soccer_seasons_per_year=2,
        soccer_roster_size=12,
        flag_price=LowBaseHigh(low=150, base=175, high=200),
        flag_weeks_per_season=7,
        flag_seasons_per_year=2,
        flag_roster_size=10,
        winter_skills_price_per_session=LowBaseHigh(low=20, base=25, high=35),
        winter_skills_group_size=8,
        winter_skills_sessions_per_week=12,
        family_discount_rate=0.0,
        sibling_discount_rate=0.10,
        uniform_fee=0,
        payment_processing_rate=0.029,
        payment_processing_flat=0.30,
    )
    assert p.soccer_price.base == 175
    assert p.flag_roster_size == 10


def test_demand_parses_fill_rates():
    d = Demand(
        soccer_fill_rate=LowBaseHigh(low=0.60, base=0.75, high=0.90),
        flag_fill_rate=LowBaseHigh(low=0.60, base=0.75, high=0.90),
        winter_skills_fill_rate=LowBaseHigh(low=0.60, base=0.80, high=0.95),
        target_teams_soccer_y1_fall={"U8": 4, "U10": 3, "U12": 2},
        target_teams_flag_y1_fall={"K-2": 3, "3-4": 3, "5-6": 2},
        season_growth_rate=LowBaseHigh(low=0.10, base=0.25, high=0.50),
    )
    assert d.target_teams_soccer_y1_fall["U8"] == 4
    assert d.soccer_fill_rate.base == 0.75
