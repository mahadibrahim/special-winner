from pydantic import BaseModel, Field, model_validator
from typing import Dict


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
