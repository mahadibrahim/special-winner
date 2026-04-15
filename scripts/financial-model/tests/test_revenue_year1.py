from datetime import date
from pathlib import Path
from engine.schema import load_assumptions
from engine.revenue_year1 import (
    compute_season_revenue,
    build_year1_revenue,
    Year1RevenueLine,
)


def test_compute_season_revenue_soccer_fall_2026():
    """Base case: 9 soccer teams (4 U8 + 3 U10 + 2 U12), 12 kids/team, 65% fill (premium).
    kids = int(9 * 12 * 0.65) = 70. Gross = 70 * $215 = $15,050.
    After sibling discount + processing, net < gross but > 92% of gross.
    """
    a = load_assumptions(Path("assumptions.yaml"))
    line = compute_season_revenue(
        assumptions=a,
        sport="soccer",
        season="fall",
        season_year=2026,
    )
    assert isinstance(line, Year1RevenueLine)
    assert line.kids_registered == 70      # int(9 × 12 × 0.65)
    assert line.gross_revenue == 70 * 215
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
    # 8 flag teams (3+3+2) × 10 kids × 0.65 = 52
    assert line.kids_registered == 52
    assert line.gross_revenue == 52 * 215


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
