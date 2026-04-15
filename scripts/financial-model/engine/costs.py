from dataclasses import dataclass
from datetime import date
from typing import Dict, List
from engine.schema import Assumptions, SportConfig
from engine.calendar import parse_year_month, month_sequence
from engine.revenue_year1 import Year1RevenueLine
from engine.revenue_cohort import CohortRevenueLine
from engine.revenue_travel import TravelRevenueLine


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
    storage: float = 0.0
    # curriculum is split: cash hits month 1, expense amortized
    cash_curriculum: float = 0.0
    expense_curriculum: float = 0.0

    @property
    def total_variable(self) -> float:
        return self.coach_cost + self.venue_cost + self.uniform_cost

    @property
    def total_fixed_expense(self) -> float:
        return (self.software + self.insurance + self.bookkeeping
                + self.founder_time + self.marketing + self.storage
                + self.expense_curriculum)

    @property
    def total_expense(self) -> float:
        return self.total_variable + self.total_fixed_expense

    @property
    def total_cash_out(self) -> float:
        return (self.total_variable + self.software + self.insurance
                + self.bookkeeping + self.founder_time + self.marketing
                + self.storage + self.cash_curriculum)


def _venue_hourly(a: Assumptions, venue_type: str) -> float:
    """Map a venue_type string to the corresponding hourly rate on Costs."""
    field_name = f"{venue_type}_hourly"
    return getattr(a.costs, field_name).base


def compute_variable_costs_for_line(
    a: Assumptions,
    line,
    sport: SportConfig,
) -> Dict[str, float]:
    """Generic variable cost: coach + venue + uniform for one revenue line."""
    if hasattr(line, "teams") and line.teams:
        teams = line.teams
    else:
        teams = max(1, round(line.kids_registered / sport.roster_size))

    coach_hours = teams * sport.units_per_week * sport.hours_per_unit * sport.weeks_per_season
    coach_cost = coach_hours * a.costs.head_coach_hourly.base
    venue_cost = coach_hours * _venue_hourly(a, sport.venue_type)
    uniform_cost = a.pricing.uniform_fee * line.kids_registered
    return {
        "coach_cost": coach_cost,
        "venue_cost": venue_cost,
        "uniform_cost": uniform_cost,
        "total": coach_cost + venue_cost + uniform_cost,
    }


def compute_variable_costs_for_travel_line(
    a: Assumptions,
    line: TravelRevenueLine,
) -> Dict[str, float]:
    """Travel variable cost with premium coach rate multiplier."""
    travel = a.expansion.travel
    if travel is None:
        return {"coach_cost": 0, "venue_cost": 0, "uniform_cost": 0, "total": 0}

    teams = max(1, round(line.kids_registered / travel.travel_roster_size))
    coach_hours = teams * 1 * 2 * travel.travel_weeks_per_season
    premium_rate = a.costs.head_coach_hourly.base * travel.travel_coach_hourly_premium
    coach_cost = coach_hours * premium_rate
    venue_cost = coach_hours * a.costs.outdoor_field_hourly.base
    uniform_cost = 0.0
    return {
        "coach_cost": coach_cost,
        "venue_cost": venue_cost,
        "uniform_cost": uniform_cost,
        "total": coach_cost + venue_cost + uniform_cost,
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

    by_year = a.expansion.locations.by_year
    marketing_per_loc = a.costs.marketing_monthly_per_location
    storage = a.costs.storage_monthly

    for row in rows:
        row.software = fc["software"]
        row.insurance = fc["insurance"]
        row.bookkeeping = fc["bookkeeping"]
        row.founder_time = fc["founder_time"]
        # Marketing scales with active locations in that calendar year
        active_locs = by_year.get(row.month.year, max(by_year.values()) if by_year else 1)
        row.marketing = marketing_per_loc * active_locs
        row.storage = storage

    # Curriculum: cash out in month 1 (index 0), expense amortized over N months
    rows[0].cash_curriculum = a.costs.curriculum_dev_one_time
    for i in range(min(a.costs.curriculum_amortization_months, len(rows))):
        rows[i].expense_curriculum = fc["curriculum_expense"]

    return rows
