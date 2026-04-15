from pydantic import BaseModel, Field, model_validator
from typing import Dict, Literal


class LowBaseHigh(BaseModel):
    """A three-column assumption: low / base / high.
    base drives the main model; low/high feed sensitivity analysis."""
    low: float
    base: float
    high: float

    @model_validator(mode="after")
    def check_ordering(self) -> "LowBaseHigh":
        if not (self.low <= self.base <= self.high):
            raise ValueError(
                f"LowBaseHigh requires low ({self.low}) <= base ({self.base}) <= high ({self.high})"
            )
        return self


class Pricing(BaseModel):
    soccer_price: LowBaseHigh
    soccer_weeks_per_season: int
    soccer_seasons_per_year: int
    soccer_roster_size: int

    flag_price: LowBaseHigh
    flag_weeks_per_season: int
    flag_seasons_per_year: int
    flag_roster_size: int

    winter_skills_price_per_session: LowBaseHigh
    winter_skills_group_size: int
    winter_skills_sessions_per_week: int

    family_discount_rate: float = Field(ge=0, le=1)
    sibling_discount_rate: float = Field(ge=0, le=1)
    uniform_fee: float = Field(ge=0)
    payment_processing_rate: float = Field(ge=0, le=1)
    payment_processing_flat: float = Field(ge=0)


class Demand(BaseModel):
    soccer_fill_rate: LowBaseHigh
    flag_fill_rate: LowBaseHigh
    winter_skills_fill_rate: LowBaseHigh
    target_teams_soccer_y1_fall: Dict[str, int]
    target_teams_flag_y1_fall: Dict[str, int]
    season_growth_rate: LowBaseHigh


class Retention(BaseModel):
    soccer_s1_to_s2: LowBaseHigh
    soccer_s2_to_s3: LowBaseHigh
    soccer_s3_plus: LowBaseHigh
    flag_s1_to_s2: LowBaseHigh
    flag_s2_to_s3: LowBaseHigh
    flag_s3_plus: LowBaseHigh
    winter_skills_retention: LowBaseHigh
    cross_sell_rate: LowBaseHigh
    referral_multiplier: LowBaseHigh


class Acquisition(BaseModel):
    channels_y1: Dict[str, float]
    channels_y2: Dict[str, float]
    channels_y3_plus: Dict[str, float]
    cac_by_channel: Dict[str, float]
    blended_cac_y1: LowBaseHigh
    blended_cac_y2: LowBaseHigh
    blended_cac_y3_plus: LowBaseHigh

    @model_validator(mode="after")
    def channel_shares_sum_to_one(self) -> "Acquisition":
        for name, mix in [("y1", self.channels_y1), ("y2", self.channels_y2), ("y3+", self.channels_y3_plus)]:
            total = sum(mix.values())
            if abs(total - 1.0) > 0.001:
                raise ValueError(f"Acquisition channel shares for {name} must sum to 1.0; got {total}")
        return self


class Costs(BaseModel):
    head_coach_hourly: LowBaseHigh
    assistant_coach_hourly: LowBaseHigh
    outdoor_field_hourly: LowBaseHigh
    indoor_turf_full_hourly: LowBaseHigh
    indoor_turf_half_hourly: LowBaseHigh
    gym_hourly: LowBaseHigh
    software_monthly: float = Field(ge=0)
    insurance_monthly: float = Field(ge=0)
    bookkeeping_monthly: float = Field(ge=0)
    founder_time_annual_per_founder: float = Field(ge=0)
    num_founders: int = Field(ge=1)
    curriculum_dev_one_time: float = Field(ge=0)
    curriculum_amortization_months: int = Field(ge=1)


class Capital(BaseModel):
    contribution_per_founder: float = Field(ge=0)
    contribution_month: int = Field(ge=1)
    working_capital_reserve_floor: float = Field(ge=0)
    distribution_policy: Literal["return_capital_then_split"]
    equity_split: Dict[str, float]

    @model_validator(mode="after")
    def equity_sums_to_one(self) -> "Capital":
        total = sum(self.equity_split.values())
        if abs(total - 1.0) > 0.001:
            raise ValueError(f"Equity split must sum to 1.0; got {total}")
        return self


class Assumptions(BaseModel):
    pricing: Pricing
    demand: Demand
    retention: Retention
    acquisition: Acquisition
    costs: Costs
    capital: Capital
    start_month: str              # ISO YYYY-MM, e.g., "2026-07"
    horizon_months: int = Field(ge=12, le=120)
