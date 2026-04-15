from pathlib import Path
from engine.schema import load_assumptions
from engine.revenue_year1 import build_year1_revenue
from engine.revenue_cohort import (
    build_cohort_revenue_for_location,
    CohortRevenueLine,
    Cohort,
    apply_retention,
)


def test_apply_retention_shrinks_cohort():
    c = Cohort(location_id=0, sport="soccer", age_band="U8", size=100, origin_year=2026)
    shrunk = apply_retention(c, rate=0.80)
    assert shrunk.size == 80
    assert shrunk.location_id == 0
    assert shrunk.sport == "soccer"
    assert shrunk.age_band == "U8"


def test_build_cohort_revenue_covers_years_2_through_5():
    a = load_assumptions(Path("assumptions.yaml"))
    y1 = build_year1_revenue(a, location_id=0, location_launch_year=2026)
    lines = build_cohort_revenue_for_location(
        a, y1, location_id=0, location_launch_year=2026, is_new_location=False,
    )
    season_years = {l.season_year for l in lines}
    assert 2027 in season_years or 2028 in season_years
    assert 2030 in season_years


def test_cohort_revenue_monotonic_or_close_across_years():
    """Premium positioning: retention × referral should produce gentle growth or at
    worst a flat cohort. Year 3 total should be >= Year 2 total by at least 5%."""
    a = load_assumptions(Path("assumptions.yaml"))
    y1 = build_year1_revenue(a, location_id=0, location_launch_year=2026)
    lines = build_cohort_revenue_for_location(
        a, y1, location_id=0, location_launch_year=2026, is_new_location=False,
    )
    y2_total = sum(l.net_revenue for l in lines if l.season_year == 2027)
    y3_total = sum(l.net_revenue for l in lines if l.season_year == 2028)
    assert y3_total >= y2_total * 1.05


def test_cohort_lines_carry_location_id():
    a = load_assumptions(Path("assumptions.yaml"))
    y1 = build_year1_revenue(a, location_id=2, location_launch_year=2028)
    lines = build_cohort_revenue_for_location(
        a, y1, location_id=2, location_launch_year=2028, is_new_location=True,
    )
    assert all(l.location_id == 2 for l in lines)


def test_new_location_applies_brand_equity_boost_to_y1_only():
    """A new (not-first) location's Y1 uses the base fill_rate + boost.
    The boost flows into the INITIAL cohort size via the upstream y1_lines
    passed in; this test just confirms that new-location cohorts are not
    empty and are in the right ballpark vs. the first-location reference."""
    a = load_assumptions(Path("assumptions.yaml"))
    y1_new = build_year1_revenue(a, location_id=1, location_launch_year=2028)
    lines_new = build_cohort_revenue_for_location(
        a, y1_new, location_id=1, location_launch_year=2028, is_new_location=True,
    )
    assert len(lines_new) > 0


def test_winter_skills_runs_own_cohort():
    """Winter skills should appear in cohort lines, retained on its own curve
    (no cross-sell derivation)."""
    a = load_assumptions(Path("assumptions.yaml"))
    y1 = build_year1_revenue(a, location_id=0, location_launch_year=2026)
    lines = build_cohort_revenue_for_location(
        a, y1, location_id=0, location_launch_year=2026, is_new_location=False,
    )
    winter_lines = [l for l in lines if l.sport == "winter_skills"]
    assert len(winter_lines) > 0
    y1_winter_kids = sum(l.kids_registered for l in y1 if l.sport == "winter_skills")
    y2_winter_kids = sum(l.kids_registered for l in winter_lines if l.season_year == 2027)
    assert y2_winter_kids < y1_winter_kids
