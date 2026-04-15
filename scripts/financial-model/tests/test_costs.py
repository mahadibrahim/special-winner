from datetime import date
from pathlib import Path
from engine.schema import load_assumptions
from engine.calendar import month_sequence, parse_year_month
from engine.revenue_year1 import build_year1_revenue
from engine.costs import (
    compute_variable_costs_for_line,
    compute_monthly_fixed_costs,
    build_cost_schedule,
)


def test_variable_costs_soccer_fall_2026_have_coach_and_field_components():
    a = load_assumptions(Path("assumptions.yaml"))
    lines = build_year1_revenue(a)
    soccer_fall = next(l for l in lines if l.sport == "soccer" and l.season == "fall")
    vc = compute_variable_costs_for_line(a, soccer_fall)
    assert vc["coach_cost"] > 0
    assert vc["venue_cost"] > 0
    assert vc["uniform_cost"] >= 0  # may be 0 in base case
    assert vc["total"] == vc["coach_cost"] + vc["venue_cost"] + vc["uniform_cost"]


def test_variable_coach_cost_uses_head_coach_hourly():
    """Coach hours for soccer = teams × games_per_week × 2 hours/game × weeks."""
    a = load_assumptions(Path("assumptions.yaml"))
    lines = build_year1_revenue(a)
    soccer_fall = next(l for l in lines if l.sport == "soccer" and l.season == "fall")
    vc = compute_variable_costs_for_line(a, soccer_fall)
    # teams = 9, 1 game/wk × 2 hrs × 8 weeks = 144 coach hours × $22 = $3,168
    assert vc["coach_cost"] == 9 * 1 * 2 * 8 * 22


def test_monthly_fixed_costs_include_all_line_items():
    a = load_assumptions(Path("assumptions.yaml"))
    fc = compute_monthly_fixed_costs(a)
    # software + insurance + bookkeeping + founder_time/12 × 2 + curriculum/36
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
    # cash outflow for curriculum hits month 1 only
    curriculum_cash_months = [r for r in schedule if r.cash_curriculum > 0]
    assert len(curriculum_cash_months) == 1
    # but expense is spread over 36 months
    curriculum_expense_months = [r for r in schedule if r.expense_curriculum > 0]
    assert len(curriculum_expense_months) == 36
