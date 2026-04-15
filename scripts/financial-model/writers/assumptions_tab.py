from openpyxl import Workbook
from engine.schema import Assumptions, LowBaseHigh
from writers.styles import (
    HEADER_FILL, HEADER_FONT, SECTION_FILL, SECTION_FONT,
    CONFIDENCE_HIGH, CONFIDENCE_MEDIUM, CONFIDENCE_LOW,
    CURRENCY_FORMAT, PERCENT_FORMAT, CENTER, LEFT,
)


def _write_header(ws, row: int):
    labels = ["Assumption", "Low", "Base", "High", "Unit", "Confidence"]
    for col, label in enumerate(labels, start=1):
        c = ws.cell(row=row, column=col, value=label)
        c.fill = HEADER_FILL
        c.font = HEADER_FONT
        c.alignment = CENTER


def _write_lbh_row(ws, row: int, label: str, lbh: LowBaseHigh, unit: str, confidence: str):
    ws.cell(row=row, column=1, value=label).alignment = LEFT
    ws.cell(row=row, column=2, value=lbh.low)
    ws.cell(row=row, column=3, value=lbh.base)
    ws.cell(row=row, column=4, value=lbh.high)
    ws.cell(row=row, column=5, value=unit)
    fill = {
        "HIGH": CONFIDENCE_HIGH,
        "MEDIUM": CONFIDENCE_MEDIUM,
        "LOW": CONFIDENCE_LOW,
    }.get(confidence, CONFIDENCE_MEDIUM)
    c = ws.cell(row=row, column=6, value=confidence)
    c.fill = fill
    c.alignment = CENTER


def _write_scalar_row(ws, row: int, label: str, value, unit: str):
    ws.cell(row=row, column=1, value=label).alignment = LEFT
    ws.cell(row=row, column=3, value=value)
    ws.cell(row=row, column=5, value=unit)


def write_assumptions_tab(wb: Workbook, a: Assumptions) -> None:
    ws = wb["Assumptions"]
    row = 1

    for sport in a.sports:
        ws.cell(row=row, column=1, value=f"SPORT: {sport.name.upper()} (launch {sport.launch_year})").font = SECTION_FONT
        ws.cell(row=row, column=1).fill = SECTION_FILL
        row += 1
        _write_header(ws, row); row += 1
        _write_lbh_row(ws, row, f"{sport.name} price", sport.price, "$/season", "MEDIUM"); row += 1
        _write_scalar_row(ws, row, f"{sport.name} weeks/season", sport.weeks_per_season, "weeks"); row += 1
        _write_scalar_row(ws, row, f"{sport.name} roster size", sport.roster_size, "kids"); row += 1
        _write_scalar_row(ws, row, f"{sport.name} venue", sport.venue_type, ""); row += 1
        _write_lbh_row(ws, row, f"{sport.name} fill rate", sport.fill_rate, "%", "MEDIUM"); row += 1
        _write_lbh_row(ws, row, f"{sport.name} S1→S2 retention", sport.s1_to_s2, "%", "MEDIUM"); row += 1
        _write_lbh_row(ws, row, f"{sport.name} S2→S3 retention", sport.s2_to_s3, "%", "MEDIUM"); row += 1
        _write_lbh_row(ws, row, f"{sport.name} S3+ retention", sport.s3_plus, "%", "MEDIUM"); row += 1
        row += 1

    ws.cell(row=row, column=1, value="EXPANSION").font = SECTION_FONT
    ws.cell(row=row, column=1).fill = SECTION_FILL
    row += 1
    _write_scalar_row(ws, row, "Locations by year (2026→2030)",
                     str(list(a.expansion.locations.by_year.values())), "count"); row += 1
    _write_lbh_row(ws, row, "New location fill boost",
                   a.expansion.locations.new_location_fill_rate_boost, "pts", "MEDIUM"); row += 1
    _write_scalar_row(ws, row, "TAM per location", a.expansion.locations.tam_per_location, "kids"); row += 1
    if a.expansion.travel is not None:
        _write_scalar_row(ws, row, "Travel launch year", a.expansion.travel.launch_year, "year"); row += 1
        _write_lbh_row(ws, row, "Travel price", a.expansion.travel.travel_price, "$/season", "LOW"); row += 1
        _write_lbh_row(ws, row, "Rec-to-travel upgrade rate",
                       a.expansion.travel.rec_to_travel_upgrade_rate, "%", "LOW"); row += 1
    row += 1

    ws.cell(row=row, column=1, value="RETENTION (cross-cutting)").font = SECTION_FONT
    ws.cell(row=row, column=1).fill = SECTION_FILL
    row += 1
    _write_lbh_row(ws, row, "Referral multiplier", a.retention.referral_multiplier, "x", "LOW"); row += 1
    _write_lbh_row(ws, row, "Cross-sell rate (deprecated)", a.retention.cross_sell_rate, "%", "LOW"); row += 1
    row += 1

    ws.cell(row=row, column=1, value="COSTS").font = SECTION_FONT
    ws.cell(row=row, column=1).fill = SECTION_FILL
    row += 1
    _write_header(ws, row); row += 1
    _write_lbh_row(ws, row, "Head coach hourly", a.costs.head_coach_hourly, "$/hr", "HIGH"); row += 1
    _write_lbh_row(ws, row, "Assistant coach hourly", a.costs.assistant_coach_hourly, "$/hr", "MEDIUM"); row += 1
    _write_lbh_row(ws, row, "Outdoor field hourly", a.costs.outdoor_field_hourly, "$/hr", "LOW"); row += 1
    _write_lbh_row(ws, row, "Indoor turf full hourly", a.costs.indoor_turf_full_hourly, "$/hr", "MEDIUM"); row += 1
    _write_lbh_row(ws, row, "Indoor turf half hourly", a.costs.indoor_turf_half_hourly, "$/hr", "MEDIUM"); row += 1
    _write_lbh_row(ws, row, "Gym hourly", a.costs.gym_hourly, "$/hr", "HIGH"); row += 1
    _write_scalar_row(ws, row, "Software monthly", a.costs.software_monthly, "$/mo"); row += 1
    _write_scalar_row(ws, row, "Insurance monthly", a.costs.insurance_monthly, "$/mo"); row += 1

    ws.column_dimensions["A"].width = 44
    for col in "BCDEF":
        ws.column_dimensions[col].width = 14
