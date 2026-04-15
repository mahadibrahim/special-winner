from dataclasses import dataclass
from datetime import date
from typing import Dict, List
from engine.schema import Assumptions
from engine.calendar import parse_year_month, month_sequence
from engine.revenue_year1 import Year1RevenueLine
from engine.revenue_cohort import CohortRevenueLine


@dataclass
class CostScheduleRow:
    month: date
    # variable (revenue-driven)
    coach_cost: float = 0.0
    venue_cost: float = 0.0
    uniform_cost: float = 0.0
    # fixed
    software: float = 0.0
    insurance: float = 0.0
    bookkeeping: float = 0.0
    founder_time: float = 0.0
    marketing: float = 0.0
    # curriculum is split: cash hits month 1, expense amortized
    cash_curriculum: float = 0.0
    expense_curriculum: float = 0.0

    @property
    def total_variable(self) -> float:
        return self.coach_cost + self.venue_cost + self.uniform_cost

    @property
    def total_fixed_expense(self) -> float:
        return (self.software + self.insurance + self.bookkeeping
                + self.founder_time + self.marketing + self.expense_curriculum)

    @property
    def total_expense(self) -> float:
        return self.total_variable + self.total_fixed_expense

    @property
    def total_cash_out(self) -> float:
        return (self.total_variable + self.software + self.insurance
                + self.bookkeeping + self.founder_time + self.marketing
                + self.cash_curriculum)


def compute_variable_costs_for_line(a: Assumptions, line: Year1RevenueLine) -> Dict[str, float]:
    """Coach + venue + uniform cost for a single revenue line."""
    if line.sport == "soccer":
        weeks = a.pricing.soccer_weeks_per_season
        hours_per_game = 2
        games_per_week = 1
        coach_hours = line.teams_or_groups * games_per_week * hours_per_game * weeks
        coach_cost = coach_hours * a.costs.head_coach_hourly.base
        # Venue: outdoor in fall/spring; indoor turf in winter (N/A for soccer here)
        venue_hours = coach_hours  # same grid hours as coaching
        venue_cost = venue_hours * a.costs.outdoor_field_hourly.base
    elif line.sport == "flag":
        weeks = a.pricing.flag_weeks_per_season
        hours_per_game = 1.5
        games_per_week = 1
        coach_hours = line.teams_or_groups * games_per_week * hours_per_game * weeks
        coach_cost = coach_hours * a.costs.head_coach_hourly.base
        venue_hours = coach_hours
        venue_cost = venue_hours * a.costs.outdoor_field_hourly.base
    elif line.sport == "winter_skills":
        # Sessions_per_week × 12 weeks × 1 hour × head coach rate
        sessions_total = a.pricing.winter_skills_sessions_per_week * 12
        coach_cost = sessions_total * a.costs.head_coach_hourly.base
        # Venue: indoor turf half-field for each session
        venue_cost = sessions_total * a.costs.indoor_turf_half_hourly.base
    else:
        coach_cost = venue_cost = 0

    uniform_cost = a.pricing.uniform_fee * line.kids_registered
    total = coach_cost + venue_cost + uniform_cost
    return {
        "coach_cost": coach_cost,
        "venue_cost": venue_cost,
        "uniform_cost": uniform_cost,
        "total": total,
    }


def compute_variable_costs_for_cohort_line(
    a: Assumptions, line: CohortRevenueLine
) -> Dict[str, float]:
    """Variable cost for a cohort (Y2-5) revenue line. CohortRevenueLine doesn't
    carry a team count, so we derive one from kids_registered / roster_size."""
    if line.sport == "soccer":
        teams = max(1, round(line.kids_registered / a.pricing.soccer_roster_size))
        weeks = a.pricing.soccer_weeks_per_season
        coach_hours = teams * 1 * 2 * weeks
        coach_cost = coach_hours * a.costs.head_coach_hourly.base
        venue_cost = coach_hours * a.costs.outdoor_field_hourly.base
    elif line.sport == "flag":
        teams = max(1, round(line.kids_registered / a.pricing.flag_roster_size))
        weeks = a.pricing.flag_weeks_per_season
        coach_hours = teams * 1 * 1.5 * weeks
        coach_cost = coach_hours * a.costs.head_coach_hourly.base
        venue_cost = coach_hours * a.costs.outdoor_field_hourly.base
    elif line.sport == "winter_skills":
        sessions_total = a.pricing.winter_skills_sessions_per_week * 12
        coach_cost = sessions_total * a.costs.head_coach_hourly.base
        venue_cost = sessions_total * a.costs.indoor_turf_half_hourly.base
    else:
        coach_cost = venue_cost = 0

    uniform_cost = a.pricing.uniform_fee * line.kids_registered
    total = coach_cost + venue_cost + uniform_cost
    return {
        "coach_cost": coach_cost,
        "venue_cost": venue_cost,
        "uniform_cost": uniform_cost,
        "total": total,
    }


def compute_monthly_fixed_costs(a: Assumptions) -> Dict[str, float]:
    """Return the monthly recurring fixed expense breakdown."""
    founder_monthly = (a.costs.founder_time_annual_per_founder / 12) * a.costs.num_founders
    curriculum_monthly = a.costs.curriculum_dev_one_time / a.costs.curriculum_amortization_months
    total = (a.costs.software_monthly + a.costs.insurance_monthly
             + a.costs.bookkeeping_monthly + founder_monthly + curriculum_monthly)
    return {
        "software": a.costs.software_monthly,
        "insurance": a.costs.insurance_monthly,
        "bookkeeping": a.costs.bookkeeping_monthly,
        "founder_time": founder_monthly,
        "curriculum_expense": curriculum_monthly,
        "total_expense": total,
    }


def build_cost_schedule(a: Assumptions) -> List[CostScheduleRow]:
    """Build a monthly cost schedule over the full horizon.
    Variable costs are allocated to the months the programs actually run.
    Fixed costs repeat every month.
    Curriculum cash hits month 1; expense is amortized over curriculum_amortization_months.
    """
    start = parse_year_month(a.start_month)
    months = month_sequence(start, a.horizon_months)
    rows = [CostScheduleRow(month=m) for m in months]
    fc = compute_monthly_fixed_costs(a)

    for row in rows:
        row.software = fc["software"]
        row.insurance = fc["insurance"]
        row.bookkeeping = fc["bookkeeping"]
        row.founder_time = fc["founder_time"]

    # Curriculum: cash out in month 1 (index 0), expense amortized over N months
    rows[0].cash_curriculum = a.costs.curriculum_dev_one_time
    for i in range(min(a.costs.curriculum_amortization_months, len(rows))):
        rows[i].expense_curriculum = fc["curriculum_expense"]

    return rows
