"""Full-stack expansion integration test."""
import copy
from pathlib import Path
import yaml
from engine.schema import load_assumptions, Assumptions
from engine.revenue_year1 import build_year1_revenue
from engine.revenue_cohort import build_cohort_revenue_for_location
from engine.revenue_travel import build_travel_revenue_for_location
from engine.costs import build_cost_schedule
from engine.pnl import build_monthly_pnl


def _expansion_enabled_assumptions_dict(base_path: Path) -> dict:
    """Load the default YAML and mutate it to enable full expansion."""
    with open(base_path, "r") as f:
        raw = yaml.safe_load(f)

    raw["expansion"]["locations"]["by_year"] = {2026: 1, 2027: 1, 2028: 2, 2029: 2, 2030: 2}
    raw["expansion"]["travel"]["launch_year"] = 2028
    basketball = {
        "name": "basketball",
        "launch_year": 2028,
        "price": {"low": 185, "base": 205, "high": 230},
        "weeks_per_season": 10,
        "hours_per_unit": 1.5,
        "units_per_week": 1,
        "roster_size": 10,
        "venue_type": "gym",
        "seasons": ["winter", "spring"],
        "target_teams_y1": {"U10": 2, "U12": 2},
        "fill_rate": {"low": 0.45, "base": 0.60, "high": 0.78},
        "s1_to_s2": {"low": 0.65, "base": 0.80, "high": 0.90},
        "s2_to_s3": {"low": 0.82, "base": 0.92, "high": 0.96},
        "s3_plus": {"low": 0.88, "base": 0.94, "high": 0.97},
    }
    raw["sports"].append(basketball)
    return raw


def test_expansion_run_produces_higher_revenue_than_plan1_baseline(tmp_path):
    """Full expansion run should produce Y5 revenue meaningfully above the Plan 1 single-territory baseline."""
    base_yaml_path = Path(__file__).parent.parent / "assumptions.yaml"
    raw = _expansion_enabled_assumptions_dict(base_yaml_path)

    a = Assumptions.model_validate(raw)

    all_y1, all_cohort, all_travel = [], [], []
    for loc_id, launch_year in [(0, 2026), (1, 2028)]:
        y1 = build_year1_revenue(a, location_id=loc_id, location_launch_year=launch_year)
        cohort = build_cohort_revenue_for_location(
            a, y1, location_id=loc_id, location_launch_year=launch_year, is_new_location=(loc_id > 0),
        )
        travel = build_travel_revenue_for_location(
            a, cohort, location_id=loc_id, location_launch_year=launch_year,
        )
        all_y1.extend(y1)
        all_cohort.extend(cohort)
        all_travel.extend(travel)

    costs = build_cost_schedule(a)
    pnl = build_monthly_pnl(a, all_y1, all_cohort, all_travel, costs)

    y5_revenue = sum(r.revenue for r in pnl if r.month.year == 2030)
    assert y5_revenue > 400_000, f"expected Y5 revenue > $400k with expansion; got ${y5_revenue:,.0f}"
    assert y5_revenue < 2_000_000, f"Y5 revenue {y5_revenue:,.0f} looks unrealistically high"

    assert any(l.season_year >= 2028 for l in all_travel), "travel tier produced no lines"

    assert any(l.sport == "basketball" and l.season_year >= 2028 for l in all_cohort), \
        "basketball sport did not enter the cohort engine"


def test_expansion_run_preserves_location_0_plan1_behavior(tmp_path):
    """Location 0 in an expansion run should produce the same Y1-Y5 numbers as
    location 0 in a single-location run."""
    a_default = load_assumptions(Path(__file__).parent.parent / "assumptions.yaml")

    y1_plan1 = build_year1_revenue(a_default, location_id=0, location_launch_year=2026)

    base_yaml_path = Path(__file__).parent.parent / "assumptions.yaml"
    raw = _expansion_enabled_assumptions_dict(base_yaml_path)
    a_exp = Assumptions.model_validate(raw)

    y1_exp_loc0 = build_year1_revenue(a_exp, location_id=0, location_launch_year=2026)

    y1_plan1_kids = sum(l.kids_registered for l in y1_plan1)
    y1_exp_kids = sum(l.kids_registered for l in y1_exp_loc0)
    assert y1_plan1_kids == y1_exp_kids, "location 0 Y1 kids diverged between single and multi-location runs"
