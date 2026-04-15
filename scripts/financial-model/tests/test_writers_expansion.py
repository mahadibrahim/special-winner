from pathlib import Path
from engine.schema import load_assumptions
from engine.revenue_year1 import build_year1_revenue
from engine.revenue_cohort import build_cohort_revenue_for_location
from engine.revenue_travel import build_travel_revenue_for_location
from engine.costs import build_cost_schedule
from engine.pnl import build_monthly_pnl
from writers.workbook import build_empty_workbook
from writers.expansion_summary_tab import write_expansion_summary_tab


def test_expansion_summary_tab_has_floor_and_expansion_rows():
    a = load_assumptions(Path("assumptions.yaml"))
    y1 = build_year1_revenue(a, location_id=0, location_launch_year=2026)
    cohort = build_cohort_revenue_for_location(
        a, y1, location_id=0, location_launch_year=2026, is_new_location=False,
    )
    travel = build_travel_revenue_for_location(
        a, cohort, location_id=0, location_launch_year=2026,
    )
    costs = build_cost_schedule(a)
    pnl = build_monthly_pnl(a, y1, cohort, travel, costs)

    wb = build_empty_workbook(a)
    write_expansion_summary_tab(wb, a, y1, cohort, travel, pnl)
    ws = wb["Expansion Summary"]
    assert ws["A1"].value is not None
    assert "Expansion" in ws["A1"].value

    col_a_values = [ws.cell(row=r, column=1).value for r in range(1, 30)]
    assert any("Floor" in str(v) for v in col_a_values if v)
    assert any("Expansion" in str(v) for v in col_a_values if v)


def test_expansion_summary_populates_numeric_totals():
    a = load_assumptions(Path("assumptions.yaml"))
    y1 = build_year1_revenue(a, location_id=0, location_launch_year=2026)
    cohort = build_cohort_revenue_for_location(
        a, y1, location_id=0, location_launch_year=2026, is_new_location=False,
    )
    travel = build_travel_revenue_for_location(
        a, cohort, location_id=0, location_launch_year=2026,
    )
    costs = build_cost_schedule(a)
    pnl = build_monthly_pnl(a, y1, cohort, travel, costs)

    wb = build_empty_workbook(a)
    write_expansion_summary_tab(wb, a, y1, cohort, travel, pnl)
    ws = wb["Expansion Summary"]

    numeric_values = []
    for row in ws.iter_rows(values_only=True):
        for v in row:
            if isinstance(v, (int, float)):
                numeric_values.append(v)
    assert len(numeric_values) > 10
