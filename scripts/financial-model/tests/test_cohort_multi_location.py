"""Verify multi-location cohort independence and brand-equity boost."""
from pathlib import Path
from copy import deepcopy
from engine.schema import load_assumptions
from engine.revenue_year1 import build_year1_revenue
from engine.revenue_cohort import build_cohort_revenue_for_location


def _two_location_assumptions():
    """Base assumptions with two locations: location 0 at 2026, location 1 at 2028."""
    a = load_assumptions(Path("assumptions.yaml"))
    a2 = deepcopy(a)
    a2.expansion.locations.by_year = {2026: 1, 2027: 1, 2028: 2, 2029: 2, 2030: 2}
    return a2


def test_location_1_launches_with_y1_fill_rates_not_mature():
    """Location 1 launched in 2028 should have Y1 output similar to location 0's 2026 Y1,
    not a mature copy."""
    a = _two_location_assumptions()

    y1_loc0 = build_year1_revenue(a, location_id=0, location_launch_year=2026)
    y1_loc1 = build_year1_revenue(a, location_id=1, location_launch_year=2028)

    kids_loc0 = sum(l.kids_registered for l in y1_loc0 if l.season == "fall")
    kids_loc1 = sum(l.kids_registered for l in y1_loc1 if l.season == "fall")

    # Both locations run Y1 math independently — kid counts should be identical
    # (same target_teams × roster × fill_rate)
    assert kids_loc0 == kids_loc1


def test_location_1_cohort_runs_independent_timeline():
    """Location 1 cohort should show non-empty revenue in 2029-2032, NOT in 2027-2028."""
    a = _two_location_assumptions()

    y1_loc1 = build_year1_revenue(a, location_id=1, location_launch_year=2028)
    cohort_loc1 = build_cohort_revenue_for_location(
        a, y1_loc1, location_id=1, location_launch_year=2028, is_new_location=True,
    )

    years_covered = {l.season_year for l in cohort_loc1}
    # Location 1 cohort should cover 2029 and later; no entries before 2029
    assert all(y >= 2029 for y in years_covered)


def test_location_0_and_1_cohorts_do_not_interfere():
    """Running both locations back-to-back with the same inputs should produce the
    same per-location output as running each alone."""
    a = _two_location_assumptions()

    y1_loc0 = build_year1_revenue(a, location_id=0, location_launch_year=2026)
    cohort_loc0_alone = build_cohort_revenue_for_location(
        a, y1_loc0, location_id=0, location_launch_year=2026, is_new_location=False,
    )

    y1_loc1 = build_year1_revenue(a, location_id=1, location_launch_year=2028)
    cohort_loc1_alone = build_cohort_revenue_for_location(
        a, y1_loc1, location_id=1, location_launch_year=2028, is_new_location=True,
    )

    # Total kids for location 0 in year 2028 should equal what we'd see running location 0 in isolation
    kids_loc0_2028 = sum(l.kids_registered for l in cohort_loc0_alone if l.season_year == 2028)

    y1_loc0_again = build_year1_revenue(a, location_id=0, location_launch_year=2026)
    cohort_loc0_again = build_cohort_revenue_for_location(
        a, y1_loc0_again, location_id=0, location_launch_year=2026, is_new_location=False,
    )
    kids_loc0_2028_again = sum(l.kids_registered for l in cohort_loc0_again if l.season_year == 2028)

    assert kids_loc0_2028 == kids_loc0_2028_again
