import { describe, it, expect } from "vitest";
import { ArtifactTemplateSchema } from "../../../../scripts/ops-catalog/types/artifact-template";

describe("ArtifactTemplateSchema", () => {
  it("accepts a checklist template with items", () => {
    const result = ArtifactTemplateSchema.safeParse({
      id: "chk.field_setup",
      kind: "checklist",
      status: "implemented",
      items: [
        { id: "cones_placed", label: "Cones placed at corners" },
        { id: "nets_secured", label: "Nets secured to posts" },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("accepts a form template with fields", () => {
    const result = ArtifactTemplateSchema.safeParse({
      id: "frm.rainout_decision",
      kind: "form",
      status: "stub",
      fields: [
        { id: "decision", label: "Decision", type: "enum", options: ["go", "no_go"], required: true },
        { id: "notes", label: "Notes", type: "long_text" },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects checklist without items", () => {
    const result = ArtifactTemplateSchema.safeParse({
      id: "chk.empty",
      kind: "checklist",
      status: "stub",
      items: [],
    });
    expect(result.success).toBe(false);
  });
});
