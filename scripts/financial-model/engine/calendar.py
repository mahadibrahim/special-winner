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

    Convention: cash lands ahead of the playing season.
    Fall 2026 → cash in July 2026 (2 months before Sep start).
    Winter 2026 → cash in November 2026 (1 month before Dec start).
    Spring 2027 → cash in January 2027 (3 months before Apr start).
    """
    first_month = season_months(season, year)[0]
    if season == "fall":
        return month_offset(first_month, -2)
    if season == "winter":
        return month_offset(first_month, -1)
    if season == "spring":
        return month_offset(first_month, -3)
    raise ValueError(f"Unknown season: {season}")
