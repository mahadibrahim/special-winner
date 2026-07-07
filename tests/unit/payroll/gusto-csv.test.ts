import { describe, it, expect } from "vitest";
import {
  buildGustoHoursCsv,
  HOURS_CSV_HEADER,
  type HourlyLaborCsvRow,
} from "@/lib/payroll/gusto-csv";

describe("buildGustoHoursCsv", () => {
  it("returns header-only CSV (with trailing newline) for an empty period", () => {
    const csv = buildGustoHoursCsv([]);
    expect(csv).toBe(HOURS_CSV_HEADER.join(",") + "\n");
  });

  it("renders one row per aggregated (employee, role)", () => {
    const rows: HourlyLaborCsvRow[] = [
      {
        userId: "u1",
        role: "coach",
        totalHours: 3,
        closedShiftCount: 3,
        flaggedShiftCount: 1,
        openShiftCount: 1,
        firstName: "Jane",
        lastName: "Coach",
        email: "jane@example.com",
      },
    ];
    const csv = buildGustoHoursCsv(rows);
    const lines = csv.trimEnd().split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe(HOURS_CSV_HEADER.join(","));
    expect(lines[1]).toBe("Jane,Coach,jane@example.com,coach,3,1,1");
  });

  it("quotes fields per RFC 4180 via toCsvRow (e.g. a comma in a name)", () => {
    const rows: HourlyLaborCsvRow[] = [
      {
        userId: "u1",
        role: "coach",
        totalHours: 1,
        closedShiftCount: 1,
        flaggedShiftCount: 0,
        openShiftCount: 0,
        firstName: "Jo, Jr.",
        lastName: "Coach",
        email: "jo@example.com",
      },
    ];
    const csv = buildGustoHoursCsv(rows);
    expect(csv).toContain('"Jo, Jr."');
  });
});
