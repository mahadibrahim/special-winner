import pytest
from pydantic import ValidationError
from engine.schema import LowBaseHigh, Pricing, Demand, Retention, Acquisition, Costs, Capital, Assumptions


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


def test_retention_parses_curves():
    r = Retention(
        soccer_s1_to_s2=LowBaseHigh(low=0.55, base=0.70, high=0.82),
        soccer_s2_to_s3=LowBaseHigh(low=0.75, base=0.85, high=0.92),
        soccer_s3_plus=LowBaseHigh(low=0.82, base=0.90, high=0.95),
        flag_s1_to_s2=LowBaseHigh(low=0.55, base=0.70, high=0.82),
        flag_s2_to_s3=LowBaseHigh(low=0.75, base=0.85, high=0.92),
        flag_s3_plus=LowBaseHigh(low=0.82, base=0.90, high=0.95),
        winter_skills_retention=LowBaseHigh(low=0.50, base=0.65, high=0.80),
        cross_sell_rate=LowBaseHigh(low=0.15, base=0.25, high=0.40),
        referral_multiplier=LowBaseHigh(low=1.05, base=1.20, high=1.40),
    )
    assert r.soccer_s1_to_s2.base == 0.70


def test_acquisition_channel_shares_must_sum_to_one():
    with pytest.raises(ValidationError):
        Acquisition(
            channels_y1={"partner_network": 0.35, "schools": 0.30, "paid_digital": 0.10},
            channels_y2={"partner_network": 0.25, "schools": 0.30, "paid_digital": 0.15, "referrals": 0.30},
            channels_y3_plus={"partner_network": 0.10, "schools": 0.30, "paid_digital": 0.10, "referrals": 0.50},
            cac_by_channel={"partner_network": 5, "schools": 12, "paid_digital": 50, "referrals": 5},
            blended_cac_y1=LowBaseHigh(low=12, base=18, high=30),
            blended_cac_y2=LowBaseHigh(low=8, base=12, high=20),
            blended_cac_y3_plus=LowBaseHigh(low=5, base=8, high=14),
        )


def test_costs_parses_hourly_rates():
    c = Costs(
        head_coach_hourly=LowBaseHigh(low=18, base=22, high=28),
        assistant_coach_hourly=LowBaseHigh(low=13, base=16, high=20),
        outdoor_field_hourly=LowBaseHigh(low=25, base=35, high=60),
        indoor_turf_full_hourly=LowBaseHigh(low=135, base=175, high=220),
        indoor_turf_half_hourly=LowBaseHigh(low=75, base=95, high=125),
        gym_hourly=LowBaseHigh(low=60, base=70, high=95),
        software_monthly=350,
        insurance_monthly=400,
        bookkeeping_monthly=250,
        founder_time_annual_per_founder=80000,
        num_founders=2,
        curriculum_dev_one_time=30000,
        curriculum_amortization_months=36,
    )
    assert c.head_coach_hourly.base == 22
    assert c.num_founders == 2


def test_capital_parses_contributions():
    cap = Capital(
        contribution_per_founder=50000,
        contribution_month=1,
        working_capital_reserve_floor=15000,
        distribution_policy="return_capital_then_split",
        equity_split={"founder_a": 0.50, "founder_b": 0.50},
    )
    assert cap.contribution_per_founder == 50000
    assert cap.equity_split["founder_a"] == 0.50


