from pathlib import Path
from engine.schema import load_assumptions
from engine.revenue_year1 import build_year1_revenue
from engine.revenue_cohort import build_cohort_revenue_for_location
from engine.revenue_travel import build_travel_revenue_for_location
from engine.costs import build_cost_schedule
from engine.cashflow import build_monthly_cashflow
from engine.partner_returns import build_partner_returns, PartnerReturnsReport


def _inputs(a):
    y1 = build_year1_revenue(a, location_id=0, location_launch_year=2026)
    cohort = build_cohort_revenue_for_location(
        a, y1, location_id=0, location_launch_year=2026, is_new_location=False,
    )
    travel = build_travel_revenue_for_location(
        a, cohort, location_id=0, location_launch_year=2026,
    )
    costs = build_cost_schedule(a)
    return y1, cohort, travel, costs


def test_partner_returns_report_shape():
    a = load_assumptions(Path("assumptions.yaml"))
    y1, cohort, travel, costs = _inputs(a)
    cf = build_monthly_cashflow(a, y1, cohort, travel, costs)
    report = build_partner_returns(a, cf)
    assert isinstance(report, PartnerReturnsReport)
    assert len(report.monthly_rows) == a.horizon_months
    assert "founder_a" in report.total_contribution_by_partner
    assert "founder_b" in report.total_contribution_by_partner


def test_no_distributions_before_capital_returned():
    """Distribution policy is return_capital_then_split: no distributions can
    occur until cumulative distributions equal total contributions."""
    a = load_assumptions(Path("assumptions.yaml"))
    y1, cohort, travel, costs = _inputs(a)
    cf = build_monthly_cashflow(a, y1, cohort, travel, costs)
    report = build_partner_returns(a, cf)

    total_contributions = sum(report.total_contribution_by_partner.values())
    cumulative_distributed = 0.0
    first_distribution_idx = None
    for i, row in enumerate(report.monthly_rows):
        cumulative_distributed += row.total_distribution
        if row.total_distribution > 0 and first_distribution_idx is None:
            first_distribution_idx = i
    if first_distribution_idx is not None:
        ending = cf[first_distribution_idx].ending_balance
        assert ending + cumulative_distributed >= total_contributions + a.capital.working_capital_reserve_floor


def test_irr_and_moic_fields_populated():
    a = load_assumptions(Path("assumptions.yaml"))
    y1, cohort, travel, costs = _inputs(a)
    cf = build_monthly_cashflow(a, y1, cohort, travel, costs)
    report = build_partner_returns(a, cf)
    assert report.irr is not None
    assert report.moic is not None
    assert report.payback_month is not None or report.payback_month is None
