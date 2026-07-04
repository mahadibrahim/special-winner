import { describe, expect, it } from "vitest";
import { jobApplicationSchema } from "@/lib/careers/application-schema";

const valid = {
  role: "referee",
  firstName: "Jordan",
  lastName: "Reyes",
  email: "jordan@example.com",
  phone: "614-555-0100",
  preferredLocation: "worthington",
  certifications: "USSF Grassroots Referee",
  experience: "Three seasons officiating adult coed leagues.",
  availability: ["weeknights", "weekends"],
  source: "Instagram",
};

describe("jobApplicationSchema", () => {
  it("accepts a complete application", () => {
    expect(jobApplicationSchema.parse(valid)).toMatchObject({ role: "referee" });
  });

  it("requires role, names, email, experience", () => {
    for (const key of ["role", "firstName", "lastName", "email", "experience"]) {
      const { [key]: _omitted, ...rest } = valid as Record<string, unknown>;
      expect(jobApplicationSchema.safeParse(rest).success).toBe(false);
    }
  });

  it("rejects unknown role and location values", () => {
    expect(jobApplicationSchema.safeParse({ ...valid, role: "janitor" }).success).toBe(false);
    expect(jobApplicationSchema.safeParse({ ...valid, preferredLocation: "cleveland" }).success).toBe(false);
  });

  it("defaults availability to [] and tolerates missing optionals", () => {
    const { phone, certifications, source, availability, preferredLocation, ...required } = valid;
    const parsed = jobApplicationSchema.parse(required);
    expect(parsed.availability).toEqual([]);
  });

  it("rejects invalid availability entries", () => {
    expect(jobApplicationSchema.safeParse({ ...valid, availability: ["midnight"] }).success).toBe(false);
  });

  it("trims and bounds text fields", () => {
    expect(jobApplicationSchema.safeParse({ ...valid, experience: "x".repeat(5001) }).success).toBe(false);
    expect(jobApplicationSchema.parse({ ...valid, firstName: "  Jordan  " }).firstName).toBe("Jordan");
  });
});
