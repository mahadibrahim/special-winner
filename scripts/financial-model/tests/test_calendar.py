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
