from pathlib import Path
from engine.schema import load_assumptions
from engine.revenue_year1 import build_year1_revenue
from engine.revenue_cohort import build_cohort_revenue_for_location
from writers.workbook import build_empty_workbook
from writers.revenue_year1_tab import write_revenue_year1_tab
from writers.revenue_cohort_tab import write_revenue_cohort_tab


def test_revenue_year1_tab_has_row_per_line():
    a = load_assumptions(Path("assumptions.yaml"))
    lines = build_year1_revenue(a, location_id=0, location_launch_year=2026)
    wb = build_empty_workbook(a)
    write_revenue_year1_tab(wb, lines)
    ws = wb["Revenue Y1"]
    data_rows = [row for row in ws.iter_rows(min_row=3, values_only=True) if any(row)]
    assert len(data_rows) == len(lines)


def test_revenue_cohort_tab_has_lines():
    a = load_assumptions(Path("assumptions.yaml"))
    y1 = build_year1_revenue(a, location_id=0, location_launch_year=2026)
    cohort = build_cohort_revenue_for_location(
        a, y1, location_id=0, location_launch_year=2026, is_new_location=False,
    )
    wb = build_empty_workbook(a)
    write_revenue_cohort_tab(wb, cohort)
    ws = wb["Revenue Cohort"]
    data_rows = [row for row in ws.iter_rows(min_row=3, values_only=True) if any(row)]
    assert len(data_rows) == len(cohort)
