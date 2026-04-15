from datetime import date
from pathlib import Path
from engine.schema import load_assumptions
from engine.calendar import month_sequence, parse_year_month
from engine.revenue_year1 import build_year1_revenue
from engine.revenue_cohort import build_cohort_revenue_for_location
from engine.costs import (
    compute_variable_costs_for_line,
    compute_variable_costs_for_travel_line,
    compute_monthly_fixed_costs,
    build_cost_schedule,
)


def test_variable_costs_soccer_fall_uses_venue_routing():
    a = load_assumptions(Path("assumptions.yaml"))
    soccer = next(s for s in a.sports if s.name == "soccer")
    lines = build_year1_revenue(a, location_id=0, location_launch_year=2026)
    soccer_fall_line = next(l for l in lines if l.sport == "soccer" and l.season == "fall" and l.age_band == "U8")
    vc = compute_variable_costs_for_line(a, soccer_fall_line, soccer)
    assert vc["coach_cost"] > 0
    assert vc["venue_cost"] > 0
    # 4 teams × 1 game/wk × 2 hrs × 8 weeks = 64 coach-hours
    # Coach: 64 × $32 = $2,048
    # Venue: 64 × $35 = $2,240
    assert vc["coach_cost"] == 4 * 1 * 2 * 8 * 32
    assert vc["venue_cost"] == 4 * 1 * 2 * 8 * 35


def test_variable_costs_winter_skills_uses_indoor_turf_half():
    a = load_assumptions(Path("assumptions.yaml"))
    ws = next(s for s in a.sports if s.name == "winter_skills")
    lines = build_year1_revenue(a, location_id=0, location_launch_year=2026)
    ws_line = next(l for l in lines if l.sport == "winter_skills")
    vc = compute_variable_costs_for_line(a, ws_line, ws)
    # 12 teams × 1 session/wk × 1 hour × 12 weeks = 144 coach-hours
    assert vc["coach_cost"] == 12 * 1 * 1 * 12 * 32
    assert vc["venue_cost"] == 12 * 1 * 1 * 12 * 95


def test_variable_costs_for_travel_line_applies_premium():
    a = load_assumptions(Path("assumptions.yaml"))
    from engine.revenue_travel import TravelRevenueLine
    tline = TravelRevenueLine(
        sport="travel", season="fall", season_year=2028, location_id=0,
        kids_registered=22, gross_revenue=22 * 1100, net_revenue=22 * 1100 * 0.94,
        cash_month=date(2028, 7, 1), origin_channel="direct",
    )
    vc = compute_variable_costs_for_travel_line(a, tline)
    assert vc["coach_cost"] > 0
    assert vc["venue_cost"] > 0


def test_monthly_fixed_costs_include_all_line_items():
    a = load_assumptions(Path("assumptions.yaml"))
    fc = compute_monthly_fixed_costs(a)
    expected = (
        a.costs.software_monthly
        + a.costs.insurance_monthly
        + a.costs.bookkeeping_monthly
        + (a.costs.founder_time_annual_per_founder / 12) * a.costs.num_founders
        + a.costs.curriculum_dev_one_time / a.costs.curriculum_amortization_months
    )
    assert abs(fc["total_expense"] - expected) < 0.01


def test_build_cost_schedule_returns_monthly_rows_for_full_horizon():
    a = load_assumptions(Path("assumptions.yaml"))
    schedule = build_cost_schedule(a)
    assert len(schedule) == a.horizon_months
    assert schedule[0].month == parse_year_month(a.start_month)
    curriculum_cash_months = [r for r in schedule if r.cash_curriculum > 0]
    assert len(curriculum_cash_months) == 1
    curriculum_expense_months = [r for r in schedule if r.expense_curriculum > 0]
    assert len(curriculum_expense_months) == 36
