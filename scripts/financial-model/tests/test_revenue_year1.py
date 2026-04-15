from datetime import date
from pathlib import Path
from engine.schema import load_assumptions
from engine.revenue_year1 import (
    compute_season_revenue_for_sport,
    build_year1_revenue,
    Year1RevenueLine,
)


def test_compute_season_revenue_soccer_fall_2026():
    """9 soccer teams × 12 × 0.65 fill = 70.2 exact; per-band rounding gives 69 kids. Gross = 69 × $215."""
    a = load_assumptions(Path("assumptions.yaml"))
    soccer = next(s for s in a.sports if s.name == "soccer")
    lines = compute_season_revenue_for_sport(
        a, soccer, season="fall", season_year=2026, location_id=0,
    )
    assert len(lines) == 3
    age_bands = {l.age_band for l in lines}
    assert age_bands == {"U8", "U10", "U12"}

    total_kids = sum(l.kids_registered for l in lines)
    assert total_kids == 69  # int(4×12×0.65) + int(3×12×0.65) + int(2×12×0.65) = 31 + 23 + 15

    total_gross = sum(l.gross_revenue for l in lines)
    assert total_gross == 69 * 215


def test_flag_fall_2026_with_age_bands():
    a = load_assumptions(Path("assumptions.yaml"))
    flag = next(s for s in a.sports if s.name == "flag")
    lines = compute_season_revenue_for_sport(
        a, flag, season="fall", season_year=2026, location_id=0,
    )
    assert len(lines) == 3  # K-2, 3-4, 5-6
    total_kids = sum(l.kids_registered for l in lines)
    assert total_kids == 51  # int(3×10×0.65) + int(3×10×0.65) + int(2×10×0.65) = 19 + 19 + 13


def test_winter_skills_single_mixed_band():
    a = load_assumptions(Path("assumptions.yaml"))
    ws = next(s for s in a.sports if s.name == "winter_skills")
    lines = compute_season_revenue_for_sport(
        a, ws, season="winter", season_year=2026, location_id=0,
    )
    assert len(lines) == 1
    assert lines[0].age_band == "mixed"
    assert lines[0].kids_registered == int(12 * 8 * 0.80)  # 76


def test_build_year1_revenue_returns_lines_for_all_active_sports():
    a = load_assumptions(Path("assumptions.yaml"))
    lines = build_year1_revenue(a, location_id=0, location_launch_year=2026)
    sports_covered = {l.sport for l in lines}
    assert sports_covered == {"soccer", "flag", "winter_skills"}

    # Fall soccer + fall flag + winter skills + spring soccer + spring flag
    # Each league has 3 age bands per season; winter has 1 band in 1 season.
    # Expected line count: 3 + 3 + 1 + 3 + 3 = 13
    assert len(lines) == 13


def test_cash_month_per_season():
    a = load_assumptions(Path("assumptions.yaml"))
    lines = build_year1_revenue(a, location_id=0, location_launch_year=2026)
    fall_soccer_lines = [l for l in lines if l.sport == "soccer" and l.season == "fall"]
    assert all(l.cash_month == date(2026, 7, 1) for l in fall_soccer_lines)


def test_spring_growth_rate_removed_from_schema_still_works_via_fill_rate():
    """Plan 1's season_growth_rate is gone; spring seasons now just reuse the
    same target_teams_y1. Growth comes from fill_rate improvements and the
    cohort engine (Y2+)."""
    a = load_assumptions(Path("assumptions.yaml"))
    lines = build_year1_revenue(a, location_id=0, location_launch_year=2026)
    fall_soccer = sum(l.kids_registered for l in lines if l.sport == "soccer" and l.season == "fall")
    spring_soccer = sum(l.kids_registered for l in lines if l.sport == "soccer" and l.season == "spring")
    assert spring_soccer == fall_soccer


def test_location_id_propagates_to_lines():
    a = load_assumptions(Path("assumptions.yaml"))
    lines = build_year1_revenue(a, location_id=3, location_launch_year=2028)
    assert all(l.location_id == 3 for l in lines)
