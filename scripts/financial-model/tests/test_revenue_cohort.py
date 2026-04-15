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
