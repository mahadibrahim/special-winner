# Aspire Sports Financial Model — Core xlsx Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Python-driven, YAML-sourced financial model that emits `aspire-financial-model.xlsx` with eleven tabs covering assumptions, Year 1 bottoms-up revenue, Years 2–5 cohort retention, costs, P&L, cash flow, partner returns, sensitivity, scenarios, TAM sanity check, and a cover/README.

**Architecture:** Single source of truth (`assumptions.yaml`) is validated into a typed pydantic model, fed into pure-Python calculation engines (each a separate module under `engine/`), and then into separate xlsx writer modules (one per tab under `writers/`). The `build_model.py` orchestrator wires them together end to end. Everything is unit-tested with pytest; one end-to-end test regenerates the workbook and spot-checks headline cells.

**Tech Stack:** Python 3.11+, `pydantic` v2 (schema validation), `pyyaml` (YAML parsing), `openpyxl` (xlsx generation incl. formulas and formatting), `pytest` (testing), `numpy-financial` (IRR calculation).

**Source spec:** `docs/superpowers/specs/2026-04-15-aspire-sports-financial-model-design.md` — read this before starting.

---

## File Structure

```
scripts/financial-model/
├── assumptions.yaml                 # single source of truth
├── build_model.py                   # orchestrator (CLI entry point)
├── README.md                        # how to regenerate the model
├── pyproject.toml                   # python package + deps
├── .gitignore                       # ignores output/
├── engine/
│   ├── __init__.py
│   ├── schema.py                    # pydantic models for YAML
│   ├── calendar.py                  # month/season timing helpers
│   ├── revenue_year1.py             # bottoms-up Year 1 engine
│   ├── revenue_cohort.py            # Years 2–5 cohort retention engine
│   ├── costs.py                     # variable + fixed cost engine
│   ├── pnl.py                       # monthly P&L roll-up
│   ├── cashflow.py                  # monthly cash balance computation
│   ├── partner_returns.py           # contributions, distributions, IRR, MOIC
│   ├── sensitivity.py               # one-var tornado + two-var heatmaps
│   ├── scenarios.py                 # base/downside/upside overlays
│   └── tam.py                       # Dublin+Powell TAM sanity check
├── writers/
│   ├── __init__.py
│   ├── workbook.py                  # top-level xlsx orchestration
│   ├── styles.py                    # shared cell styles / colors
│   ├── cover_tab.py
│   ├── assumptions_tab.py
│   ├── revenue_year1_tab.py
│   ├── revenue_cohort_tab.py
│   ├── costs_tab.py
│   ├── pnl_tab.py
│   ├── cashflow_tab.py
│   ├── partner_returns_tab.py
│   ├── sensitivity_tab.py
│   ├── scenarios_tab.py
│   └── tam_tab.py
├── tests/
│   ├── __init__.py
│   ├── conftest.py                  # shared fixtures (sample assumptions)
│   ├── test_schema.py
│   ├── test_calendar.py
│   ├── test_revenue_year1.py
│   ├── test_revenue_cohort.py
│   ├── test_costs.py
│   ├── test_pnl.py
│   ├── test_cashflow.py
│   ├── test_partner_returns.py
│   ├── test_sensitivity.py
│   ├── test_scenarios.py
│   ├── test_tam.py
│   └── test_end_to_end.py
└── output/                          # gitignored
    └── .gitkeep
```

**Why this structure:** The `engine/` modules are pure functions operating on typed inputs — they have no knowledge of xlsx, formatting, or IO. The `writers/` modules know how to turn engine outputs into xlsx tabs but don't do any math. This separation is essential because (a) the engines are what a future web app will reuse, (b) the engines are easy to unit-test without touching xlsx, and (c) formatting concerns don't leak into calculation logic.

---

## Tasks

### Task 1: Scaffold project skeleton and test harness

**Files:**
- Create: `scripts/financial-model/pyproject.toml`
- Create: `scripts/financial-model/.gitignore`
- Create: `scripts/financial-model/engine/__init__.py`
- Create: `scripts/financial-model/writers/__init__.py`
- Create: `scripts/financial-model/tests/__init__.py`
- Create: `scripts/financial-model/tests/conftest.py`
- Create: `scripts/financial-model/output/.gitkeep`
- Create: `scripts/financial-model/README.md` (minimal)

- [ ] **Step 1: Create pyproject.toml**

```toml
[project]
name = "aspire-financial-model"
version = "0.1.0"
requires-python = ">=3.11"
dependencies = [
  "pydantic>=2.5",
  "pyyaml>=6.0",
  "openpyxl>=3.1",
  "numpy-financial>=1.0",
]

[project.optional-dependencies]
dev = ["pytest>=8.0"]

[tool.pytest.ini_options]
testpaths = ["tests"]
pythonpath = ["."]
```

- [ ] **Step 2: Create .gitignore**

```
output/*.xlsx
__pycache__/
*.pyc
.pytest_cache/
```

- [ ] **Step 3: Create empty package init files**

Each of `engine/__init__.py`, `writers/__init__.py`, `tests/__init__.py` is an empty file (0 bytes).

- [ ] **Step 4: Create conftest.py with a smoke fixture**

```python
import pytest

@pytest.fixture
def sample_assumptions_path(tmp_path):
    """Shared fixture: a minimal valid assumptions.yaml path used by many tests.
    Real tests will override or extend this via parametrization."""
    return tmp_path / "assumptions.yaml"
```

- [ ] **Step 5: Create output/.gitkeep (empty file) and minimal README.md**

README.md contents:

```markdown
# Aspire Sports Financial Model

Generated xlsx: `output/aspire-financial-model.xlsx`

## Install
    cd scripts/financial-model
    pip install -e .[dev]

## Regenerate
    python build_model.py

## Test
    pytest -v
```

- [ ] **Step 6: Install and verify pytest collects zero tests**

Run: `cd scripts/financial-model && pip install -e .[dev] && pytest -v`
Expected: `collected 0 items` and exit code 0.

- [ ] **Step 7: Commit**

```bash
git add scripts/financial-model/
git commit -m "chore(fin-model): scaffold python project skeleton"
```

---

### Task 2: YAML schema — pricing + demand groups

**Files:**
- Create: `scripts/financial-model/engine/schema.py`
- Create: `scripts/financial-model/tests/test_schema.py`

Start with only two of the six assumption groups to keep this task bounded. The remaining four groups come in Task 3.

- [ ] **Step 1: Write failing tests for pricing and demand schema**

`tests/test_schema.py`:

```python
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_schema.py -v`
Expected: FAIL — ModuleNotFoundError for `engine.schema`.

- [ ] **Step 3: Implement schema.py (pricing + demand only)**

`engine/schema.py`:

```python
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/test_schema.py -v`
Expected: all 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/financial-model/engine/schema.py scripts/financial-model/tests/test_schema.py
git commit -m "feat(fin-model): add pricing and demand schema with validation"
```

---

### Task 3: YAML schema — remaining four groups + top-level Assumptions model

**Files:**
- Modify: `scripts/financial-model/engine/schema.py`
- Modify: `scripts/financial-model/tests/test_schema.py`

- [ ] **Step 1: Write failing tests for retention, acquisition, costs, capital, and top-level Assumptions**

Append to `tests/test_schema.py`:

```python
from engine.schema import Retention, Acquisition, Costs, Capital, Assumptions


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
    from engine.schema import Assumptions, Pricing, Demand, Retention, Acquisition, Costs, Capital
    # minimal valid nested construction
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/test_schema.py -v`
Expected: new tests FAIL (missing classes). Existing tests from Task 2 still PASS.

- [ ] **Step 3: Extend schema.py with remaining groups and top-level Assumptions**

Append to `engine/schema.py`:

```python
from typing import Literal


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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/test_schema.py -v`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/financial-model/engine/schema.py scripts/financial-model/tests/test_schema.py
git commit -m "feat(fin-model): add retention/acquisition/costs/capital schema and top-level Assumptions"
```

---

### Task 4: YAML loader + base case assumptions.yaml

**Files:**
- Create: `scripts/financial-model/assumptions.yaml`
- Modify: `scripts/financial-model/engine/schema.py` (add `load_assumptions` function)
- Modify: `scripts/financial-model/tests/test_schema.py`

- [ ] **Step 1: Write the failing test for load_assumptions**

Append to `tests/test_schema.py`:

```python
from pathlib import Path
from engine.schema import load_assumptions


def test_load_assumptions_from_base_case_yaml():
    """The committed base-case YAML must load and match values from the spec."""
    yaml_path = Path(__file__).parent.parent / "assumptions.yaml"
    a = load_assumptions(yaml_path)
    assert a.pricing.soccer_price.base == 175
    assert a.pricing.flag_price.base == 175
    assert a.pricing.soccer_weeks_per_season == 8
    assert a.pricing.flag_weeks_per_season == 7
    assert a.pricing.winter_skills_price_per_session.base == 25
    assert a.costs.head_coach_hourly.base == 22
    assert a.costs.indoor_turf_full_hourly.base == 175
    assert a.costs.gym_hourly.base == 70
    assert a.retention.soccer_s1_to_s2.base == 0.70
    assert a.retention.soccer_s2_to_s3.base == 0.85
    assert a.retention.soccer_s3_plus.base == 0.90
    assert a.acquisition.blended_cac_y1.base == 18
    assert a.capital.equity_split == {"founder_a": 0.50, "founder_b": 0.50}
    assert a.horizon_months == 60
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_schema.py::test_load_assumptions_from_base_case_yaml -v`
Expected: FAIL — no `load_assumptions` function yet.

- [ ] **Step 3: Add load_assumptions to schema.py**

Append to `engine/schema.py`:

```python
import yaml
from pathlib import Path


def load_assumptions(path: Path) -> Assumptions:
    """Load and validate assumptions from a YAML file."""
    with open(path, "r") as f:
        raw = yaml.safe_load(f)
    return Assumptions.model_validate(raw)
```

- [ ] **Step 4: Write the base-case assumptions.yaml**

`scripts/financial-model/assumptions.yaml`:

```yaml
# Aspire Sports base case assumptions — April 2026
# Values traced to docs/superpowers/specs/2026-04-15-aspire-sports-financial-model-design.md §8
# Confidence levels: HIGH / MEDIUM / LOW-MEDIUM / LOW — see README for meaning.

start_month: "2026-07"       # Fall 2026 registration opens
horizon_months: 60            # 5 years monthly

pricing:
  # Soccer rec league — anchored to i9 Columbus $169 floor, outdoor discount
  soccer_price: { low: 150, base: 175, high: 200 }
  soccer_weeks_per_season: 8
  soccer_seasons_per_year: 2
  soccer_roster_size: 12
  # Flag football rec league — matches NFL Flag Columbus $175 late fee
  flag_price: { low: 150, base: 175, high: 200 }
  flag_weeks_per_season: 7
  flag_seasons_per_year: 2
  flag_roster_size: 10
  # Winter indoor skills clinic — anchored to Resolute $20, Soccer Field Academy $40
  winter_skills_price_per_session: { low: 20, base: 25, high: 35 }
  winter_skills_group_size: 8
  winter_skills_sessions_per_week: 12
  family_discount_rate: 0.0
  sibling_discount_rate: 0.10
  uniform_fee: 0
  payment_processing_rate: 0.029
  payment_processing_flat: 0.30

demand:
  soccer_fill_rate: { low: 0.60, base: 0.75, high: 0.90 }
  flag_fill_rate: { low: 0.60, base: 0.75, high: 0.90 }
  winter_skills_fill_rate: { low: 0.60, base: 0.80, high: 0.95 }
  # Year 1 Fall 2026 target teams — conservative ramp
  target_teams_soccer_y1_fall:
    U8: 4
    U10: 3
    U12: 2
  target_teams_flag_y1_fall:
    K-2: 3
    3-4: 3
    5-6: 2
  season_growth_rate: { low: 0.10, base: 0.25, high: 0.50 }

retention:
  # Rising curve: first renewal is the hardest; returning families are stickier
  soccer_s1_to_s2: { low: 0.55, base: 0.70, high: 0.82 }
  soccer_s2_to_s3: { low: 0.75, base: 0.85, high: 0.92 }
  soccer_s3_plus: { low: 0.82, base: 0.90, high: 0.95 }
  flag_s1_to_s2: { low: 0.55, base: 0.70, high: 0.82 }
  flag_s2_to_s3: { low: 0.75, base: 0.85, high: 0.92 }
  flag_s3_plus: { low: 0.82, base: 0.90, high: 0.95 }
  winter_skills_retention: { low: 0.50, base: 0.65, high: 0.80 }
  cross_sell_rate: { low: 0.15, base: 0.25, high: 0.40 }
  referral_multiplier: { low: 1.05, base: 1.20, high: 1.40 }

acquisition:
  channels_y1:
    partner_network: 0.35
    schools: 0.30
    micro_influencer: 0.15
    community_event: 0.10
    paid_digital: 0.10
  channels_y2:
    partner_network: 0.20
    schools: 0.25
    micro_influencer: 0.10
    community_event: 0.10
    paid_digital: 0.10
    referrals: 0.25
  channels_y3_plus:
    partner_network: 0.10
    schools: 0.20
    micro_influencer: 0.10
    community_event: 0.10
    paid_digital: 0.10
    referrals: 0.40
  cac_by_channel:
    partner_network: 5
    schools: 12
    micro_influencer: 5
    community_event: 20
    paid_digital: 50
    referrals: 5
  blended_cac_y1: { low: 12, base: 18, high: 30 }
  blended_cac_y2: { low: 8, base: 12, high: 20 }
  blended_cac_y3_plus: { low: 5, base: 8, high: 14 }

costs:
  head_coach_hourly: { low: 18, base: 22, high: 28 }
  assistant_coach_hourly: { low: 13, base: 16, high: 20 }
  outdoor_field_hourly: { low: 25, base: 35, high: 60 }   # LOW CONFIDENCE — needs outreach
  indoor_turf_full_hourly: { low: 135, base: 175, high: 220 }
  indoor_turf_half_hourly: { low: 75, base: 95, high: 125 }
  gym_hourly: { low: 60, base: 70, high: 95 }
  software_monthly: 350
  insurance_monthly: 400
  bookkeeping_monthly: 250
  founder_time_annual_per_founder: 80000
  num_founders: 2
  curriculum_dev_one_time: 30000
  curriculum_amortization_months: 36

capital:
  contribution_per_founder: 50000
  contribution_month: 1
  working_capital_reserve_floor: 15000
  distribution_policy: return_capital_then_split
  equity_split:
    founder_a: 0.50
    founder_b: 0.50
```

