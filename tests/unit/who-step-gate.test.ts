import { describe, it, expect } from "vitest";
import { computeMissing } from "@/components/registration/who-step";
import type { SelfProfileSnapshot } from "@/components/registration/who-step";

describe("computeMissing: phone-gate semantics", () => {
  it("phone absent does NOT flip any when first/last/birthDate present", () => {
    const profile: SelfProfileSnapshot = {
      firstName: "John",
      lastName: "Doe",
      phone: null, // explicitly absent
      birthDate: "1990-01-01",
      gender: null,
    };
    const result = computeMissing(profile);
    expect(result.phone).toBe(true); // phone is missing
    expect(result.firstName).toBe(false);
    expect(result.lastName).toBe(false);
    expect(result.birthDate).toBe(false);
    expect(result.any).toBe(false); // phone missing alone does NOT gate
  });

  it("firstName missing gates the form (any = true)", () => {
    const profile: SelfProfileSnapshot = {
      firstName: null,
      lastName: "Doe",
      phone: "5551234567",
      birthDate: "1990-01-01",
      gender: null,
    };
    const result = computeMissing(profile);
    expect(result.firstName).toBe(true);
    expect(result.any).toBe(true);
  });

  it("lastName missing gates the form (any = true)", () => {
    const profile: SelfProfileSnapshot = {
      firstName: "John",
      lastName: null,
      phone: "5551234567",
      birthDate: "1990-01-01",
      gender: null,
    };
    const result = computeMissing(profile);
    expect(result.lastName).toBe(true);
    expect(result.any).toBe(true);
  });

  it("birthDate missing gates the form (any = true)", () => {
    const profile: SelfProfileSnapshot = {
      firstName: "John",
      lastName: "Doe",
      phone: "5551234567",
      birthDate: null,
      gender: null,
    };
    const result = computeMissing(profile);
    expect(result.birthDate).toBe(true);
    expect(result.any).toBe(true);
  });

  it("malformed phone does NOT flip any (gate by firstName/lastName/birthDate only)", () => {
    const profile: SelfProfileSnapshot = {
      firstName: "John",
      lastName: "Doe",
      phone: "555", // malformed (not 10 digits)
      birthDate: "1990-01-01",
      gender: null,
    };
    const result = computeMissing(profile);
    expect(result.phone).toBe(true); // phone is marked missing (malformed)
    expect(result.firstName).toBe(false);
    expect(result.lastName).toBe(false);
    expect(result.birthDate).toBe(false);
    expect(result.any).toBe(false); // malformed phone does NOT gate the form
  });

  it("whitespace-only firstName is treated as missing", () => {
    const profile: SelfProfileSnapshot = {
      firstName: "   ",
      lastName: "Doe",
      phone: "5551234567",
      birthDate: "1990-01-01",
      gender: null,
    };
    const result = computeMissing(profile);
    expect(result.firstName).toBe(true);
    expect(result.any).toBe(true);
  });

  it("all fields present and valid: any = false", () => {
    const profile: SelfProfileSnapshot = {
      firstName: "John",
      lastName: "Doe",
      phone: "5551234567",
      birthDate: "1990-01-01",
      gender: "male",
    };
    const result = computeMissing(profile);
    expect(result.firstName).toBe(false);
    expect(result.lastName).toBe(false);
    expect(result.phone).toBe(false);
    expect(result.birthDate).toBe(false);
    expect(result.any).toBe(false);
  });
});
