import { describe, it, expect } from "vitest";
import { getDb } from "@/lib/db";
import { activityCompletions } from "@/lib/db/schema/activity-tracking";
import { eq } from "drizzle-orm";
import { bootstrapActivityCompletions } from "@/lib/activity-tracking/bootstrap";
import { createTestGameContext } from "../../utils/activity-tracking-helpers";

describe("bootstrapActivityCompletions", () => {
  it("creates rows matching tag context (outdoor youth soccer league, no concessions)", async () => {
    const ctx = await createTestGameContext({
      indoor: false,
      owned: true,
      concessions: false,
      programType: "league",
      audienceType: "parents",
      sportSlug: "soccer",
    });

    await bootstrapActivityCompletions(ctx.gameId);

    const rows = await getDb()
      .select()
      .from(activityCompletions)
      .where(eq(activityCompletions.gameId, ctx.gameId));

    expect(rows.length).toBeGreaterThan(40);
    expect(rows.some((r) => r.activityId === "act.rainout_decision")).toBe(true);
    // venue.concessions=false → concessions-tagged activities filtered out
    expect(
      rows.some((r) => r.activityId === "act.cash_concession_reconcile"),
    ).toBe(false);
    // sport_tags=[outdoor:flag_football] excluded for outdoor:soccer context
    expect(rows.some((r) => r.activityId === "act.flag_field_line_check")).toBe(
      false,
    );
    // every row carries the org id resolved via season → program → location
    expect(rows.every((r) => r.organizationId === ctx.organizationId)).toBe(
      true,
    );
  });

  it("includes concessions activities when venue.concessions=true", async () => {
    const ctx = await createTestGameContext({ concessions: true });

    await bootstrapActivityCompletions(ctx.gameId);

    const rows = await getDb()
      .select()
      .from(activityCompletions)
      .where(eq(activityCompletions.gameId, ctx.gameId));

    expect(rows.some((r) => r.activityId === "act.concession_setup")).toBe(true);
  });
});