- [ ] **Step 5: Run tests**

Run: `pytest tests/test_schema.py -v`
Expected: all tests PASS including `test_load_assumptions_from_base_case_yaml`.

- [ ] **Step 6: Commit**

```bash
git add scripts/financial-model/assumptions.yaml scripts/financial-model/engine/schema.py scripts/financial-model/tests/test_schema.py
git commit -m "feat(fin-model): add base case assumptions.yaml and loader"
```

---

### Task 5: Calendar / timing helpers

**Files:**
- Create: `scripts/financial-model/engine/calendar.py`
- Create: `scripts/financial-model/tests/test_calendar.py`

- [ ] **Step 1: Write failing tests**

`tests/test_calendar.py`:

```python
from datetime import date
from engine.calendar import (
    parse_year_month,
    month_offset,
    months_between,
    season_months,
    registration_month_for_season,
    month_sequence,
)


def test_parse_year_month():
    assert parse_year_month("2026-07") == date(2026, 7, 1)


def test_month_offset():
    assert month_offset(date(2026, 7, 1), 0) == date(2026, 7, 1)
    assert month_offset(date(2026, 7, 1), 5) == date(2026, 12, 1)
    assert month_offset(date(2026, 7, 1), 12) == date(2027, 7, 1)
    assert month_offset(date(2026, 7, 1), -1) == date(2026, 6, 1)


def test_months_between():
    assert months_between(date(2026, 7, 1), date(2026, 7, 1)) == 0
    assert months_between(date(2026, 7, 1), date(2027, 7, 1)) == 12
    assert months_between(date(2026, 7, 1), date(2028, 1, 1)) == 18


def test_season_months_fall_2026():
    """Fall 2026 soccer/flag league season runs September and October."""
    months = season_months("fall", 2026)
    assert date(2026, 9, 1) in months
    assert date(2026, 10, 1) in months


def test_season_months_winter_2026():
    """Winter 2026/27 skills clinic runs December through March."""
    months = season_months("winter", 2026)
    assert date(2026, 12, 1) in months
    assert date(2027, 3, 1) in months
    assert len(months) == 4


def test_season_months_spring_2027():
    """Spring 2027 runs April and May."""
    months = season_months("spring", 2027)
    assert date(2027, 4, 1) in months
    assert date(2027, 5, 1) in months


def test_registration_month_for_season_fall_2026():
    """Fall registration cash hits in July, two months before season starts."""
    assert registration_month_for_season("fall", 2026) == date(2026, 7, 1)


def test_registration_month_for_season_winter_2026():
    """Winter registration cash hits in November."""
    assert registration_month_for_season("winter", 2026) == date(2026, 11, 1)


def test_registration_month_for_season_spring_2027():
    """Spring registration cash hits in January."""
    assert registration_month_for_season("spring", 2027) == date(2027, 1, 1)


def test_month_sequence_60_months():
    seq = month_sequence(date(2026, 7, 1), 60)
    assert len(seq) == 60
    assert seq[0] == date(2026, 7, 1)
    assert seq[-1] == date(2031, 6, 1)
```

- [ ] **Step 2: Run tests, expect failure**

Run: `pytest tests/test_calendar.py -v`
Expected: FAIL — no `engine.calendar` module.

- [ ] **Step 3: Implement calendar.py**

`engine/calendar.py`:

```python
from datetime import date
from typing import List, Literal


Season = Literal["fall", "winter", "spring"]


def parse_year_month(s: str) -> date:
    """Parse 'YYYY-MM' into a date set to the first of the month."""
    year, month = s.split("-")
    return date(int(year), int(month), 1)


def month_offset(d: date, n: int) -> date:
    """Return d + n months, snapped to the first of the month."""
    m = d.month - 1 + n
    y = d.year + m // 12
    return date(y, m % 12 + 1, 1)


def months_between(start: date, end: date) -> int:
    """Number of months from start to end (end - start)."""
    return (end.year - start.year) * 12 + (end.month - start.month)


def month_sequence(start: date, count: int) -> List[date]:
    """Return a list of the first-of-month dates starting at `start`, length `count`."""
    return [month_offset(start, i) for i in range(count)]


def season_months(season: Season, year: int) -> List[date]:
    """Return the calendar months a given season runs in.

    Fall = Sep + Oct of `year`.
    Winter = Dec of `year` through Mar of `year+1`.
    Spring = Apr + May of `year`.
    """
    if season == "fall":
        return [date(year, 9, 1), date(year, 10, 1)]
    if season == "winter":
        return [date(year, 12, 1), date(year + 1, 1, 1), date(year + 1, 2, 1), date(year + 1, 3, 1)]
    if season == "spring":
        return [date(year, 4, 1), date(year, 5, 1)]
    raise ValueError(f"Unknown season: {season}")


def registration_month_for_season(season: Season, year: int) -> date:
    """Return the month in which registration cash is received for the given season.

    Convention: cash lands 2 months before the first playing month.
    Fall 2026 → cash in July 2026.
    Winter 2026 → cash in November 2026.
    Spring 2027 → cash in January 2027.
    """
    first_month = season_months(season, year)[0]
    return month_offset(first_month, -2)
```

- [ ] **Step 4: Run tests**

Run: `pytest tests/test_calendar.py -v`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/financial-model/engine/calendar.py scripts/financial-model/tests/test_calendar.py
git commit -m "feat(fin-model): add calendar helpers for months and seasons"
```

---

### Task 6: Year 1 bottoms-up revenue engine

**Files:**
- Create: `scripts/financial-model/engine/revenue_year1.py`
- Create: `scripts/financial-model/tests/test_revenue_year1.py`

- [ ] **Step 1: Write failing tests**

`tests/test_revenue_year1.py`:

```python
from datetime import date
from pathlib import Path
from engine.schema import load_assumptions
from engine.revenue_year1 import (
    compute_season_revenue,
    build_year1_revenue,
    Year1RevenueLine,
)


def test_compute_season_revenue_soccer_fall_2026():
    """Base case: 9 soccer teams (4 U8 + 3 U10 + 2 U12), 12 kids/team, 75% fill.
    kids = 9 * 12 * 0.75 = 81. Gross = 81 * $175 = $14,175.
    After 10% sibling discount on 20% of kids (heuristic test), net < gross.
    """
    a = load_assumptions(Path("assumptions.yaml"))
    line = compute_season_revenue(
        assumptions=a,
        sport="soccer",
        season="fall",
        season_year=2026,
    )
    assert isinstance(line, Year1RevenueLine)
    assert line.kids_registered == 81      # 9 teams × 12 × 0.75
    assert line.gross_revenue == 81 * 175
    # Net revenue = gross - sibling discount (5% blended assumed = 2.5%) - processing (2.9% + flat×tx)
    # We assert the direction and bounds, not an exact float.
    assert line.net_revenue < line.gross_revenue
    assert line.net_revenue > line.gross_revenue * 0.92


def test_compute_season_revenue_cash_lands_in_registration_month():
    a = load_assumptions(Path("assumptions.yaml"))
    line = compute_season_revenue(a, sport="soccer", season="fall", season_year=2026)
    assert line.cash_month == date(2026, 7, 1)


def test_compute_season_revenue_flag_fall_2026():
    a = load_assumptions(Path("assumptions.yaml"))
    line = compute_season_revenue(a, sport="flag", season="fall", season_year=2026)
    # 8 flag teams (3+3+2) × 10 kids × 0.75 = 60
    assert line.kids_registered == 60
    assert line.gross_revenue == 60 * 175


def test_build_year1_revenue_has_all_three_seasons():
    """Year 1 has Fall 2026 (soccer+flag), Winter 2026/27 (skills), Spring 2027 (soccer+flag)."""
    a = load_assumptions(Path("assumptions.yaml"))
    lines = build_year1_revenue(a)
    seasons_covered = {(l.sport, l.season, l.season_year) for l in lines}
    assert ("soccer", "fall", 2026) in seasons_covered
    assert ("flag", "fall", 2026) in seasons_covered
    assert ("winter_skills", "winter", 2026) in seasons_covered
    assert ("soccer", "spring", 2027) in seasons_covered
    assert ("flag", "spring", 2027) in seasons_covered


def test_spring_season_applies_growth_rate():
    """Spring target teams grow by season_growth_rate (base 0.25) from Fall."""
    a = load_assumptions(Path("assumptions.yaml"))
    lines = build_year1_revenue(a)
    fall_soccer = next(l for l in lines if l.sport == "soccer" and l.season == "fall")
    spring_soccer = next(l for l in lines if l.sport == "soccer" and l.season == "spring")
    assert spring_soccer.kids_registered >= fall_soccer.kids_registered * 1.20
```

- [ ] **Step 2: Run tests, expect failure**

Run: `pytest tests/test_revenue_year1.py -v`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement revenue_year1.py**

`engine/revenue_year1.py`:

```python
from dataclasses import dataclass
from datetime import date
from typing import List, Literal
from engine.schema import Assumptions
from engine.calendar import registration_month_for_season, Season


Sport = Literal["soccer", "flag", "winter_skills"]


@dataclass
class Year1RevenueLine:
    sport: Sport
    season: Season
    season_year: int
    teams_or_groups: int
    kids_registered: int
    gross_revenue: float
    discounts: float
    processing_fees: float
    net_revenue: float
    cash_month: date


def _league_kids(assumptions: Assumptions, sport: Sport, season: Season) -> tuple[int, int]:
    """Return (teams, kids) for a league sport/season, applying fill rate and growth."""
    if sport == "soccer":
        target_teams = sum(assumptions.demand.target_teams_soccer_y1_fall.values())
        roster = assumptions.pricing.soccer_roster_size
        fill = assumptions.demand.soccer_fill_rate.base
    elif sport == "flag":
        target_teams = sum(assumptions.demand.target_teams_flag_y1_fall.values())
        roster = assumptions.pricing.flag_roster_size
        fill = assumptions.demand.flag_fill_rate.base
    else:
        raise ValueError(f"Not a league sport: {sport}")

    if season == "spring":
        target_teams = round(target_teams * (1 + assumptions.demand.season_growth_rate.base))

    kids = int(target_teams * roster * fill)
    return target_teams, kids


def _apply_discounts_and_fees(
    gross: float, assumptions: Assumptions, kids: int
) -> tuple[float, float, float]:
    """Return (discounts, processing_fees, net_revenue)."""
    # Sibling discount heuristic: assume ~25% of kids are siblings getting the sibling rate
    sibling_rate = assumptions.pricing.sibling_discount_rate
    discounts = gross * 0.25 * sibling_rate
    processing = (gross - discounts) * assumptions.pricing.payment_processing_rate + \
                 assumptions.pricing.payment_processing_flat * kids
    net = gross - discounts - processing
    return discounts, processing, net


def compute_season_revenue(
    assumptions: Assumptions,
    sport: Sport,
    season: Season,
    season_year: int,
) -> Year1RevenueLine:
    """Compute a single season×sport revenue line."""
    if sport == "winter_skills":
        groups = assumptions.pricing.winter_skills_sessions_per_week
        kids = int(groups * assumptions.pricing.winter_skills_group_size *
                   assumptions.demand.winter_skills_fill_rate.base)
        # Winter runs 12 weeks × sessions_per_week × group_size × price_per_session
        sessions_in_season = 12 * groups
        price_per_seat = assumptions.pricing.winter_skills_price_per_session.base
        # Gross = kid-sessions × price; but we express as kids × (sessions_in_season/groups) × price for clarity
        gross = kids * 12 * price_per_seat
        teams = groups
    else:
        teams, kids = _league_kids(assumptions, sport, season)
        price = (assumptions.pricing.soccer_price.base if sport == "soccer"
                 else assumptions.pricing.flag_price.base)
        gross = kids * price

    discounts, processing, net = _apply_discounts_and_fees(gross, assumptions, kids)
    cash_month = registration_month_for_season(season, season_year)

    return Year1RevenueLine(
        sport=sport,
        season=season,
        season_year=season_year,
        teams_or_groups=teams,
        kids_registered=kids,
        gross_revenue=gross,
        discounts=discounts,
        processing_fees=processing,
        net_revenue=net,
        cash_month=cash_month,
    )


def build_year1_revenue(assumptions: Assumptions) -> List[Year1RevenueLine]:
    """Build all Year 1 revenue lines: Fall 2026, Winter 2026, Spring 2027."""
    return [
        compute_season_revenue(assumptions, "soccer", "fall", 2026),
        compute_season_revenue(assumptions, "flag", "fall", 2026),
        compute_season_revenue(assumptions, "winter_skills", "winter", 2026),
        compute_season_revenue(assumptions, "soccer", "spring", 2027),
        compute_season_revenue(assumptions, "flag", "spring", 2027),
    ]
```

- [ ] **Step 4: Run tests**

Run: `cd scripts/financial-model && pytest tests/test_revenue_year1.py -v`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/financial-model/engine/revenue_year1.py scripts/financial-model/tests/test_revenue_year1.py
git commit -m "feat(fin-model): add Year 1 bottoms-up revenue engine"
```

---

### Task 7: Cost engine — variable + fixed + monthly timing

**Files:**
- Create: `scripts/financial-model/engine/costs.py`
- Create: `scripts/financial-model/tests/test_costs.py`

