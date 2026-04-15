from pathlib import Path
from engine.schema import (
    LowBaseHigh,
    SportConfig,
    TravelConfig,
    LocationConfig,
    ExpansionConfig,
    Assumptions,
    load_assumptions,
)


def test_lowbasehigh_holds_three_numbers():
    lbh = LowBaseHigh(low=1, base=2, high=3)
    assert lbh.low == 1 and lbh.base == 2 and lbh.high == 3


def test_lowbasehigh_rejects_low_greater_than_base():
    import pytest
    with pytest.raises(ValueError):
        LowBaseHigh(low=3, base=2, high=4)


def test_sport_config_parses_soccer():
    sport = SportConfig(
        name="soccer",
        launch_year=2026,
        price={"low": 195, "base": 215, "high": 240},
        weeks_per_season=8,
        hours_per_unit=2,
        units_per_week=1,
        roster_size=12,
        venue_type="outdoor_field",
        seasons=["fall", "spring"],
        target_teams_y1={"U8": 4, "U10": 3, "U12": 2},
        fill_rate={"low": 0.50, "base": 0.65, "high": 0.80},
        s1_to_s2={"low": 0.65, "base": 0.80, "high": 0.90},
        s2_to_s3={"low": 0.82, "base": 0.92, "high": 0.96},
        s3_plus={"low": 0.88, "base": 0.94, "high": 0.97},
    )
    assert sport.name == "soccer"
    assert sport.price.base == 215
    assert sum(sport.target_teams_y1.values()) == 9


def test_travel_config_parses():
    t = TravelConfig(
        launch_year=2028,
        target_teams_direct_y1={"U9": 1, "U11": 1, "U13": 1},
        travel_roster_size=11,
        direct_fill_rate={"low": 0.50, "base": 0.65, "high": 0.80},
        rec_to_travel_upgrade_rate={"low": 0.03, "base": 0.06, "high": 0.12},
        travel_price={"low": 850, "base": 1100, "high": 1400},
        travel_weeks_per_season=12,
        travel_coach_hourly_premium=1.4,
        travel_s1_to_s2={"low": 0.75, "base": 0.88, "high": 0.94},
        travel_s2_to_s3={"low": 0.85, "base": 0.93, "high": 0.97},
        travel_s3_plus={"low": 0.90, "base": 0.95, "high": 0.98},
    )
    assert t.launch_year == 2028
    assert t.travel_price.base == 1100


def test_location_config_parses_monotonic():
    loc = LocationConfig(
        by_year={2026: 1, 2027: 1, 2028: 2, 2029: 2, 2030: 3},
        new_location_fill_rate_boost={"low": 0.0, "base": 0.05, "high": 0.12},
        tam_per_location=10500,
    )
    assert loc.by_year[2030] == 3
    assert loc.tam_per_location == 10500


def test_location_config_rejects_non_monotonic():
    import pytest
    with pytest.raises(ValueError):
        LocationConfig(
            by_year={2026: 2, 2027: 1},
            new_location_fill_rate_boost={"low": 0, "base": 0, "high": 0},
        )


def test_load_assumptions_from_base_case_yaml():
    """The committed base-case YAML must load and match Plan 1 baseline values.
    Single location default, travel disabled (launch_year far in future),
    three sports (soccer, flag, winter_skills)."""
    yaml_path = Path(__file__).parent.parent / "assumptions.yaml"
    a = load_assumptions(yaml_path)

    assert len(a.sports) == 3
    sport_names = {s.name for s in a.sports}
    assert sport_names == {"soccer", "flag", "winter_skills"}

    soccer = next(s for s in a.sports if s.name == "soccer")
    assert soccer.price.base == 215
    assert soccer.roster_size == 12
    assert soccer.fill_rate.base == 0.65
    assert soccer.s1_to_s2.base == 0.80
    assert soccer.venue_type == "outdoor_field"
    assert "fall" in soccer.seasons and "spring" in soccer.seasons
    assert sum(soccer.target_teams_y1.values()) == 9

    winter = next(s for s in a.sports if s.name == "winter_skills")
    assert winter.venue_type == "indoor_turf_half"
    assert winter.weeks_per_season == 12
    assert winter.roster_size == 8
    assert winter.price.base == 300

    # Aggressive expansion config for pitch (not single-location anymore)
    assert a.expansion.locations.by_year[2026] == 1
    assert a.expansion.locations.by_year[2030] >= 5

    assert a.expansion.travel is not None
    assert a.expansion.travel.launch_year == 2027

    assert a.merchandise is not None
    assert a.merchandise.net_contribution_per_kid_per_season.base == 40

    assert a.costs.head_coach_hourly.base == 32
    assert a.costs.insurance_monthly == 100
    assert a.capital.contribution_per_founder == 50000
    assert a.horizon_months == 60
