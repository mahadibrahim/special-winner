from pathlib import Path
from engine.schema import load_assumptions
from engine.revenue_year1 import build_year1_revenue
from engine.revenue_cohort import build_cohort_revenue
from engine.tam import compute_tam_check, TamReport


def test_tam_report_shape():
    a = load_assumptions(Path("assumptions.yaml"))
    y1 = build_year1_revenue(a)
    cohort = build_cohort_revenue(a, y1)
    report = compute_tam_check(a, y1, cohort)
    assert isinstance(report, TamReport)
    assert report.addressable_kids > 0
    assert len(report.implied_market_share_by_year) == 5


def test_year1_market_share_is_realistic():
    """Year 1 implied market share should be well under 5% for a launch year."""
    a = load_assumptions(Path("assumptions.yaml"))
    y1 = build_year1_revenue(a)
    cohort = build_cohort_revenue(a, y1)
    report = compute_tam_check(a, y1, cohort)
    assert report.implied_market_share_by_year[0] < 0.05