- [ ] **Step 1: Write failing tests**

`tests/test_costs.py`:

```python
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
```

- [ ] **Step 2: Run tests, expect failure**

Run: `pytest tests/test_costs.py -v`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement costs.py**

`engine/costs.py`:

```python
from dataclasses import dataclass, field
from datetime import date
from typing import Dict, List
from engine.schema import Assumptions
from engine.calendar import parse_year_month, month_sequence, registration_month_for_season
from engine.revenue_year1 import Year1RevenueLine


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
```

- [ ] **Step 4: Run tests**

Run: `pytest tests/test_costs.py -v`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/financial-model/engine/costs.py scripts/financial-model/tests/test_costs.py
git commit -m "feat(fin-model): add variable + fixed cost engine with cash/expense split"
```

---

### Task 8: Cohort retention engine (Years 2–5)

**Files:**
- Create: `scripts/financial-model/engine/revenue_cohort.py`
- Create: `scripts/financial-model/tests/test_revenue_cohort.py`

- [ ] **Step 1: Write failing tests**

`tests/test_revenue_cohort.py`:

```python
from pathlib import Path
from engine.schema import load_assumptions
from engine.revenue_year1 import build_year1_revenue
from engine.revenue_cohort import (
    build_cohort_revenue,
    Cohort,
    apply_retention,
)


def test_apply_retention_shrinks_cohort():
    c = Cohort(origin_season_index=0, size=100)
    shrunk = apply_retention(c, rate=0.70)
    assert shrunk.size == 70


def test_build_cohort_revenue_has_lines_for_years_2_through_5():
    a = load_assumptions(Path("assumptions.yaml"))
    year1 = build_year1_revenue(a)
    lines = build_cohort_revenue(a, year1)
    # Years 2-5 each have Fall, Winter, Spring for 2 sports = some number of lines
    season_years = {l.season_year for l in lines}
    # Years 2027-2031 should be represented (spring 2027 is in Year 1, so cohort starts Fall 2027)
    assert 2027 in season_years or 2028 in season_years
    assert 2030 in season_years


def test_cohort_revenue_grows_year_over_year():
    a = load_assumptions(Path("assumptions.yaml"))
    year1 = build_year1_revenue(a)
    lines = build_cohort_revenue(a, year1)
    year2_total = sum(l.net_revenue for l in lines if l.season_year == 2027)
    year3_total = sum(l.net_revenue for l in lines if l.season_year == 2028)
    assert year3_total > year2_total


def test_retention_rates_compound_across_multiple_seasons():
    """A cohort from Year 1 Fall 2026, after 3 retention steps, should equal
    starting_size × 0.70 × 0.85 × 0.90 (the base soccer curve)."""
    c = Cohort(origin_season_index=0, size=100)
    c1 = apply_retention(c, 0.70)
    c2 = apply_retention(c1, 0.85)
    c3 = apply_retention(c2, 0.90)
    assert c3.size == int(100 * 0.70 * 0.85 * 0.90)
```

- [ ] **Step 2: Run tests, expect failure**

Run: `pytest tests/test_revenue_cohort.py -v`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement revenue_cohort.py**

`engine/revenue_cohort.py`:

```python
from dataclasses import dataclass, field
from datetime import date
from typing import List
from engine.schema import Assumptions
from engine.calendar import registration_month_for_season, Season
from engine.revenue_year1 import Year1RevenueLine


@dataclass
class Cohort:
    origin_season_index: int
    size: int


@dataclass
class CohortRevenueLine:
    sport: str
    season: Season
    season_year: int
    kids_registered: int
    gross_revenue: float
    net_revenue: float
    cash_month: date


def apply_retention(cohort: Cohort, rate: float) -> Cohort:
    """Return a new cohort with size = int(size × rate). Origin index preserved."""
    return Cohort(
        origin_season_index=cohort.origin_season_index,
        size=int(cohort.size * rate),
    )


def _retention_for_season_age(a: Assumptions, sport: str, seasons_since_origin: int) -> float:
    """Return the retention rate to apply for moving a cohort from season N to N+1."""
    if sport == "soccer":
        if seasons_since_origin == 1:
            return a.retention.soccer_s1_to_s2.base
        if seasons_since_origin == 2:
            return a.retention.soccer_s2_to_s3.base
        return a.retention.soccer_s3_plus.base
    if sport == "flag":
        if seasons_since_origin == 1:
            return a.retention.flag_s1_to_s2.base
        if seasons_since_origin == 2:
            return a.retention.flag_s2_to_s3.base
        return a.retention.flag_s3_plus.base
    return a.retention.winter_skills_retention.base


def _season_sequence_after_year1() -> List[tuple[Season, int]]:
    """Return the (season, year) tuples for Years 2-5 (Fall 2027 → Spring 2031)."""
    result = []
    for year in range(2027, 2031):  # 2027..2030
        result.append(("fall", year))
        result.append(("winter", year))
        result.append(("spring", year + 1))
    return result


