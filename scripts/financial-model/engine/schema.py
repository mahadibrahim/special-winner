from pydantic import BaseModel, Field, model_validator
from typing import Dict, List, Literal, Optional
import yaml
from pathlib import Path


class LowBaseHigh(BaseModel):
    """A three-column assumption: low / base / high."""
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


Season = Literal["fall", "winter", "spring"]
VenueType = Literal["outdoor_field", "indoor_turf_half", "indoor_turf_full", "gym"]


class SportConfig(BaseModel):
    """A single sport offering. Soccer, flag, basketball, winter_skills all use this shape."""
    name: str
    launch_year: int
    price: LowBaseHigh
    weeks_per_season: int
    hours_per_unit: float
    units_per_week: float
    roster_size: int
    venue_type: VenueType
    seasons: List[Season]
    target_teams_y1: Dict[str, int]
    fill_rate: LowBaseHigh
    s1_to_s2: LowBaseHigh
    s2_to_s3: LowBaseHigh
    s3_plus: LowBaseHigh
    # Optional season_growth_rate: applied to spring team counts as
    # round(fall_teams × (1 + rate)). None disables the effect (spring = fall).
    # Base value of 0.25 matches Plan 1 behavior.
    season_growth_rate: Optional[LowBaseHigh] = None


class TravelConfig(BaseModel):
    launch_year: int
    target_teams_direct_y1: Dict[str, int]
    travel_roster_size: int
    direct_fill_rate: LowBaseHigh
    rec_to_travel_upgrade_rate: LowBaseHigh
    travel_price: LowBaseHigh
    travel_weeks_per_season: int
    travel_coach_hourly_premium: float
    travel_s1_to_s2: LowBaseHigh
    travel_s2_to_s3: LowBaseHigh
    travel_s3_plus: LowBaseHigh


class LocationConfig(BaseModel):
    by_year: Dict[int, int]
    new_location_fill_rate_boost: LowBaseHigh
    tam_per_location: int = 10500

    @model_validator(mode="after")
    def check_monotonic(self) -> "LocationConfig":
        years = sorted(self.by_year.keys())
        for prev, curr in zip(years, years[1:]):
            if self.by_year[curr] < self.by_year[prev]:
                raise ValueError(
                    f"locations.by_year must be monotonic non-decreasing; "
                    f"year {curr} has {self.by_year[curr]} < year {prev} ({self.by_year[prev]})"
                )
        return self


class ExpansionConfig(BaseModel):
    locations: LocationConfig
    travel: Optional[TravelConfig] = None


class Pricing(BaseModel):
    """Cross-cutting pricing concerns that are not per-sport."""
    family_discount_rate: float = Field(ge=0, le=1)
    sibling_discount_rate: float = Field(ge=0, le=1)
    uniform_fee: float = Field(ge=0)
    payment_processing_rate: float = Field(ge=0, le=1)
    payment_processing_flat: float = Field(ge=0)


class Retention(BaseModel):
    """Cross-cutting retention concerns not per-sport."""
    referral_multiplier: LowBaseHigh
    cross_sell_rate: LowBaseHigh


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
    retention: Retention
    acquisition: Acquisition
    costs: Costs
    capital: Capital
    sports: List[SportConfig]
    expansion: ExpansionConfig
    start_month: str
    horizon_months: int = Field(ge=12, le=120)


def load_assumptions(path: Path) -> Assumptions:
    with open(path, "r") as f:
        raw = yaml.safe_load(f)
    return Assumptions.model_validate(raw)
