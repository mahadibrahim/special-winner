from typing import List
from openpyxl import Workbook
from engine.pnl import PnLRow
from writers.styles import HEADER_FILL, HEADER_FONT, CURRENCY_FORMAT, PERCENT_FORMAT, SECTION_FONT, CENTER, LEFT


def write_pnl_annual_tab(wb: Workbook, rows: List[PnLRow]) -> None:
    """Annual rollup of the monthly P&L. Operational years (months 1-12, 13-24, ...).

    Columns: Year | Revenue | Variable Cost | Fixed Expense | Total Expense | Net Income | Margin %
    Plus a 5yr total row at the bottom.
    """
    ws = wb["P&L Annual"]
    ws["A1"] = "Annual P&L — Operational Years (Jul-Jun)"
    ws["A1"].font = SECTION_FONT
    ws["A2"] = "Y1 = Jul 2026 - Jun 2027. Rolls up from the monthly P&L tab."

    headers = ["Year", "Revenue", "Variable Cost", "Fixed Expense",
               "Total Expense", "Net Income", "Margin %"]
    for col, h in enumerate(headers, start=1):
        c = ws.cell(row=4, column=col, value=h)
        c.fill = HEADER_FILL
        c.font = HEADER_FONT
        c.alignment = CENTER

    # Calendar-year label for the first month of each operational year
    op_year_labels = ["Y1 (2026-27)", "Y2 (2027-28)", "Y3 (2028-29)", "Y4 (2029-30)", "Y5 (2030-31)"]

    total_rev = total_var = total_fixed = total_expense = total_ni = 0.0

    for op_year in range(5):
        start = op_year * 12
        end = start + 12
        rev = sum(r.revenue for r in rows[start:end])
        var_c = sum(r.variable_cost for r in rows[start:end])
        fe = sum(r.fixed_expense for r in rows[start:end])
        te = sum(r.total_expense for r in rows[start:end])
        ni = sum(r.net_income for r in rows[start:end])
        margin = (ni / rev) if rev else 0.0

        total_rev += rev
        total_var += var_c
        total_fixed += fe
        total_expense += te
        total_ni += ni

        row_num = 5 + op_year
        ws.cell(row=row_num, column=1, value=op_year_labels[op_year]).alignment = LEFT
        ws.cell(row=row_num, column=2, value=rev).number_format = CURRENCY_FORMAT
        ws.cell(row=row_num, column=3, value=var_c).number_format = CURRENCY_FORMAT
        ws.cell(row=row_num, column=4, value=fe).number_format = CURRENCY_FORMAT
        ws.cell(row=row_num, column=5, value=te).number_format = CURRENCY_FORMAT
        ws.cell(row=row_num, column=6, value=ni).number_format = CURRENCY_FORMAT
        ws.cell(row=row_num, column=7, value=margin).number_format = PERCENT_FORMAT

    # 5yr total row
    total_row = 11
    ws.cell(row=total_row, column=1, value="5yr Total").font = SECTION_FONT
    total_margin = (total_ni / total_rev) if total_rev else 0.0
    ws.cell(row=total_row, column=2, value=total_rev).number_format = CURRENCY_FORMAT
    ws.cell(row=total_row, column=3, value=total_var).number_format = CURRENCY_FORMAT
    ws.cell(row=total_row, column=4, value=total_fixed).number_format = CURRENCY_FORMAT
    ws.cell(row=total_row, column=5, value=total_expense).number_format = CURRENCY_FORMAT
    ws.cell(row=total_row, column=6, value=total_ni).number_format = CURRENCY_FORMAT
    ws.cell(row=total_row, column=7, value=total_margin).number_format = PERCENT_FORMAT
    for col in range(1, 8):
        ws.cell(row=total_row, column=col).font = SECTION_FONT

    ws.column_dimensions["A"].width = 18
    for col in "BCDEFG":
        ws.column_dimensions[col].width = 16