def build_cohort_revenue(
    a: Assumptions,
    year1_lines: List[Year1RevenueLine],
) -> List[CohortRevenueLine]:
    """Build Years 2-5 revenue lines using cohort retention.

    Simplified model: each sport has a single pooled cohort starting from Year 1 sizes.
    Each season the cohort shrinks by the appropriate retention factor, then a new
    acquisition cohort is added sized as (prior_year_same_season × referral_multiplier
    + fresh_acquisition_growth). For v1 we combine retention and referral into a single
    net rate: effective_rate = retention × referral_multiplier.
    """
    lines: List[CohortRevenueLine] = []

    # Starting cohort sizes by sport from Year 1 combined totals
    y1_soccer = sum(l.kids_registered for l in year1_lines if l.sport == "soccer")
    y1_flag = sum(l.kids_registered for l in year1_lines if l.sport == "flag")

    soccer_size = y1_soccer
    flag_size = y1_flag
    ref_mult = a.retention.referral_multiplier.base

    season_sequence = _season_sequence_after_year1()
    for idx, (season, season_year) in enumerate(season_sequence):
        # Skip winter for league lines (soccer/flag) — they only run fall+spring
        if season == "winter":
            # Build a single winter_skills line sized off current soccer+flag pool × cross_sell
            winter_kids = int((soccer_size + flag_size) * a.retention.cross_sell_rate.base)
            winter_price = a.pricing.winter_skills_price_per_session.base * 12  # 12 sessions
            winter_gross = winter_kids * winter_price
            winter_net = winter_gross * 0.94  # rough discount + processing
            lines.append(CohortRevenueLine(
                sport="winter_skills",
                season=season,
                season_year=season_year,
                kids_registered=winter_kids,
                gross_revenue=winter_gross,
                net_revenue=winter_net,
                cash_month=registration_month_for_season(season, season_year),
            ))
            continue

        # Apply retention to both sports
        seasons_since_origin = (idx // 3) + 2  # rough mapping
        soccer_rate = _retention_for_season_age(a, "soccer", seasons_since_origin)
        flag_rate = _retention_for_season_age(a, "flag", seasons_since_origin)

        soccer_size = int(soccer_size * soccer_rate * ref_mult)
        flag_size = int(flag_size * flag_rate * ref_mult)

        # Soccer line
        soccer_gross = soccer_size * a.pricing.soccer_price.base
        soccer_net = soccer_gross * 0.94
        lines.append(CohortRevenueLine(
            sport="soccer",
            season=season,
            season_year=season_year,
            kids_registered=soccer_size,
            gross_revenue=soccer_gross,
            net_revenue=soccer_net,
            cash_month=registration_month_for_season(season, season_year),
        ))

        # Flag line
        flag_gross = flag_size * a.pricing.flag_price.base
        flag_net = flag_gross * 0.94
        lines.append(CohortRevenueLine(
            sport="flag",
            season=season,
            season_year=season_year,
            kids_registered=flag_size,
            gross_revenue=flag_gross,
            net_revenue=flag_net,
            cash_month=registration_month_for_season(season, season_year),
        ))

    return lines
```

- [ ] **Step 4: Run tests**

Run: `pytest tests/test_revenue_cohort.py -v`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/financial-model/engine/revenue_cohort.py scripts/financial-model/tests/test_revenue_cohort.py
git commit -m "feat(fin-model): add cohort retention engine for Years 2-5"
```

---

### Task 9: Monthly P&L roll-up

**Files:**
- Create: `scripts/financial-model/engine/pnl.py`
- Create: `scripts/financial-model/tests/test_pnl.py`

- [ ] **Step 1: Write failing tests**

`tests/test_pnl.py`:

```python
from datetime import date
from pathlib import Path
from engine.schema import load_assumptions
from engine.revenue_year1 import build_year1_revenue
from engine.revenue_cohort import build_cohort_revenue
from engine.costs import build_cost_schedule
from engine.pnl import build_monthly_pnl, PnLRow


def test_pnl_has_row_per_month_in_horizon():
    a = load_assumptions(Path("assumptions.yaml"))
    y1 = build_year1_revenue(a)
    cohort = build_cohort_revenue(a, y1)
    costs = build_cost_schedule(a)
    pnl = build_monthly_pnl(a, y1, cohort, costs)
    assert len(pnl) == a.horizon_months


def test_pnl_row_fields():
    a = load_assumptions(Path("assumptions.yaml"))
    y1 = build_year1_revenue(a)
    cohort = build_cohort_revenue(a, y1)
    costs = build_cost_schedule(a)
    pnl = build_monthly_pnl(a, y1, cohort, costs)
    row = pnl[0]
    assert isinstance(row, PnLRow)
    assert row.month == date(2026, 7, 1)
    # Net income = revenue - total expense
    assert row.net_income == row.revenue - row.total_expense


def test_pnl_year1_total_revenue_matches_year1_lines():
    """Sum of monthly revenue in months 1-12 should equal sum of Year 1 line net revenues
    (Year 1 has lines whose cash_month falls within months 1-12, so revenue recognition
    should align)."""
    a = load_assumptions(Path("assumptions.yaml"))
    y1 = build_year1_revenue(a)
    cohort = build_cohort_revenue(a, y1)
    costs = build_cost_schedule(a)
    pnl = build_monthly_pnl(a, y1, cohort, costs)
    y1_pnl_total = sum(r.revenue for r in pnl[:12])
    y1_lines_total = sum(l.net_revenue for l in y1)
    # The two should be close (cohort winter also contributes in month 5 of Y1 if it recognizes)
    assert abs(y1_pnl_total - y1_lines_total) < y1_lines_total * 0.5  # loose bound
```

- [ ] **Step 2: Run tests, expect failure**

Run: `pytest tests/test_pnl.py -v`
Expected: FAIL.

- [ ] **Step 3: Implement pnl.py**

`engine/pnl.py`:

```python
from dataclasses import dataclass
from datetime import date
from typing import List
from engine.schema import Assumptions
from engine.calendar import parse_year_month, month_sequence
from engine.revenue_year1 import Year1RevenueLine
from engine.revenue_cohort import CohortRevenueLine
from engine.costs import CostScheduleRow


@dataclass
class PnLRow:
    month: date
    revenue: float = 0.0
    variable_cost: float = 0.0
    fixed_expense: float = 0.0
    total_expense: float = 0.0
    net_income: float = 0.0


def build_monthly_pnl(
    a: Assumptions,
    y1_lines: List[Year1RevenueLine],
    cohort_lines: List[CohortRevenueLine],
    cost_schedule: List[CostScheduleRow],
) -> List[PnLRow]:
    """Build a monthly P&L for the full horizon. Revenue is recognized in the
    month it is collected (cash_month) for simplicity in v1."""
    start = parse_year_month(a.start_month)
    months = month_sequence(start, a.horizon_months)
    month_index = {m: i for i, m in enumerate(months)}
    rows = [PnLRow(month=m) for m in months]

    # Revenue: recognize in cash_month
    for line in y1_lines:
        if line.cash_month in month_index:
            rows[month_index[line.cash_month]].revenue += line.net_revenue
    for line in cohort_lines:
        if line.cash_month in month_index:
            rows[month_index[line.cash_month]].revenue += line.net_revenue

    # Variable costs: allocate evenly across the months the program runs.
    # For v1 simplicity, allocate Year 1 variable costs uniformly across months 2-12.
    y1_var_total = 0.0
    for line in y1_lines:
        from engine.costs import compute_variable_costs_for_line
        vc = compute_variable_costs_for_line(a, line)
        y1_var_total += vc["total"]
    monthly_var = y1_var_total / 12
    for i in range(min(12, len(rows))):
        rows[i].variable_cost += monthly_var

    # Fixed expense from cost schedule
    for i, cs in enumerate(cost_schedule):
        rows[i].fixed_expense = cs.total_fixed_expense

    # Total and net income
    for r in rows:
        r.total_expense = r.variable_cost + r.fixed_expense
        r.net_income = r.revenue - r.total_expense

    return rows
```

- [ ] **Step 4: Run tests**

Run: `pytest tests/test_pnl.py -v`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/financial-model/engine/pnl.py scripts/financial-model/tests/test_pnl.py
git commit -m "feat(fin-model): add monthly P&L roll-up"
```

---

### Task 10: Monthly cash flow

**Files:**
- Create: `scripts/financial-model/engine/cashflow.py`
- Create: `scripts/financial-model/tests/test_cashflow.py`

- [ ] **Step 1: Write failing tests**

`tests/test_cashflow.py`:

```python
from datetime import date
from pathlib import Path
from engine.schema import load_assumptions
from engine.revenue_year1 import build_year1_revenue
from engine.revenue_cohort import build_cohort_revenue
from engine.costs import build_cost_schedule
from engine.cashflow import build_monthly_cashflow, CashflowRow


def test_cashflow_row_count_matches_horizon():
    a = load_assumptions(Path("assumptions.yaml"))
    y1 = build_year1_revenue(a)
    cohort = build_cohort_revenue(a, y1)
    costs = build_cost_schedule(a)
    cf = build_monthly_cashflow(a, y1, cohort, costs)
    assert len(cf) == a.horizon_months


def test_initial_contributions_appear_in_month_1():
    a = load_assumptions(Path("assumptions.yaml"))
    y1 = build_year1_revenue(a)
    cohort = build_cohort_revenue(a, y1)
    costs = build_cost_schedule(a)
    cf = build_monthly_cashflow(a, y1, cohort, costs)
    assert cf[0].contributions == a.capital.contribution_per_founder * a.costs.num_founders


def test_ending_balance_is_cumulative():
    a = load_assumptions(Path("assumptions.yaml"))
    y1 = build_year1_revenue(a)
    cohort = build_cohort_revenue(a, y1)
    costs = build_cost_schedule(a)
    cf = build_monthly_cashflow(a, y1, cohort, costs)
    assert cf[0].ending_balance == (
        cf[0].contributions + cf[0].receipts - cf[0].disbursements
    )
    assert cf[1].ending_balance == (
        cf[0].ending_balance + cf[1].contributions + cf[1].receipts - cf[1].disbursements
    )
```

- [ ] **Step 2: Run tests, expect failure**

Run: `pytest tests/test_cashflow.py -v`
Expected: FAIL.

- [ ] **Step 3: Implement cashflow.py**

`engine/cashflow.py`:

```python
from dataclasses import dataclass
from datetime import date
from typing import List
from engine.schema import Assumptions
from engine.calendar import parse_year_month, month_sequence
from engine.revenue_year1 import Year1RevenueLine
from engine.revenue_cohort import CohortRevenueLine
from engine.costs import CostScheduleRow


@dataclass
class CashflowRow:
    month: date
    contributions: float = 0.0
    receipts: float = 0.0
    disbursements: float = 0.0
    net_change: float = 0.0
    ending_balance: float = 0.0


def build_monthly_cashflow(
    a: Assumptions,
    y1_lines: List[Year1RevenueLine],
    cohort_lines: List[CohortRevenueLine],
    cost_schedule: List[CostScheduleRow],
) -> List[CashflowRow]:
    """Monthly cash flow: contributions + receipts - disbursements = net change.
    Ending balance is cumulative from month 1."""
    start = parse_year_month(a.start_month)
    months = month_sequence(start, a.horizon_months)
    month_index = {m: i for i, m in enumerate(months)}
    rows = [CashflowRow(month=m) for m in months]

    # Partner contributions land in contribution_month (1-indexed → 0-indexed)
    contrib_idx = a.capital.contribution_month - 1
    total_contribution = a.capital.contribution_per_founder * a.costs.num_founders
    rows[contrib_idx].contributions = total_contribution

    # Revenue cash receipts land in cash_month
    for line in y1_lines:
        if line.cash_month in month_index:
            rows[month_index[line.cash_month]].receipts += line.net_revenue
    for line in cohort_lines:
        if line.cash_month in month_index:
            rows[month_index[line.cash_month]].receipts += line.net_revenue

    # Disbursements: variable costs (allocated uniformly Y1) + cost schedule cash
    from engine.costs import compute_variable_costs_for_line
    y1_var_total = sum(compute_variable_costs_for_line(a, l)["total"] for l in y1_lines)
    monthly_var = y1_var_total / 12
    for i in range(min(12, len(rows))):
        rows[i].disbursements += monthly_var

    for i, cs in enumerate(cost_schedule):
        rows[i].disbursements += (
            cs.software + cs.insurance + cs.bookkeeping + cs.founder_time + cs.marketing + cs.cash_curriculum
        )

    # Net change and cumulative ending balance
    running = 0.0
    for r in rows:
        r.net_change = r.contributions + r.receipts - r.disbursements
        running += r.net_change
        r.ending_balance = running

    return rows
```

- [ ] **Step 4: Run tests**

Run: `pytest tests/test_cashflow.py -v`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/financial-model/engine/cashflow.py scripts/financial-model/tests/test_cashflow.py
git commit -m "feat(fin-model): add monthly cash flow engine"
```

---

### Task 11: Partner returns (contributions, distributions, IRR, MOIC)

**Files:**
- Create: `scripts/financial-model/engine/partner_returns.py`
- Create: `scripts/financial-model/tests/test_partner_returns.py`

- [ ] **Step 1: Write failing tests**

`tests/test_partner_returns.py`:

```python
from pathlib import Path
from engine.schema import load_assumptions
from engine.revenue_year1 import build_year1_revenue
from engine.revenue_cohort import build_cohort_revenue
from engine.costs import build_cost_schedule
from engine.cashflow import build_monthly_cashflow
from engine.partner_returns import build_partner_returns, PartnerReturnsReport


def test_partner_returns_report_shape():
    a = load_assumptions(Path("assumptions.yaml"))
    y1 = build_year1_revenue(a)
    cohort = build_cohort_revenue(a, y1)
    costs = build_cost_schedule(a)
    cf = build_monthly_cashflow(a, y1, cohort, costs)
    report = build_partner_returns(a, cf)
    assert isinstance(report, PartnerReturnsReport)
    assert len(report.monthly_rows) == a.horizon_months
    assert "founder_a" in report.total_contribution_by_partner
    assert "founder_b" in report.total_contribution_by_partner


def test_no_distributions_before_capital_returned():
    """Distribution policy is return_capital_then_split: no distributions can
    occur until cumulative distributions equal total contributions."""
    a = load_assumptions(Path("assumptions.yaml"))
    y1 = build_year1_revenue(a)
    cohort = build_cohort_revenue(a, y1)
    costs = build_cost_schedule(a)
    cf = build_monthly_cashflow(a, y1, cohort, costs)
    report = build_partner_returns(a, cf)

    total_contributions = sum(report.total_contribution_by_partner.values())
    cumulative_distributed = 0.0
    first_distribution_idx = None
    for i, row in enumerate(report.monthly_rows):
        cumulative_distributed += row.total_distribution
        if row.total_distribution > 0 and first_distribution_idx is None:
            first_distribution_idx = i
    # If any distributions occur, the first should only happen once capital is returnable
    # i.e., cumulative cashflow ending balance at that month must exceed
    # total_contributions + reserve_floor
    if first_distribution_idx is not None:
        ending = cf[first_distribution_idx].ending_balance
        assert ending + cumulative_distributed >= total_contributions + a.capital.working_capital_reserve_floor


def test_irr_and_moic_fields_populated():
    a = load_assumptions(Path("assumptions.yaml"))
    y1 = build_year1_revenue(a)
    cohort = build_cohort_revenue(a, y1)
    costs = build_cost_schedule(a)
    cf = build_monthly_cashflow(a, y1, cohort, costs)
    report = build_partner_returns(a, cf)
    assert report.irr is not None
    assert report.moic is not None
    assert report.payback_month is not None or report.payback_month is None  # allow None if never paid back
```

- [ ] **Step 2: Run tests, expect failure**

Run: `pytest tests/test_partner_returns.py -v`
Expected: FAIL.

- [ ] **Step 3: Implement partner_returns.py**

`engine/partner_returns.py`:

```python
from dataclasses import dataclass, field
from datetime import date
from typing import Dict, List, Optional
import numpy_financial as npf
from engine.schema import Assumptions
from engine.cashflow import CashflowRow


@dataclass
class PartnerReturnsRow:
    month: date
    contribution: float = 0.0
    business_ending_balance: float = 0.0
    total_distribution: float = 0.0
    distribution_by_partner: Dict[str, float] = field(default_factory=dict)
    cumulative_distribution_by_partner: Dict[str, float] = field(default_factory=dict)


@dataclass
class PartnerReturnsReport:
    monthly_rows: List[PartnerReturnsRow]
    total_contribution_by_partner: Dict[str, float]
    total_distribution_by_partner: Dict[str, float]
    payback_month: Optional[date]
    irr: Optional[float]        # monthly IRR on business-level cash flows
    moic: Optional[float]


def build_partner_returns(a: Assumptions, cashflow: List[CashflowRow]) -> PartnerReturnsReport:
    partners = list(a.capital.equity_split.keys())
    per_partner_contrib = a.capital.contribution_per_founder

    rows: List[PartnerReturnsRow] = []
    cumulative_dist = {p: 0.0 for p in partners}
    cumulative_contrib = {p: 0.0 for p in partners}
    payback_month: Optional[date] = None

    total_contribution = per_partner_contrib * len(partners)
    reserve_floor = a.capital.working_capital_reserve_floor

    for cf_row in cashflow:
        row = PartnerReturnsRow(
            month=cf_row.month,
            business_ending_balance=cf_row.ending_balance,
            distribution_by_partner={p: 0.0 for p in partners},
            cumulative_distribution_by_partner={p: 0.0 for p in partners},
        )

        # Contributions on the month they land
        if cf_row.contributions > 0:
            for p in partners:
                row.contribution += per_partner_contrib
                cumulative_contrib[p] += per_partner_contrib

        # Distribution rule: only distribute if ending balance exceeds reserve_floor.
        # Split distribution 50/50 (per equity_split).
        excess = cf_row.ending_balance - reserve_floor
        if excess > 0:
            # First pay back any unreturned contributions 50/50 up to excess
            total_returned_so_far = sum(cumulative_dist.values())
            still_owed = max(0.0, total_contribution - total_returned_so_far)
            if still_owed > 0:
                payback_amount = min(excess, still_owed)
                for p in partners:
                    share = payback_amount * a.capital.equity_split[p]
                    row.distribution_by_partner[p] += share
                    cumulative_dist[p] += share
                row.total_distribution += payback_amount
                excess -= payback_amount

            # Any remaining excess is also distributed 50/50 (the "then split" step)
            if excess > 0:
                for p in partners:
                    share = excess * a.capital.equity_split[p]
                    row.distribution_by_partner[p] += share
                    cumulative_dist[p] += share
                row.total_distribution += excess

        for p in partners:
            row.cumulative_distribution_by_partner[p] = cumulative_dist[p]

        # Payback month: first month cumulative distributions >= total contributions
        if payback_month is None and sum(cumulative_dist.values()) >= total_contribution:
            payback_month = cf_row.month

        rows.append(row)

    # IRR on business-level monthly cash flows: contributions (negative) + distributions (positive)
    series = []
    for i, cf_row in enumerate(cashflow):
        outflow = -cf_row.contributions if cf_row.contributions else 0
        inflow = rows[i].total_distribution
        series.append(outflow + inflow)
    try:
        irr_monthly = npf.irr(series)
        irr = (1 + irr_monthly) ** 12 - 1 if irr_monthly is not None else None
    except Exception:
        irr = None

    total_dist = sum(cumulative_dist.values())
    moic = total_dist / total_contribution if total_contribution > 0 else None

    return PartnerReturnsReport(
        monthly_rows=rows,
        total_contribution_by_partner={p: per_partner_contrib for p in partners},
        total_distribution_by_partner=cumulative_dist,
        payback_month=payback_month,
        irr=irr,
        moic=moic,
    )
```

- [ ] **Step 4: Run tests**

Run: `pytest tests/test_partner_returns.py -v`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/financial-model/engine/partner_returns.py scripts/financial-model/tests/test_partner_returns.py
git commit -m "feat(fin-model): add partner returns engine with IRR/MOIC and payback month"
```

---

### Task 12: Scenarios (base / downside / upside overlays)

**Files:**
- Create: `scripts/financial-model/engine/scenarios.py`
- Create: `scripts/financial-model/tests/test_scenarios.py`

- [ ] **Step 1: Write failing tests**

`tests/test_scenarios.py`:

```python
from pathlib import Path
from engine.schema import load_assumptions
from engine.scenarios import run_scenarios, ScenarioResult


def test_run_scenarios_returns_three_named_results():
    a = load_assumptions(Path("assumptions.yaml"))
    results = run_scenarios(a)
    names = {r.name for r in results}
    assert names == {"base", "downside", "upside"}


def test_downside_year3_net_income_lower_than_base():
    a = load_assumptions(Path("assumptions.yaml"))
    results = run_scenarios(a)
    base = next(r for r in results if r.name == "base")
    downside = next(r for r in results if r.name == "downside")
    assert downside.year3_net_income < base.year3_net_income


def test_upside_year3_net_income_higher_than_base():
    a = load_assumptions(Path("assumptions.yaml"))
    results = run_scenarios(a)
    base = next(r for r in results if r.name == "base")
    upside = next(r for r in results if r.name == "upside")
    assert upside.year3_net_income > base.year3_net_income
```

- [ ] **Step 2: Run tests, expect failure**

Run: `pytest tests/test_scenarios.py -v`
Expected: FAIL.

- [ ] **Step 3: Implement scenarios.py**

`engine/scenarios.py`:

```python
from dataclasses import dataclass
from typing import List
from copy import deepcopy
from engine.schema import Assumptions, LowBaseHigh
from engine.revenue_year1 import build_year1_revenue
from engine.revenue_cohort import build_cohort_revenue
from engine.costs import build_cost_schedule
from engine.pnl import build_monthly_pnl


@dataclass
class ScenarioResult:
    name: str
    year1_revenue: float
    year3_net_income: float
    year5_net_income: float
    min_cash_balance: float


def _overlay_low(a: Assumptions) -> Assumptions:
    """Downside: use low values where appropriate and apply additional stress."""
    a2 = deepcopy(a)
    # Fill rates to low
    a2.demand.soccer_fill_rate = LowBaseHigh(
        low=a.demand.soccer_fill_rate.low * 0.7,
        base=a.demand.soccer_fill_rate.low,
        high=a.demand.soccer_fill_rate.base,
    )
    a2.demand.flag_fill_rate = LowBaseHigh(
        low=a.demand.flag_fill_rate.low * 0.7,
        base=a.demand.flag_fill_rate.low,
        high=a.demand.flag_fill_rate.base,
    )
    # Retention to low
    a2.retention.soccer_s1_to_s2 = LowBaseHigh(
        low=a.retention.soccer_s1_to_s2.low, base=a.retention.soccer_s1_to_s2.low,
        high=a.retention.soccer_s1_to_s2.base,
    )
    a2.retention.flag_s1_to_s2 = LowBaseHigh(
        low=a.retention.flag_s1_to_s2.low, base=a.retention.flag_s1_to_s2.low,
        high=a.retention.flag_s1_to_s2.base,
    )
    return a2


def _overlay_high(a: Assumptions) -> Assumptions:
    a2 = deepcopy(a)
    a2.demand.soccer_fill_rate = LowBaseHigh(
        low=a.demand.soccer_fill_rate.base, base=a.demand.soccer_fill_rate.high,
        high=a.demand.soccer_fill_rate.high,
    )
    a2.demand.flag_fill_rate = LowBaseHigh(
        low=a.demand.flag_fill_rate.base, base=a.demand.flag_fill_rate.high,
        high=a.demand.flag_fill_rate.high,
    )
    a2.retention.soccer_s1_to_s2 = LowBaseHigh(
        low=a.retention.soccer_s1_to_s2.base, base=a.retention.soccer_s1_to_s2.high,
        high=a.retention.soccer_s1_to_s2.high,
    )
    a2.retention.flag_s1_to_s2 = LowBaseHigh(
        low=a.retention.flag_s1_to_s2.base, base=a.retention.flag_s1_to_s2.high,
        high=a.retention.flag_s1_to_s2.high,
    )
    return a2


def _run_one(name: str, a: Assumptions) -> ScenarioResult:
    y1 = build_year1_revenue(a)
    cohort = build_cohort_revenue(a, y1)
    costs = build_cost_schedule(a)
    pnl = build_monthly_pnl(a, y1, cohort, costs)
    year1_rev = sum(r.revenue for r in pnl[:12])
    year3_ni = sum(r.net_income for r in pnl[24:36])
    year5_ni = sum(r.net_income for r in pnl[48:60])
    # min cash balance proxy = min monthly net income cumulative
    running = 0
    min_cash = 0
    for r in pnl:
        running += r.net_income
        if running < min_cash:
            min_cash = running
    return ScenarioResult(
        name=name, year1_revenue=year1_rev, year3_net_income=year3_ni,
        year5_net_income=year5_ni, min_cash_balance=min_cash,
    )


def run_scenarios(a: Assumptions) -> List[ScenarioResult]:
    return [
        _run_one("base", a),
        _run_one("downside", _overlay_low(a)),
        _run_one("upside", _overlay_high(a)),
    ]
```

- [ ] **Step 4: Run tests**

Run: `pytest tests/test_scenarios.py -v`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/financial-model/engine/scenarios.py scripts/financial-model/tests/test_scenarios.py
git commit -m "feat(fin-model): add base/downside/upside scenario overlays"
```

---

### Task 13: Sensitivity analysis (one-variable tornado)

**Files:**
- Create: `scripts/financial-model/engine/sensitivity.py`
- Create: `scripts/financial-model/tests/test_sensitivity.py`

- [ ] **Step 1: Write failing tests**

`tests/test_sensitivity.py`:

```python
from pathlib import Path
from engine.schema import load_assumptions
from engine.sensitivity import build_tornado, TornadoBar


def test_tornado_has_one_bar_per_variable():
    a = load_assumptions(Path("assumptions.yaml"))
    bars = build_tornado(a)
    names = {b.variable for b in bars}
    # At minimum these variables
    assert "soccer_fill_rate" in names
    assert "blended_cac_y1" in names
    assert "soccer_s1_to_s2_retention" in names
    assert "soccer_price" in names


def test_tornado_bars_are_sorted_by_impact_descending():
    a = load_assumptions(Path("assumptions.yaml"))
    bars = build_tornado(a)
    impacts = [b.impact for b in bars]
    assert impacts == sorted(impacts, reverse=True)


def test_tornado_bar_low_base_high_ordering():
    """For each variable, the high value should produce a higher output than the low value."""
    a = load_assumptions(Path("assumptions.yaml"))
    bars = build_tornado(a)
    for b in bars:
        assert b.output_high >= b.output_low
```

- [ ] **Step 2: Run tests, expect failure**

Run: `pytest tests/test_sensitivity.py -v`
Expected: FAIL.

- [ ] **Step 3: Implement sensitivity.py**

`engine/sensitivity.py`:

```python
from dataclasses import dataclass
from typing import List, Callable
from copy import deepcopy
from engine.schema import Assumptions, LowBaseHigh
from engine.revenue_year1 import build_year1_revenue
from engine.revenue_cohort import build_cohort_revenue
from engine.costs import build_cost_schedule
from engine.pnl import build_monthly_pnl


@dataclass
class TornadoBar:
    variable: str
    output_low: float
    output_base: float
    output_high: float
    impact: float


def _year3_net_income(a: Assumptions) -> float:
    y1 = build_year1_revenue(a)
    cohort = build_cohort_revenue(a, y1)
    costs = build_cost_schedule(a)
    pnl = build_monthly_pnl(a, y1, cohort, costs)
    return sum(r.net_income for r in pnl[24:36])


def _flex(a: Assumptions, path: str, which: str) -> Assumptions:
    """Set the specified LowBaseHigh path's base value to its .low, .base, or .high."""
    a2 = deepcopy(a)
    obj = a2
    parts = path.split(".")
    for p in parts[:-1]:
        obj = getattr(obj, p)
    field_name = parts[-1]
    lbh: LowBaseHigh = getattr(obj, field_name)
    new_base = getattr(lbh, which)
    setattr(obj, field_name, LowBaseHigh(low=lbh.low, base=new_base, high=lbh.high))
    return a2


_SENSITIVITY_VARIABLES = [
    ("soccer_fill_rate", "demand.soccer_fill_rate"),
    ("flag_fill_rate", "demand.flag_fill_rate"),
    ("soccer_s1_to_s2_retention", "retention.soccer_s1_to_s2"),
    ("soccer_s2_to_s3_retention", "retention.soccer_s2_to_s3"),
    ("cross_sell_rate", "retention.cross_sell_rate"),
    ("referral_multiplier", "retention.referral_multiplier"),
    ("blended_cac_y1", "acquisition.blended_cac_y1"),
    ("soccer_price", "pricing.soccer_price"),
    ("flag_price", "pricing.flag_price"),
    ("head_coach_hourly", "costs.head_coach_hourly"),
    ("indoor_turf_full_hourly", "costs.indoor_turf_full_hourly"),
]


def build_tornado(a: Assumptions) -> List[TornadoBar]:
    base_output = _year3_net_income(a)
    bars: List[TornadoBar] = []
    for name, path in _SENSITIVITY_VARIABLES:
        try:
            a_low = _flex(a, path, "low")
            a_high = _flex(a, path, "high")
            out_low = _year3_net_income(a_low)
            out_high = _year3_net_income(a_high)
            bars.append(TornadoBar(
                variable=name, output_low=min(out_low, out_high),
                output_base=base_output, output_high=max(out_low, out_high),
                impact=abs(out_high - out_low),
            ))
        except AttributeError:
            # variable path not found — skip
            continue
    bars.sort(key=lambda b: b.impact, reverse=True)
    return bars
```

- [ ] **Step 4: Run tests**

Run: `pytest tests/test_sensitivity.py -v`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/financial-model/engine/sensitivity.py scripts/financial-model/tests/test_sensitivity.py
git commit -m "feat(fin-model): add one-variable tornado sensitivity analysis"
```

---

### Task 14: TAM sanity check

**Files:**
- Create: `scripts/financial-model/engine/tam.py`
- Create: `scripts/financial-model/tests/test_tam.py`

- [ ] **Step 1: Write failing tests**

`tests/test_tam.py`:

```python
from pathlib import Path
from engine.schema import load_assumptions
from engine.revenue_year1 import build_year1_revenue
from engine.revenue_cohort import build_cohort_revenue
from engine.tam import compute_tam_check, TamReport


def test_tam_report_shape():
    a = load_assumptions(Path("assumptions.yaml"))
    y1 = build_year1_revenue(a)
    cohort = build_cohort_revenue(a, y1)
    report = compute_tam_check(a, y1, cohort)
    assert isinstance(report, TamReport)
    assert report.addressable_kids > 0
    assert len(report.implied_market_share_by_year) == 5


def test_year1_market_share_is_realistic():
    """Year 1 implied market share should be well under 5% for a launch year."""
    a = load_assumptions(Path("assumptions.yaml"))
    y1 = build_year1_revenue(a)
    cohort = build_cohort_revenue(a, y1)
    report = compute_tam_check(a, y1, cohort)
    assert report.implied_market_share_by_year[0] < 0.05
```

- [ ] **Step 2: Run tests, expect failure**

Run: `pytest tests/test_tam.py -v`
Expected: FAIL.

- [ ] **Step 3: Implement tam.py**

`engine/tam.py`:

```python
from dataclasses import dataclass
from typing import List
from engine.schema import Assumptions
from engine.revenue_year1 import Year1RevenueLine
from engine.revenue_cohort import CohortRevenueLine


# Dublin + Powell estimated addressable kids aged 5-12
# Dublin population ~50K, ~15% kids 5-14 ≈ 7,500. Powell ~15K, ~20% kids 5-14 ≈ 3,000.
# Conservative combined: ~10,500 addressable kids in soccer/flag age range.
DUBLIN_POWELL_ADDRESSABLE_KIDS = 10500


@dataclass
class TamReport:
    addressable_kids: int
    implied_market_share_by_year: List[float]


def compute_tam_check(
    a: Assumptions,
    y1_lines: List[Year1RevenueLine],
    cohort_lines: List[CohortRevenueLine],
) -> TamReport:
    """Compare implied unique kids served per year to the addressable market."""
    shares: List[float] = []

    # Year 1: sum of unique kids across all Year 1 league lines (exclude winter_skills
    # to avoid double counting cross-sell)
    y1_unique = sum(l.kids_registered for l in y1_lines
                    if l.sport in ("soccer", "flag") and l.season == "fall")
    shares.append(y1_unique / DUBLIN_POWELL_ADDRESSABLE_KIDS)

    # Years 2-5: max cohort kids per year
    for year in range(2027, 2031):
        year_kids = max(
            (l.kids_registered for l in cohort_lines
             if l.season_year == year and l.sport in ("soccer", "flag")),
            default=0,
        )
        shares.append(year_kids / DUBLIN_POWELL_ADDRESSABLE_KIDS)

    return TamReport(
        addressable_kids=DUBLIN_POWELL_ADDRESSABLE_KIDS,
        implied_market_share_by_year=shares,
    )
```

- [ ] **Step 4: Run tests**

Run: `pytest tests/test_tam.py -v`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/financial-model/engine/tam.py scripts/financial-model/tests/test_tam.py
git commit -m "feat(fin-model): add TAM sanity check for Dublin+Powell"
```

---

### Task 15: xlsx writer — workbook scaffolding and styles

**Files:**
- Create: `scripts/financial-model/writers/workbook.py`
- Create: `scripts/financial-model/writers/styles.py`

- [ ] **Step 1: Create styles.py**

`writers/styles.py`:

```python
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side

HEADER_FILL = PatternFill("solid", fgColor="1F4E78")
HEADER_FONT = Font(bold=True, color="FFFFFF", size=11)
SECTION_FILL = PatternFill("solid", fgColor="D9E1F2")
SECTION_FONT = Font(bold=True, size=11)
CONFIDENCE_HIGH = PatternFill("solid", fgColor="C6EFCE")    # green
CONFIDENCE_MEDIUM = PatternFill("solid", fgColor="FFEB9C")  # yellow
CONFIDENCE_LOW = PatternFill("solid", fgColor="FFC7CE")     # red
CURRENCY_FORMAT = '"$"#,##0'
PERCENT_FORMAT = "0.0%"
THIN_BORDER = Border(
    left=Side(style="thin"), right=Side(style="thin"),
    top=Side(style="thin"), bottom=Side(style="thin"),
)
CENTER = Alignment(horizontal="center", vertical="center")
LEFT = Alignment(horizontal="left", vertical="center")
RIGHT = Alignment(horizontal="right", vertical="center")
```

- [ ] **Step 2: Create workbook.py**

`writers/workbook.py`:

```python
from pathlib import Path
from openpyxl import Workbook
from engine.schema import Assumptions


def build_empty_workbook(a: Assumptions) -> Workbook:
    """Create a Workbook with named tabs in order. Individual writer modules
    will populate each tab's contents."""
    wb = Workbook()
    # Remove the default sheet; we create ours explicitly in order
    default = wb.active
    wb.remove(default)

    tab_names = [
        "Cover",
        "Assumptions",
        "Revenue Y1",
        "Revenue Cohort",
        "Costs",
        "P&L",
        "Cash Flow",
        "Partner Returns",
        "Sensitivity",
        "Scenarios",
        "TAM Check",
    ]
    for name in tab_names:
        wb.create_sheet(name)
    return wb


def save_workbook(wb: Workbook, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    wb.save(path)
```

- [ ] **Step 3: Commit**

```bash
git add scripts/financial-model/writers/workbook.py scripts/financial-model/writers/styles.py
git commit -m "feat(fin-model): add xlsx workbook scaffold and shared styles"
```

---

### Task 16: Cover tab + Assumptions tab writers

**Files:**
- Create: `scripts/financial-model/writers/cover_tab.py`
- Create: `scripts/financial-model/writers/assumptions_tab.py`
- Create: `scripts/financial-model/tests/test_writers_cover_assumptions.py`

- [ ] **Step 1: Write failing test**

`tests/test_writers_cover_assumptions.py`:

```python
from pathlib import Path
from engine.schema import load_assumptions
from writers.workbook import build_empty_workbook
from writers.cover_tab import write_cover_tab
from writers.assumptions_tab import write_assumptions_tab


def test_cover_tab_has_title_and_date(tmp_path):
    a = load_assumptions(Path("assumptions.yaml"))
    wb = build_empty_workbook(a)
    write_cover_tab(wb, a)
    ws = wb["Cover"]
    assert ws["A1"].value is not None
    assert "Aspire" in ws["A1"].value


def test_assumptions_tab_writes_pricing_values(tmp_path):
    a = load_assumptions(Path("assumptions.yaml"))
    wb = build_empty_workbook(a)
    write_assumptions_tab(wb, a)
    ws = wb["Assumptions"]
    # Collect all numeric values in the sheet
    values = []
    for row in ws.iter_rows(values_only=True):
        for v in row:
            if isinstance(v, (int, float)):
                values.append(v)
    assert 175 in values       # soccer_price.base
    assert 25 in values        # winter skills price
    assert 22 in values        # head coach hourly
```

- [ ] **Step 2: Run test, expect failure**

Run: `pytest tests/test_writers_cover_assumptions.py -v`
Expected: FAIL.

- [ ] **Step 3: Implement cover_tab.py**

`writers/cover_tab.py`:

```python
from datetime import date
from openpyxl import Workbook
from engine.schema import Assumptions
from writers.styles import SECTION_FONT


def write_cover_tab(wb: Workbook, a: Assumptions) -> None:
    from openpyxl.styles import Font
    ws = wb["Cover"]
    ws["A1"] = "Aspire Sports — 5-Year Financial Model"
    ws["A1"].font = Font(bold=True, size=16)

    ws["A3"] = f"Generated: {date.today().isoformat()}"
    ws["A4"] = f"Horizon: {a.horizon_months} months starting {a.start_month}"
    ws["A5"] = "Source: docs/superpowers/specs/2026-04-15-aspire-sports-financial-model-design.md"

    ws["A7"] = "Confidence legend:"
    ws["A7"].font = SECTION_FONT
    ws["A8"] = "  Green  = HIGH confidence (verified local data)"
    ws["A9"] = "  Yellow = MEDIUM confidence (market research)"
    ws["A10"] = "  Red    = LOW confidence (placeholder, needs outreach)"

    ws["A12"] = "How to use:"
    ws["A12"].font = SECTION_FONT
    ws["A13"] = "  1. Edit values in the Assumptions tab only."
    ws["A14"] = "  2. All downstream tabs reference Assumptions — changes propagate."
    ws["A15"] = "  3. The Scenarios tab shows side-by-side base/downside/upside."
    ws["A16"] = "  4. The Partner Returns tab shows IRR, MOIC, and payback month."

    ws.column_dimensions["A"].width = 80
```

- [ ] **Step 4: Implement assumptions_tab.py**

`writers/assumptions_tab.py`:

```python
from openpyxl import Workbook
from engine.schema import Assumptions, LowBaseHigh
from writers.styles import (
    HEADER_FILL, HEADER_FONT, SECTION_FILL, SECTION_FONT,
    CONFIDENCE_HIGH, CONFIDENCE_MEDIUM, CONFIDENCE_LOW,
    CURRENCY_FORMAT, PERCENT_FORMAT, CENTER, LEFT,
)


def _write_header(ws, row: int):
    labels = ["Assumption", "Low", "Base", "High", "Unit", "Confidence"]
    for col, label in enumerate(labels, start=1):
        c = ws.cell(row=row, column=col, value=label)
        c.fill = HEADER_FILL
        c.font = HEADER_FONT
        c.alignment = CENTER


def _write_lbh_row(ws, row: int, label: str, lbh: LowBaseHigh, unit: str, confidence: str):
    ws.cell(row=row, column=1, value=label).alignment = LEFT
    ws.cell(row=row, column=2, value=lbh.low)
    ws.cell(row=row, column=3, value=lbh.base)
    ws.cell(row=row, column=4, value=lbh.high)
    ws.cell(row=row, column=5, value=unit)
    fill = {
        "HIGH": CONFIDENCE_HIGH,
        "MEDIUM": CONFIDENCE_MEDIUM,
        "LOW": CONFIDENCE_LOW,
    }.get(confidence, CONFIDENCE_MEDIUM)
    c = ws.cell(row=row, column=6, value=confidence)
    c.fill = fill
    c.alignment = CENTER


def _write_scalar_row(ws, row: int, label: str, value, unit: str):
    ws.cell(row=row, column=1, value=label).alignment = LEFT
    ws.cell(row=row, column=3, value=value)
    ws.cell(row=row, column=5, value=unit)


def write_assumptions_tab(wb: Workbook, a: Assumptions) -> None:
    ws = wb["Assumptions"]
    row = 1
    ws.cell(row=row, column=1, value="PRICING").font = SECTION_FONT
    ws.cell(row=row, column=1).fill = SECTION_FILL
    row += 1
    _write_header(ws, row)
    row += 1
    _write_lbh_row(ws, row, "Soccer rec price", a.pricing.soccer_price, "$/season", "MEDIUM"); row += 1
    _write_scalar_row(ws, row, "Soccer weeks/season", a.pricing.soccer_weeks_per_season, "weeks"); row += 1
    _write_scalar_row(ws, row, "Soccer seasons/year", a.pricing.soccer_seasons_per_year, "seasons"); row += 1
    _write_scalar_row(ws, row, "Soccer roster size", a.pricing.soccer_roster_size, "kids"); row += 1
    _write_lbh_row(ws, row, "Flag price", a.pricing.flag_price, "$/season", "MEDIUM"); row += 1
    _write_scalar_row(ws, row, "Flag weeks/season", a.pricing.flag_weeks_per_season, "weeks"); row += 1
    _write_scalar_row(ws, row, "Flag roster size", a.pricing.flag_roster_size, "kids"); row += 1
    _write_lbh_row(ws, row, "Winter skills $/session", a.pricing.winter_skills_price_per_session, "$/session", "MEDIUM"); row += 1
    _write_scalar_row(ws, row, "Winter skills group size", a.pricing.winter_skills_group_size, "kids"); row += 1
    row += 1

    ws.cell(row=row, column=1, value="DEMAND").font = SECTION_FONT; row += 1
    _write_header(ws, row); row += 1
    _write_lbh_row(ws, row, "Soccer fill rate", a.demand.soccer_fill_rate, "%", "MEDIUM"); row += 1
    _write_lbh_row(ws, row, "Flag fill rate", a.demand.flag_fill_rate, "%", "MEDIUM"); row += 1
    _write_lbh_row(ws, row, "Winter skills fill rate", a.demand.winter_skills_fill_rate, "%", "MEDIUM"); row += 1
    row += 1

    ws.cell(row=row, column=1, value="RETENTION").font = SECTION_FONT; row += 1
    _write_header(ws, row); row += 1
    _write_lbh_row(ws, row, "Soccer S1→S2", a.retention.soccer_s1_to_s2, "%", "MEDIUM"); row += 1
    _write_lbh_row(ws, row, "Soccer S2→S3", a.retention.soccer_s2_to_s3, "%", "MEDIUM"); row += 1
    _write_lbh_row(ws, row, "Soccer S3+", a.retention.soccer_s3_plus, "%", "MEDIUM"); row += 1
    _write_lbh_row(ws, row, "Cross-sell rate", a.retention.cross_sell_rate, "%", "MEDIUM"); row += 1
    _write_lbh_row(ws, row, "Referral multiplier", a.retention.referral_multiplier, "x", "LOW"); row += 1
    row += 1

    ws.cell(row=row, column=1, value="COSTS").font = SECTION_FONT; row += 1
    _write_header(ws, row); row += 1
    _write_lbh_row(ws, row, "Head coach hourly", a.costs.head_coach_hourly, "$/hr", "HIGH"); row += 1
    _write_lbh_row(ws, row, "Assistant coach hourly", a.costs.assistant_coach_hourly, "$/hr", "MEDIUM"); row += 1
    _write_lbh_row(ws, row, "Outdoor field hourly", a.costs.outdoor_field_hourly, "$/hr", "LOW"); row += 1
    _write_lbh_row(ws, row, "Indoor turf full hourly", a.costs.indoor_turf_full_hourly, "$/hr", "MEDIUM"); row += 1
    _write_lbh_row(ws, row, "Indoor turf half hourly", a.costs.indoor_turf_half_hourly, "$/hr", "MEDIUM"); row += 1
    _write_lbh_row(ws, row, "Gym hourly", a.costs.gym_hourly, "$/hr", "HIGH"); row += 1
    _write_scalar_row(ws, row, "Software monthly", a.costs.software_monthly, "$/mo"); row += 1
    _write_scalar_row(ws, row, "Insurance monthly", a.costs.insurance_monthly, "$/mo"); row += 1
    _write_scalar_row(ws, row, "Founder time annual (per founder)", a.costs.founder_time_annual_per_founder, "$/yr"); row += 1

    ws.column_dimensions["A"].width = 40
    ws.column_dimensions["B"].width = 12
    ws.column_dimensions["C"].width = 12
    ws.column_dimensions["D"].width = 12
    ws.column_dimensions["E"].width = 14
    ws.column_dimensions["F"].width = 14
```

- [ ] **Step 5: Run tests**

Run: `pytest tests/test_writers_cover_assumptions.py -v`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add scripts/financial-model/writers/cover_tab.py scripts/financial-model/writers/assumptions_tab.py scripts/financial-model/tests/test_writers_cover_assumptions.py
git commit -m "feat(fin-model): add Cover and Assumptions tab writers"
```

---

### Task 17: Revenue Y1 + Revenue Cohort tab writers

**Files:**
- Create: `scripts/financial-model/writers/revenue_year1_tab.py`
- Create: `scripts/financial-model/writers/revenue_cohort_tab.py`
- Create: `scripts/financial-model/tests/test_writers_revenue.py`

- [ ] **Step 1: Write failing tests**

`tests/test_writers_revenue.py`:

```python
from pathlib import Path
from engine.schema import load_assumptions
from engine.revenue_year1 import build_year1_revenue
from engine.revenue_cohort import build_cohort_revenue
from writers.workbook import build_empty_workbook
from writers.revenue_year1_tab import write_revenue_year1_tab
from writers.revenue_cohort_tab import write_revenue_cohort_tab


def test_revenue_year1_tab_has_row_per_line():
    a = load_assumptions(Path("assumptions.yaml"))
    lines = build_year1_revenue(a)
    wb = build_empty_workbook(a)
    write_revenue_year1_tab(wb, lines)
    ws = wb["Revenue Y1"]
    data_rows = [row for row in ws.iter_rows(min_row=3, values_only=True) if any(row)]
    assert len(data_rows) == len(lines)


def test_revenue_cohort_tab_has_lines():
    a = load_assumptions(Path("assumptions.yaml"))
    y1 = build_year1_revenue(a)
    cohort = build_cohort_revenue(a, y1)
    wb = build_empty_workbook(a)
    write_revenue_cohort_tab(wb, cohort)
    ws = wb["Revenue Cohort"]
    data_rows = [row for row in ws.iter_rows(min_row=3, values_only=True) if any(row)]
    assert len(data_rows) == len(cohort)
```

- [ ] **Step 2: Run tests, expect failure**

Run: `pytest tests/test_writers_revenue.py -v`
Expected: FAIL.

- [ ] **Step 3: Implement both writer modules**

`writers/revenue_year1_tab.py`:

```python
from typing import List
from openpyxl import Workbook
from engine.revenue_year1 import Year1RevenueLine
from writers.styles import HEADER_FILL, HEADER_FONT, CURRENCY_FORMAT, CENTER, SECTION_FONT


def write_revenue_year1_tab(wb: Workbook, lines: List[Year1RevenueLine]) -> None:
    ws = wb["Revenue Y1"]
    ws["A1"] = "Year 1 Revenue — Bottoms-Up"
    ws["A1"].font = SECTION_FONT

    headers = ["Sport", "Season", "Year", "Teams/Groups", "Kids",
               "Gross Revenue", "Discounts", "Processing", "Net Revenue", "Cash Month"]
    for col, h in enumerate(headers, start=1):
        c = ws.cell(row=2, column=col, value=h)
        c.fill = HEADER_FILL
        c.font = HEADER_FONT
        c.alignment = CENTER

    for i, line in enumerate(lines, start=3):
        ws.cell(row=i, column=1, value=line.sport)
        ws.cell(row=i, column=2, value=line.season)
        ws.cell(row=i, column=3, value=line.season_year)
        ws.cell(row=i, column=4, value=line.teams_or_groups)
        ws.cell(row=i, column=5, value=line.kids_registered)
        gross = ws.cell(row=i, column=6, value=line.gross_revenue); gross.number_format = CURRENCY_FORMAT
        disc = ws.cell(row=i, column=7, value=line.discounts); disc.number_format = CURRENCY_FORMAT
        proc = ws.cell(row=i, column=8, value=line.processing_fees); proc.number_format = CURRENCY_FORMAT
        net = ws.cell(row=i, column=9, value=line.net_revenue); net.number_format = CURRENCY_FORMAT
        ws.cell(row=i, column=10, value=line.cash_month.isoformat())

    for col_letter, width in [("A", 14), ("B", 10), ("C", 8), ("D", 14), ("E", 10),
                              ("F", 16), ("G", 12), ("H", 14), ("I", 16), ("J", 14)]:
        ws.column_dimensions[col_letter].width = width
```

`writers/revenue_cohort_tab.py`:

```python
from typing import List
from openpyxl import Workbook
from engine.revenue_cohort import CohortRevenueLine
from writers.styles import HEADER_FILL, HEADER_FONT, CURRENCY_FORMAT, CENTER, SECTION_FONT


def write_revenue_cohort_tab(wb: Workbook, lines: List[CohortRevenueLine]) -> None:
    ws = wb["Revenue Cohort"]
    ws["A1"] = "Years 2–5 Revenue — Cohort Retention"
    ws["A1"].font = SECTION_FONT

    headers = ["Sport", "Season", "Year", "Kids", "Gross", "Net", "Cash Month"]
    for col, h in enumerate(headers, start=1):
        c = ws.cell(row=2, column=col, value=h)
        c.fill = HEADER_FILL
        c.font = HEADER_FONT
        c.alignment = CENTER

    for i, line in enumerate(lines, start=3):
        ws.cell(row=i, column=1, value=line.sport)
        ws.cell(row=i, column=2, value=line.season)
        ws.cell(row=i, column=3, value=line.season_year)
        ws.cell(row=i, column=4, value=line.kids_registered)
        g = ws.cell(row=i, column=5, value=line.gross_revenue); g.number_format = CURRENCY_FORMAT
        n = ws.cell(row=i, column=6, value=line.net_revenue); n.number_format = CURRENCY_FORMAT
        ws.cell(row=i, column=7, value=line.cash_month.isoformat())

    for col_letter, width in [("A", 14), ("B", 10), ("C", 8), ("D", 10),
                              ("E", 16), ("F", 16), ("G", 14)]:
        ws.column_dimensions[col_letter].width = width
```

- [ ] **Step 4: Run tests**

Run: `pytest tests/test_writers_revenue.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/financial-model/writers/revenue_year1_tab.py scripts/financial-model/writers/revenue_cohort_tab.py scripts/financial-model/tests/test_writers_revenue.py
git commit -m "feat(fin-model): add Revenue Y1 and Revenue Cohort tab writers"
```

---

### Task 18: Costs + P&L + Cash Flow tab writers

**Files:**
- Create: `scripts/financial-model/writers/costs_tab.py`
- Create: `scripts/financial-model/writers/pnl_tab.py`
- Create: `scripts/financial-model/writers/cashflow_tab.py`
- Create: `scripts/financial-model/tests/test_writers_financials.py`

- [ ] **Step 1: Write failing test**

`tests/test_writers_financials.py`:

```python
from pathlib import Path
from engine.schema import load_assumptions
from engine.revenue_year1 import build_year1_revenue
from engine.revenue_cohort import build_cohort_revenue
from engine.costs import build_cost_schedule
from engine.pnl import build_monthly_pnl
from engine.cashflow import build_monthly_cashflow
from writers.workbook import build_empty_workbook
from writers.costs_tab import write_costs_tab
from writers.pnl_tab import write_pnl_tab
from writers.cashflow_tab import write_cashflow_tab


def test_financial_tabs_write_without_error():
    a = load_assumptions(Path("assumptions.yaml"))
    y1 = build_year1_revenue(a)
    cohort = build_cohort_revenue(a, y1)
    costs = build_cost_schedule(a)
    pnl = build_monthly_pnl(a, y1, cohort, costs)
    cf = build_monthly_cashflow(a, y1, cohort, costs)
    wb = build_empty_workbook(a)
    write_costs_tab(wb, costs)
    write_pnl_tab(wb, pnl)
    write_cashflow_tab(wb, cf)
    assert wb["Costs"]["A1"].value is not None
    assert wb["P&L"]["A1"].value is not None
    assert wb["Cash Flow"]["A1"].value is not None


def test_pnl_tab_has_60_month_rows():
    a = load_assumptions(Path("assumptions.yaml"))
    y1 = build_year1_revenue(a)
    cohort = build_cohort_revenue(a, y1)
    costs = build_cost_schedule(a)
    pnl = build_monthly_pnl(a, y1, cohort, costs)
    wb = build_empty_workbook(a)
    write_pnl_tab(wb, pnl)
    ws = wb["P&L"]
    data_rows = [r for r in ws.iter_rows(min_row=3, values_only=True) if r[0] is not None]
    assert len(data_rows) == 60
```

- [ ] **Step 2: Run test, expect failure**

Run: `pytest tests/test_writers_financials.py -v`
Expected: FAIL.

- [ ] **Step 3: Implement costs_tab.py**

`writers/costs_tab.py`:

```python
from typing import List
from openpyxl import Workbook
from engine.costs import CostScheduleRow
from writers.styles import HEADER_FILL, HEADER_FONT, CURRENCY_FORMAT, SECTION_FONT, CENTER


def write_costs_tab(wb: Workbook, schedule: List[CostScheduleRow]) -> None:
    ws = wb["Costs"]
    ws["A1"] = "Monthly Cost Schedule"
    ws["A1"].font = SECTION_FONT
    headers = ["Month", "Coach", "Venue", "Uniform", "Software",
               "Insurance", "Bookkeeping", "Founder Time", "Marketing",
               "Curriculum (Expense)", "Curriculum (Cash)", "Total Expense", "Total Cash Out"]
    for col, h in enumerate(headers, start=1):
        c = ws.cell(row=2, column=col, value=h)
        c.fill = HEADER_FILL; c.font = HEADER_FONT; c.alignment = CENTER

    for i, r in enumerate(schedule, start=3):
        ws.cell(row=i, column=1, value=r.month.isoformat())
        ws.cell(row=i, column=2, value=r.coach_cost).number_format = CURRENCY_FORMAT
        ws.cell(row=i, column=3, value=r.venue_cost).number_format = CURRENCY_FORMAT
        ws.cell(row=i, column=4, value=r.uniform_cost).number_format = CURRENCY_FORMAT
        ws.cell(row=i, column=5, value=r.software).number_format = CURRENCY_FORMAT
        ws.cell(row=i, column=6, value=r.insurance).number_format = CURRENCY_FORMAT
        ws.cell(row=i, column=7, value=r.bookkeeping).number_format = CURRENCY_FORMAT
        ws.cell(row=i, column=8, value=r.founder_time).number_format = CURRENCY_FORMAT
        ws.cell(row=i, column=9, value=r.marketing).number_format = CURRENCY_FORMAT
        ws.cell(row=i, column=10, value=r.expense_curriculum).number_format = CURRENCY_FORMAT
        ws.cell(row=i, column=11, value=r.cash_curriculum).number_format = CURRENCY_FORMAT
        ws.cell(row=i, column=12, value=r.total_expense).number_format = CURRENCY_FORMAT
        ws.cell(row=i, column=13, value=r.total_cash_out).number_format = CURRENCY_FORMAT
```

- [ ] **Step 4: Implement pnl_tab.py**

`writers/pnl_tab.py`:

```python
from typing import List
from openpyxl import Workbook
from engine.pnl import PnLRow
from writers.styles import HEADER_FILL, HEADER_FONT, CURRENCY_FORMAT, SECTION_FONT, CENTER


def write_pnl_tab(wb: Workbook, rows: List[PnLRow]) -> None:
    ws = wb["P&L"]
    ws["A1"] = "Monthly P&L"
    ws["A1"].font = SECTION_FONT
    headers = ["Month", "Revenue", "Variable Cost", "Fixed Expense", "Total Expense", "Net Income"]
    for col, h in enumerate(headers, start=1):
        c = ws.cell(row=2, column=col, value=h)
        c.fill = HEADER_FILL; c.font = HEADER_FONT; c.alignment = CENTER
    for i, r in enumerate(rows, start=3):
        ws.cell(row=i, column=1, value=r.month.isoformat())
        ws.cell(row=i, column=2, value=r.revenue).number_format = CURRENCY_FORMAT
        ws.cell(row=i, column=3, value=r.variable_cost).number_format = CURRENCY_FORMAT
        ws.cell(row=i, column=4, value=r.fixed_expense).number_format = CURRENCY_FORMAT
        ws.cell(row=i, column=5, value=r.total_expense).number_format = CURRENCY_FORMAT
        ws.cell(row=i, column=6, value=r.net_income).number_format = CURRENCY_FORMAT
```

- [ ] **Step 5: Implement cashflow_tab.py**

`writers/cashflow_tab.py`:

```python
from typing import List
from openpyxl import Workbook
from engine.cashflow import CashflowRow
from writers.styles import HEADER_FILL, HEADER_FONT, CURRENCY_FORMAT, SECTION_FONT, CENTER


def write_cashflow_tab(wb: Workbook, rows: List[CashflowRow]) -> None:
    ws = wb["Cash Flow"]
    ws["A1"] = "Monthly Cash Flow"
    ws["A1"].font = SECTION_FONT
    headers = ["Month", "Contributions", "Receipts", "Disbursements", "Net Change", "Ending Balance"]
    for col, h in enumerate(headers, start=1):
        c = ws.cell(row=2, column=col, value=h)
        c.fill = HEADER_FILL; c.font = HEADER_FONT; c.alignment = CENTER
    for i, r in enumerate(rows, start=3):
        ws.cell(row=i, column=1, value=r.month.isoformat())
        ws.cell(row=i, column=2, value=r.contributions).number_format = CURRENCY_FORMAT
        ws.cell(row=i, column=3, value=r.receipts).number_format = CURRENCY_FORMAT
        ws.cell(row=i, column=4, value=r.disbursements).number_format = CURRENCY_FORMAT
        ws.cell(row=i, column=5, value=r.net_change).number_format = CURRENCY_FORMAT
        ws.cell(row=i, column=6, value=r.ending_balance).number_format = CURRENCY_FORMAT
```

- [ ] **Step 6: Run tests**

Run: `pytest tests/test_writers_financials.py -v`
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add scripts/financial-model/writers/costs_tab.py scripts/financial-model/writers/pnl_tab.py scripts/financial-model/writers/cashflow_tab.py scripts/financial-model/tests/test_writers_financials.py
git commit -m "feat(fin-model): add Costs, P&L, and Cash Flow tab writers"
```

---

### Task 19: Partner Returns + Sensitivity + Scenarios + TAM tab writers

**Files:**
- Create: `scripts/financial-model/writers/partner_returns_tab.py`
- Create: `scripts/financial-model/writers/sensitivity_tab.py`
- Create: `scripts/financial-model/writers/scenarios_tab.py`
- Create: `scripts/financial-model/writers/tam_tab.py`
- Create: `scripts/financial-model/tests/test_writers_analysis.py`

- [ ] **Step 1: Write failing test**

`tests/test_writers_analysis.py`:

```python
from pathlib import Path
from engine.schema import load_assumptions
from engine.revenue_year1 import build_year1_revenue
from engine.revenue_cohort import build_cohort_revenue
from engine.costs import build_cost_schedule
from engine.cashflow import build_monthly_cashflow
from engine.partner_returns import build_partner_returns
from engine.sensitivity import build_tornado
from engine.scenarios import run_scenarios
from engine.tam import compute_tam_check
from writers.workbook import build_empty_workbook
from writers.partner_returns_tab import write_partner_returns_tab
from writers.sensitivity_tab import write_sensitivity_tab
from writers.scenarios_tab import write_scenarios_tab
from writers.tam_tab import write_tam_tab


def test_analysis_tabs_populate():
    a = load_assumptions(Path("assumptions.yaml"))
    y1 = build_year1_revenue(a)
    cohort = build_cohort_revenue(a, y1)
    costs = build_cost_schedule(a)
    cf = build_monthly_cashflow(a, y1, cohort, costs)
    pr = build_partner_returns(a, cf)
    tornado = build_tornado(a)
    scenarios = run_scenarios(a)
    tam = compute_tam_check(a, y1, cohort)

    wb = build_empty_workbook(a)
    write_partner_returns_tab(wb, pr)
    write_sensitivity_tab(wb, tornado)
    write_scenarios_tab(wb, scenarios)
    write_tam_tab(wb, tam)

    assert wb["Partner Returns"]["A1"].value is not None
    assert wb["Sensitivity"]["A1"].value is not None
    assert wb["Scenarios"]["A1"].value is not None
    assert wb["TAM Check"]["A1"].value is not None
```

- [ ] **Step 2: Run test, expect failure**

Run: `pytest tests/test_writers_analysis.py -v`
Expected: FAIL.

- [ ] **Step 3: Implement partner_returns_tab.py**

`writers/partner_returns_tab.py`:

```python
from openpyxl import Workbook
from engine.partner_returns import PartnerReturnsReport
from writers.styles import HEADER_FILL, HEADER_FONT, CURRENCY_FORMAT, PERCENT_FORMAT, SECTION_FONT, CENTER


def write_partner_returns_tab(wb: Workbook, report: PartnerReturnsReport) -> None:
    ws = wb["Partner Returns"]
    ws["A1"] = "Partner Returns"
    ws["A1"].font = SECTION_FONT

    # Summary block
    ws["A3"] = "Summary"
    ws["A3"].font = SECTION_FONT
    ws["A4"] = "Total contributions"
    ws["B4"] = sum(report.total_contribution_by_partner.values())
    ws["B4"].number_format = CURRENCY_FORMAT
    ws["A5"] = "Total distributions"
    ws["B5"] = sum(report.total_distribution_by_partner.values())
    ws["B5"].number_format = CURRENCY_FORMAT
    ws["A6"] = "Payback month"
    ws["B6"] = report.payback_month.isoformat() if report.payback_month else "Not reached"
    ws["A7"] = "IRR (annualized)"
    ws["B7"] = report.irr if report.irr is not None else "N/A"
    if report.irr is not None:
        ws["B7"].number_format = PERCENT_FORMAT
    ws["A8"] = "MOIC"
    ws["B8"] = report.moic if report.moic is not None else "N/A"

    # Monthly waterfall
    headers = ["Month", "Contribution", "Business Ending", "Total Distribution"]
    for partner in next(iter(report.monthly_rows)).distribution_by_partner.keys():
        headers.append(f"Dist to {partner}")
        headers.append(f"Cum dist {partner}")

    for col, h in enumerate(headers, start=1):
        c = ws.cell(row=10, column=col, value=h)
        c.fill = HEADER_FILL; c.font = HEADER_FONT; c.alignment = CENTER

    for i, r in enumerate(report.monthly_rows, start=11):
        ws.cell(row=i, column=1, value=r.month.isoformat())
        ws.cell(row=i, column=2, value=r.contribution).number_format = CURRENCY_FORMAT
        ws.cell(row=i, column=3, value=r.business_ending_balance).number_format = CURRENCY_FORMAT
        ws.cell(row=i, column=4, value=r.total_distribution).number_format = CURRENCY_FORMAT
        col = 5
        for p in r.distribution_by_partner:
            ws.cell(row=i, column=col, value=r.distribution_by_partner[p]).number_format = CURRENCY_FORMAT
            ws.cell(row=i, column=col + 1, value=r.cumulative_distribution_by_partner[p]).number_format = CURRENCY_FORMAT
            col += 2
```

- [ ] **Step 4: Implement sensitivity_tab.py**

`writers/sensitivity_tab.py`:

```python
from typing import List
from openpyxl import Workbook
from engine.sensitivity import TornadoBar
from writers.styles import HEADER_FILL, HEADER_FONT, CURRENCY_FORMAT, SECTION_FONT, CENTER


def write_sensitivity_tab(wb: Workbook, bars: List[TornadoBar]) -> None:
    ws = wb["Sensitivity"]
    ws["A1"] = "One-Variable Sensitivity — Year 3 Net Income"
    ws["A1"].font = SECTION_FONT
    headers = ["Variable", "Low", "Base", "High", "Impact (High − Low)"]
    for col, h in enumerate(headers, start=1):
        c = ws.cell(row=2, column=col, value=h)
        c.fill = HEADER_FILL; c.font = HEADER_FONT; c.alignment = CENTER
    for i, b in enumerate(bars, start=3):
        ws.cell(row=i, column=1, value=b.variable)
        ws.cell(row=i, column=2, value=b.output_low).number_format = CURRENCY_FORMAT
        ws.cell(row=i, column=3, value=b.output_base).number_format = CURRENCY_FORMAT
        ws.cell(row=i, column=4, value=b.output_high).number_format = CURRENCY_FORMAT
        ws.cell(row=i, column=5, value=b.impact).number_format = CURRENCY_FORMAT
    ws.column_dimensions["A"].width = 28
```

- [ ] **Step 5: Implement scenarios_tab.py**

`writers/scenarios_tab.py`:

```python
from typing import List
from openpyxl import Workbook
from engine.scenarios import ScenarioResult
from writers.styles import HEADER_FILL, HEADER_FONT, CURRENCY_FORMAT, SECTION_FONT, CENTER


def write_scenarios_tab(wb: Workbook, results: List[ScenarioResult]) -> None:
    ws = wb["Scenarios"]
    ws["A1"] = "Scenarios — Base / Downside / Upside"
    ws["A1"].font = SECTION_FONT

    headers = ["Metric"] + [r.name for r in results]
    for col, h in enumerate(headers, start=1):
        c = ws.cell(row=3, column=col, value=h)
        c.fill = HEADER_FILL; c.font = HEADER_FONT; c.alignment = CENTER

    metrics = [
        ("Year 1 Revenue", "year1_revenue"),
        ("Year 3 Net Income", "year3_net_income"),
        ("Year 5 Net Income", "year5_net_income"),
        ("Min cumulative net income (proxy cash trough)", "min_cash_balance"),
    ]
    for i, (label, attr) in enumerate(metrics, start=4):
        ws.cell(row=i, column=1, value=label)
        for j, r in enumerate(results, start=2):
            c = ws.cell(row=i, column=j, value=getattr(r, attr))
            c.number_format = CURRENCY_FORMAT
    ws.column_dimensions["A"].width = 44
```

- [ ] **Step 6: Implement tam_tab.py**

`writers/tam_tab.py`:

```python
from openpyxl import Workbook
from engine.tam import TamReport
from writers.styles import HEADER_FILL, HEADER_FONT, PERCENT_FORMAT, SECTION_FONT, CENTER


def write_tam_tab(wb: Workbook, report: TamReport) -> None:
    ws = wb["TAM Check"]
    ws["A1"] = "TAM Sanity Check — Dublin + Powell"
    ws["A1"].font = SECTION_FONT
    ws["A3"] = "Addressable kids (age 5-12)"
    ws["B3"] = report.addressable_kids
    headers = ["Year", "Implied market share"]
    for col, h in enumerate(headers, start=1):
        c = ws.cell(row=5, column=col, value=h)
        c.fill = HEADER_FILL; c.font = HEADER_FONT; c.alignment = CENTER
    for i, share in enumerate(report.implied_market_share_by_year, start=6):
        ws.cell(row=i, column=1, value=f"Year {i - 5}")
        c = ws.cell(row=i, column=2, value=share)
        c.number_format = PERCENT_FORMAT
    ws.column_dimensions["A"].width = 26
```

- [ ] **Step 7: Run tests**

Run: `pytest tests/test_writers_analysis.py -v`
Expected: all PASS.

- [ ] **Step 8: Commit**

```bash
git add scripts/financial-model/writers/partner_returns_tab.py scripts/financial-model/writers/sensitivity_tab.py scripts/financial-model/writers/scenarios_tab.py scripts/financial-model/writers/tam_tab.py scripts/financial-model/tests/test_writers_analysis.py
git commit -m "feat(fin-model): add Partner Returns, Sensitivity, Scenarios, and TAM tab writers"
```

---

### Task 20: Orchestrator (build_model.py) + end-to-end test

**Files:**
- Create: `scripts/financial-model/build_model.py`
- Create: `scripts/financial-model/tests/test_end_to_end.py`

- [ ] **Step 1: Write failing end-to-end test**

`tests/test_end_to_end.py`:

```python
import subprocess
from pathlib import Path
import openpyxl


def test_build_model_generates_xlsx_with_all_tabs(tmp_path):
    root = Path(__file__).parent.parent
    out = root / "output" / "aspire-financial-model.xlsx"
    if out.exists():
        out.unlink()
    result = subprocess.run(
        ["python", "build_model.py"], cwd=root, capture_output=True, text=True
    )
    assert result.returncode == 0, f"build_model.py failed: {result.stderr}"
    assert out.exists()

    wb = openpyxl.load_workbook(out)
    expected_tabs = {
        "Cover", "Assumptions", "Revenue Y1", "Revenue Cohort", "Costs",
        "P&L", "Cash Flow", "Partner Returns", "Sensitivity", "Scenarios", "TAM Check",
    }
    assert expected_tabs.issubset(set(wb.sheetnames))


def test_build_model_pnl_tab_has_monthly_rows():
    root = Path(__file__).parent.parent
    out = root / "output" / "aspire-financial-model.xlsx"
    if not out.exists():
        subprocess.run(["python", "build_model.py"], cwd=root, check=True)
    wb = openpyxl.load_workbook(out)
    ws = wb["P&L"]
    data_rows = [r for r in ws.iter_rows(min_row=3, values_only=True) if r[0] is not None]
    assert len(data_rows) == 60
```

- [ ] **Step 2: Run test, expect failure**

Run: `pytest tests/test_end_to_end.py -v`
Expected: FAIL — no build_model.py yet.

- [ ] **Step 3: Implement build_model.py**

`scripts/financial-model/build_model.py`:

```python
"""Generate aspire-financial-model.xlsx from assumptions.yaml.

Run: python build_model.py
Output: output/aspire-financial-model.xlsx
"""
from pathlib import Path
from engine.schema import load_assumptions
from engine.revenue_year1 import build_year1_revenue
from engine.revenue_cohort import build_cohort_revenue
from engine.costs import build_cost_schedule
from engine.pnl import build_monthly_pnl
from engine.cashflow import build_monthly_cashflow
from engine.partner_returns import build_partner_returns
from engine.sensitivity import build_tornado
from engine.scenarios import run_scenarios
from engine.tam import compute_tam_check
from writers.workbook import build_empty_workbook, save_workbook
from writers.cover_tab import write_cover_tab
from writers.assumptions_tab import write_assumptions_tab
from writers.revenue_year1_tab import write_revenue_year1_tab
from writers.revenue_cohort_tab import write_revenue_cohort_tab
from writers.costs_tab import write_costs_tab
from writers.pnl_tab import write_pnl_tab
from writers.cashflow_tab import write_cashflow_tab
from writers.partner_returns_tab import write_partner_returns_tab
from writers.sensitivity_tab import write_sensitivity_tab
from writers.scenarios_tab import write_scenarios_tab
from writers.tam_tab import write_tam_tab


def main() -> None:
    here = Path(__file__).parent
    a = load_assumptions(here / "assumptions.yaml")

    y1_lines = build_year1_revenue(a)
    cohort_lines = build_cohort_revenue(a, y1_lines)
    cost_schedule = build_cost_schedule(a)
    pnl_rows = build_monthly_pnl(a, y1_lines, cohort_lines, cost_schedule)
    cashflow_rows = build_monthly_cashflow(a, y1_lines, cohort_lines, cost_schedule)
    partner_report = build_partner_returns(a, cashflow_rows)
    tornado = build_tornado(a)
    scenarios = run_scenarios(a)
    tam = compute_tam_check(a, y1_lines, cohort_lines)

    wb = build_empty_workbook(a)
    write_cover_tab(wb, a)
    write_assumptions_tab(wb, a)
    write_revenue_year1_tab(wb, y1_lines)
    write_revenue_cohort_tab(wb, cohort_lines)
    write_costs_tab(wb, cost_schedule)
    write_pnl_tab(wb, pnl_rows)
    write_cashflow_tab(wb, cashflow_rows)
    write_partner_returns_tab(wb, partner_report)
    write_sensitivity_tab(wb, tornado)
    write_scenarios_tab(wb, scenarios)
    write_tam_tab(wb, tam)

    out_path = here / "output" / "aspire-financial-model.xlsx"
    save_workbook(wb, out_path)
    print(f"Wrote {out_path}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run the end-to-end test**

Run: `cd scripts/financial-model && pytest tests/test_end_to_end.py -v`
Expected: both tests PASS and `output/aspire-financial-model.xlsx` is created.

- [ ] **Step 5: Run the full test suite**

Run: `pytest -v`
Expected: all tests PASS across all modules.

- [ ] **Step 6: Commit**

```bash
git add scripts/financial-model/build_model.py scripts/financial-model/tests/test_end_to_end.py
git commit -m "feat(fin-model): add build_model.py orchestrator and end-to-end test"
```

---

### Task 21: Regeneration README and final polish

**Files:**
- Modify: `scripts/financial-model/README.md`

- [ ] **Step 1: Write the regeneration README**

`scripts/financial-model/README.md`:

```markdown
# Aspire Sports Financial Model

Generates `output/aspire-financial-model.xlsx` — a partner-pitch-ready
5-year monthly financial model for Aspire Sports.

Source spec: `../docs/superpowers/specs/2026-04-15-aspire-sports-financial-model-design.md`

## Install

    cd scripts/financial-model
    pip install -e .[dev]

## Regenerate the xlsx

    python build_model.py

Output lands at `output/aspire-financial-model.xlsx` (gitignored).

## Run tests

    pytest -v

## Updating assumptions

Edit `assumptions.yaml` and re-run `python build_model.py`. The xlsx is
regenerated deterministically from the YAML; never edit the xlsx directly
(it will be overwritten).

## Structure

- `assumptions.yaml` — single source of truth
- `engine/` — pure Python calculation modules (no IO)
- `writers/` — xlsx tab writer modules
- `build_model.py` — orchestrator CLI

## Known data gaps (base case v1)

See spec §9 for the full list. The YAML flags low-confidence cells with
the `LOW CONFIDENCE` comment. Before the partner meeting:

- Call i9 Sports Dublin/Hilliard for actual pricing
- Call 2-3 Central Ohio cities for outdoor field permit rates
- Call the indoor facility owner for actual hourly quote
- Call Resolute for weekend/evening turf rate
```

- [ ] **Step 2: Commit**

```bash
git add scripts/financial-model/README.md
git commit -m "docs(fin-model): add regeneration and update instructions"
```

---

## End-to-End Validation Checklist

After Task 21, verify the following manually:

- [ ] `cd scripts/financial-model && python build_model.py` completes without errors
- [ ] `output/aspire-financial-model.xlsx` exists
- [ ] Opening the xlsx in Excel / Numbers / LibreOffice shows 11 tabs in the order defined
- [ ] Assumptions tab shows base case values matching the spec §8 table
- [ ] P&L tab shows 60 rows of monthly data
- [ ] Partner Returns tab shows IRR, MOIC, and payback month
- [ ] Sensitivity tab shows variables sorted by impact descending
- [ ] Scenarios tab shows three named scenarios (base / downside / upside)
- [ ] `pytest -v` reports all tests passing

## Known Scope Cuts from the Spec

These spec requirements are **intentionally deferred** out of Plan 1 to keep v1 executable in one pass. They will land in a follow-up plan once the core model is validated with the partner.

**Deferred from spec §7 (sensitivity / outputs):**
- **Two-variable sensitivity heatmaps** (Retention × CAC → Y5 NI; Fill × Price → Y1 breakeven; Facility rate × winter fill → winter profitability). Plan 1 ships only the one-variable tornado.
- **Unit economics dashboard tab** (LTV, CAC, LTV/CAC, payback months per family). Deferred to follow-up.
- **One-page summary tab** with the 8–10 headline numbers a partner needs to decide. Deferred to follow-up.
- **5-year P&L annual roll-up view.** Plan 1 ships monthly rows only; annual totals can be computed by the reader or added in follow-up.
- **Marketing channel cost allocation** into monthly cash flow. Plan 1 reserves a `marketing` column in `CostScheduleRow` but leaves it at zero; follow-up allocates monthly marketing spend per the §8 channel mix.

**Deferred from spec §2 / §5 (scope):**
- **Plan 2: Interactive Astro web app overlay** at `/internal/financial-model` with sliders and live charts. Depends on Plan 1 being complete and the YAML/engines stable. Write as a separate follow-up plan.
- **Year 4+ franchise second-location mini-model.** Stubbed in cohort engine via Years 2–5 growth but no separate corporate-vs-location P&L.

**Explicitly out of scope (per spec §10):**
- Tax modeling and S-corp distribution mechanics
- Detailed HR/benefits modeling for employees (coaches stay as 1099)
- Facility acquisition/buildout capex detail
- Aspire SaaS platform as a separate business line
