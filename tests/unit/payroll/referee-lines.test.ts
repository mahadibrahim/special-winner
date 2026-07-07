import { describe, it, expect } from "vitest";
import {
  buildGustoRefereeCsv,
  formatFeeDollars,
  formatMatchup,
  REFEREE_CSV_HEADER,
  type RefereeFeeCsvRow,
} from "@/lib/payroll/referee-lines";

describe("formatFeeDollars", () => {
  it("converts cents to a 2-decimal dollar string", () => {
    expect(formatFeeDollars(5000)).toBe("50.00");
    expect(formatFeeDollars(0)).toBe("0.00");
    expect(formatFeeDollars(12345)).toBe("123.45");
  });
});

describe("formatMatchup", () => {
  it("joins real home/away team names", () => {
    expect(formatMatchup("Sharks", "Eagles")).toBe("Sharks vs Eagles");
  });

  it("falls back to TBD for a null team (unassigned fixture)", () => {
    expect(formatMatchup(null, "Eagles")).toBe("TBD vs Eagles");
    expect(formatMatchup("Sharks", null)).toBe("Sharks vs TBD");
    expect(formatMatchup(null, null)).toBe("TBD vs TBD");
  });
});

describe("buildGustoRefereeCsv", () => {
  it("returns header-only CSV for an empty period", () => {
    const csv = buildGustoRefereeCsv([]);
    expect(csv).toBe(REFEREE_CSV_HEADER.join(",") + "\n");
  });

  it("renders one row per game_officials assignment with the real matchup", () => {
    const rows: RefereeFeeCsvRow[] = [
      {
        firstName: "Ref",
        lastName: "Erson",
        email: "ref@example.com",
        scheduledAt: new Date("2026-06-03T18:00:00Z"),
        homeTeamName: "Sharks",
        awayTeamName: "Eagles",
        feeCents: 5000,
        paymentStatus: "unpaid",
      },
    ];
    const csv = buildGustoRefereeCsv(rows);
    const lines = csv.trimEnd().split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[1]).toBe(
      "Ref,Erson,ref@example.com,2026-06-03T18:00:00.000Z,Sharks vs Eagles,50.00,unpaid",
    );
  });
});
