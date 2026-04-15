from pathlib import Path
from engine.schema import load_assumptions
from writers.workbook import build_empty_workbook
from writers.cover_tab import write_cover_tab
from writers.assumptions_tab import write_assumptions_tab


def test_cover_tab_has_title_and_date(tmp_path):
    a = load_assumptions(Path("assumptions.yaml"))
    wb = build_empty_workbook(a)
    write_cover_tab(wb, a)
    ws = wb["Cover"]
    assert ws["A1"].value is not None
    assert "Aspire" in ws["A1"].value


def test_assumptions_tab_writes_sport_base_values(tmp_path):
    a = load_assumptions(Path("assumptions.yaml"))
    wb = build_empty_workbook(a)
    write_assumptions_tab(wb, a)
    ws = wb["Assumptions"]
    values = []
    for row in ws.iter_rows(values_only=True):
        for v in row:
            if isinstance(v, (int, float)):
                values.append(v)
    assert 215 in values
    assert 32 in values
    assert 100 in values
