import { describe, it, expect } from "vitest";
import { FeatureSchema } from "../../../../src/lib/ops-catalog/types/feature";

describe("FeatureSchema", () => {
  it("accepts a feature stub", () => {
    const result = FeatureSchema.safeParse({
      id: "feat.weather_alert_dashboard",
      name: "Weather alert dashboard",
      description: "Surfaces weather warnings against scheduled matches.",
      priority: "P1",
      status: "stub",
    });
    expect(result.success).toBe(true);
  });

  it("rejects unknown priority", () => {
    const result = FeatureSchema.safeParse({
      id: "feat.weather_alert_dashboard",
      name: "Weather alert dashboard",
      description: "Surfaces weather warnings against scheduled matches.",
      priority: "P5",
      status: "stub",
    });
    expect(result.success).toBe(false);
  });
});
