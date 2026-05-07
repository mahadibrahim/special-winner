import { describe, it, expect } from "vitest";
import { RoleSchema } from "../../../../src/lib/ops-catalog/types/role";

describe("RoleSchema", () => {
  it("accepts a worker role", () => {
    const result = RoleSchema.safeParse({
      id: "role.venue_manager",
      name: "Venue Manager",
      tier: "operational",
      kind: "worker",
      description: "Owns venue operations end-to-end during a play day.",
      manual_target: "employee_manual",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a customer role", () => {
    const result = RoleSchema.safeParse({
      id: "role.parent",
      name: "Parent",
      tier: "customer",
      kind: "customer",
      description: "Adult registering a youth athlete and attending matches.",
      manual_target: "none",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid id format", () => {
    const result = RoleSchema.safeParse({
      id: "venue-manager",
      name: "Venue Manager",
      tier: "operational",
      kind: "worker",
      description: "Owns venue operations end-to-end during a play day.",
      manual_target: "employee_manual",
    });
    expect(result.success).toBe(false);
  });
});
