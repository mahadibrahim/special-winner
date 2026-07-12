import { describe, expect, it } from "vitest";
import { CURRICULUM_CONTENT } from "@/lib/curriculum/content";

// Owner directive (2026-07-12, rehearsal film review): every soccer activity
// must ship a usable setup diagram the coach app can render on a phone.
// Format contract: ≤40 chars per line (authoring target is 38), ≤16 lines,
// no emoji / double-width glyphs (they break monospace alignment on phones).
const MAX_LINE_WIDTH = 40;
const MAX_LINES = 16;

const lineWidth = (line: string) => Array.from(line).length;

describe("activity setup diagrams", () => {
  const soccer = CURRICULUM_CONTENT.activities.filter(
    (a) => a.sport === "soccer",
  );

  it("every soccer activity has a diagram", () => {
    const missing = soccer.filter((a) => !a.diagram?.trim()).map((a) => a.slug);
    expect(missing).toEqual([]);
  });

  it("all diagrams are phone-renderable: line width, line count, no emoji", () => {
    const violations: string[] = [];
    for (const a of CURRICULUM_CONTENT.activities) {
      if (!a.diagram) continue;
      const lines = a.diagram.split("\n");
      if (lines.length > MAX_LINES) {
        violations.push(`${a.slug}: ${lines.length} lines (max ${MAX_LINES})`);
      }
      for (const line of lines) {
        if (lineWidth(line) > MAX_LINE_WIDTH) {
          violations.push(
            `${a.slug}: line ${lineWidth(line)} chars wide (max ${MAX_LINE_WIDTH}): ${line.trim().slice(0, 20)}…`,
          );
        }
      }
      if (/[\u{1F000}-\u{1FAFF}]|⚽|⛹/u.test(a.diagram)) {
        violations.push(`${a.slug}: contains emoji glyphs`);
      }
    }
    expect(violations).toEqual([]);
  });
});
