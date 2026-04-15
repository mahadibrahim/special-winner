from pathlib import Path
from openpyxl import Workbook
from engine.schema import Assumptions


def build_empty_workbook(a: Assumptions) -> Workbook:
    """Create a Workbook with named tabs in order. Individual writer modules
    will populate each tab's contents."""
    wb = Workbook()
    # Remove the default sheet; we create ours explicitly in order
    default = wb.active
    wb.remove(default)

    tab_names = [
        "Cover",
        "Expansion Summary",
        "Assumptions",
        "Revenue Y1",
        "Revenue Cohort",
        "Costs",
        "P&L Annual",
        "P&L",
        "Cash Flow",
        "Partner Returns",
        "Sensitivity",
        "Scenarios",
        "TAM Check",
    ]
    for name in tab_names:
        wb.create_sheet(name)
    return wb


def save_workbook(wb: Workbook, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    wb.save(path)
