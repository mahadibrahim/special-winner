from pathlib import Path
from engine.schema import load_assumptions
from engine.revenue_year1 import build_year1_revenue
from engine.revenue_cohort import build_cohort_revenue_for_location
from engine.revenue_travel import (
    build_travel_revenue_for_location,
    TravelRevenueLine,
    ELIGIBLE_BANDS_FOR_UPGRADE,
)


def _tweak_travel_launch(a, year: int):
    a.expansion.travel.launch_year = year
    return a


def test_travel_disabled_returns_empty():
    """When travel.launch_year is pushed beyond horizon, engine returns no lines."""
    a = load_assumptions(Path("assumptions.yaml"))
    a = _tweak_travel_launch(a, 2099)  # Force disable
    y1 = build_year1_revenue(a, location_id=0, location_launch_year=2026)
    cohort = build_cohort_revenue_for_location(
        a, y1, location_id=0, location_launch_year=2026, is_new_location=False,
    )
    lines = build_travel_revenue_for_location(
        a, cohort, location_id=0, location_launch_year=2026,
    )
    assert lines == []


def test_travel_direct_stream_produces_expected_kids():
    a = load_assumptions(Path("assumptions.yaml"))
    a = _tweak_travel_launch(a, 2028)
    y1 = build_year1_revenue(a, location_id=0, location_launch_year=2026)
    cohort = build_cohort_revenue_for_location(
        a, y1, location_id=0, location_launch_year=2026, is_new_location=False,
    )
    lines = build_travel_revenue_for_location(
        a, cohort, location_id=0, location_launch_year=2026,
    )

    assert len(lines) > 0
    direct_y1 = [l for l in lines if l.origin_channel == "direct" and l.season_year == 2028]
    assert len(direct_y1) > 0
    total_direct_y1 = sum(l.kids_registered for l in direct_y1)
    assert total_direct_y1 == int(3 * 11 * 0.65)


def test_travel_upgrade_stream_pulls_from_eligible_rec_bands():
    a = load_assumptions(Path("assumptions.yaml"))
    a = _tweak_travel_launch(a, 2028)
    y1 = build_year1_revenue(a, location_id=0, location_launch_year=2026)
    cohort = build_cohort_revenue_for_location(
        a, y1, location_id=0, location_launch_year=2026, is_new_location=False,
    )
    lines = build_travel_revenue_for_location(
        a, cohort, location_id=0, location_launch_year=2026,
    )
    upgrade_lines = [l for l in lines if l.origin_channel == "upgrade"]
    assert len(upgrade_lines) > 0


def test_travel_eligibility_hardcoded_mapping():
    assert "U10" in ELIGIBLE_BANDS_FOR_UPGRADE["soccer"]
    assert "U12" in ELIGIBLE_BANDS_FOR_UPGRADE["soccer"]
    assert "U8" not in ELIGIBLE_BANDS_FOR_UPGRADE["soccer"]
    assert "3-4" in ELIGIBLE_BANDS_FOR_UPGRADE["flag"]
    assert "5-6" in ELIGIBLE_BANDS_FOR_UPGRADE["flag"]
    assert "K-2" not in ELIGIBLE_BANDS_FOR_UPGRADE["flag"]


def test_travel_cohort_retains_over_years():
    a = load_assumptions(Path("assumptions.yaml"))
    a = _tweak_travel_launch(a, 2028)
    y1 = build_year1_revenue(a, location_id=0, location_launch_year=2026)
    cohort = build_cohort_revenue_for_location(
        a, y1, location_id=0, location_launch_year=2026, is_new_location=False,
    )
    lines = build_travel_revenue_for_location(
        a, cohort, location_id=0, location_launch_year=2026,
    )
    y28_kids = sum(l.kids_registered for l in lines if l.season_year == 2028)
    y29_kids = sum(l.kids_registered for l in lines if l.season_year == 2029)
    assert y29_kids >= y28_kids * 0.9