def test_top_level_assumptions_holds_all_six_groups():
    a = Assumptions(
        pricing=Pricing(
            soccer_price=LowBaseHigh(low=150, base=175, high=200),
            soccer_weeks_per_season=8, soccer_seasons_per_year=2, soccer_roster_size=12,
            flag_price=LowBaseHigh(low=150, base=175, high=200),
            flag_weeks_per_season=7, flag_seasons_per_year=2, flag_roster_size=10,
            winter_skills_price_per_session=LowBaseHigh(low=20, base=25, high=35),
            winter_skills_group_size=8, winter_skills_sessions_per_week=12,
            family_discount_rate=0.0, sibling_discount_rate=0.10,
            uniform_fee=0, payment_processing_rate=0.029, payment_processing_flat=0.30,
        ),
        demand=Demand(
            soccer_fill_rate=LowBaseHigh(low=0.60, base=0.75, high=0.90),
            flag_fill_rate=LowBaseHigh(low=0.60, base=0.75, high=0.90),
            winter_skills_fill_rate=LowBaseHigh(low=0.60, base=0.80, high=0.95),
            target_teams_soccer_y1_fall={"U8": 4, "U10": 3, "U12": 2},
            target_teams_flag_y1_fall={"K-2": 3, "3-4": 3, "5-6": 2},
            season_growth_rate=LowBaseHigh(low=0.10, base=0.25, high=0.50),
        ),
        retention=Retention(
            soccer_s1_to_s2=LowBaseHigh(low=0.55, base=0.70, high=0.82),
            soccer_s2_to_s3=LowBaseHigh(low=0.75, base=0.85, high=0.92),
            soccer_s3_plus=LowBaseHigh(low=0.82, base=0.90, high=0.95),
            flag_s1_to_s2=LowBaseHigh(low=0.55, base=0.70, high=0.82),
            flag_s2_to_s3=LowBaseHigh(low=0.75, base=0.85, high=0.92),
            flag_s3_plus=LowBaseHigh(low=0.82, base=0.90, high=0.95),
            winter_skills_retention=LowBaseHigh(low=0.50, base=0.65, high=0.80),
            cross_sell_rate=LowBaseHigh(low=0.15, base=0.25, high=0.40),
            referral_multiplier=LowBaseHigh(low=1.05, base=1.20, high=1.40),
        ),
        acquisition=Acquisition(
            channels_y1={"partner_network": 0.35, "schools": 0.30, "micro_influencer": 0.15,
                         "community_event": 0.10, "paid_digital": 0.10},
            channels_y2={"partner_network": 0.20, "schools": 0.25, "micro_influencer": 0.10,
                         "community_event": 0.10, "paid_digital": 0.10, "referrals": 0.25},
            channels_y3_plus={"partner_network": 0.10, "schools": 0.20, "micro_influencer": 0.10,
                              "community_event": 0.10, "paid_digital": 0.10, "referrals": 0.40},
            cac_by_channel={"partner_network": 5, "schools": 12, "micro_influencer": 5,
                            "community_event": 20, "paid_digital": 50, "referrals": 5},
            blended_cac_y1=LowBaseHigh(low=12, base=18, high=30),
            blended_cac_y2=LowBaseHigh(low=8, base=12, high=20),
            blended_cac_y3_plus=LowBaseHigh(low=5, base=8, high=14),
        ),
        costs=Costs(
            head_coach_hourly=LowBaseHigh(low=18, base=22, high=28),
            assistant_coach_hourly=LowBaseHigh(low=13, base=16, high=20),
            outdoor_field_hourly=LowBaseHigh(low=25, base=35, high=60),
            indoor_turf_full_hourly=LowBaseHigh(low=135, base=175, high=220),
            indoor_turf_half_hourly=LowBaseHigh(low=75, base=95, high=125),
            gym_hourly=LowBaseHigh(low=60, base=70, high=95),
            software_monthly=350, insurance_monthly=400, bookkeeping_monthly=250,
            founder_time_annual_per_founder=80000, num_founders=2,
            curriculum_dev_one_time=30000, curriculum_amortization_months=36,
        ),
        capital=Capital(
            contribution_per_founder=50000, contribution_month=1,
            working_capital_reserve_floor=15000,
            distribution_policy="return_capital_then_split",
            equity_split={"founder_a": 0.50, "founder_b": 0.50},
        ),
        start_month="2026-07",
        horizon_months=60,
    )
    assert a.pricing.soccer_price.base == 175
    assert a.horizon_months == 60


from pathlib import Path
from engine.schema import load_assumptions


def test_load_assumptions_from_base_case_yaml():
    """The committed base-case YAML must load and match values from the spec."""
    yaml_path = Path(__file__).parent.parent / "assumptions.yaml"
    a = load_assumptions(yaml_path)
    assert a.pricing.soccer_price.base == 215
    assert a.pricing.flag_price.base == 215
    assert a.pricing.soccer_weeks_per_season == 8
    assert a.pricing.flag_weeks_per_season == 7
    assert a.pricing.winter_skills_price_per_session.base == 25
    assert a.costs.head_coach_hourly.base == 32
    assert a.costs.indoor_turf_full_hourly.base == 175
    assert a.costs.gym_hourly.base == 70
    assert a.retention.soccer_s1_to_s2.base == 0.80
    assert a.retention.soccer_s2_to_s3.base == 0.92
    assert a.retention.soccer_s3_plus.base == 0.94
    assert a.acquisition.blended_cac_y1.base == 40
    assert a.capital.equity_split == {"founder_a": 0.50, "founder_b": 0.50}
    assert a.horizon_months == 60
