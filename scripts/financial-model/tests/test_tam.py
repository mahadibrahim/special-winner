from pathlib import Path
from engine.schema import load_assumptions
from engine.revenue_year1 import build_year1_revenue
from engine.revenue_cohort import build_cohort_revenue_for_location
from engine.tam import compute_tam_check, TamReport


def test_tam_report_shape():
    a = load_assumptions(Path("assumptions.yaml"))
    y1 = build_year1_revenue(a, location_id=0, location_launch_year=2026)
    cohort = build_cohort_revenue_for_location(
        a, y1, location_id=0, location_launch_year=2026, is_new_location=False,
    )
    report = compute_tam_check(a, y1, cohort)
    assert isinstance(report, TamReport)
    assert report.addressable_kids > 0
    assert len(report.implied_market_share_by_year) == 5


def test_year1_market_share_is_realistic():
    a = load_assumptions(Path("assumptions.yaml"))
    y1 = build_year1_revenue(a, location_id=0, location_launch_year=2026)
    cohort = build_cohort_revenue_for_location(
        a, y1, location_id=0, location_launch_year=2026, is_new_location=False,
    )
    report = compute_tam_check(a, y1, cohort)
    assert report.implied_market_share_by_year[0] < 0.05
