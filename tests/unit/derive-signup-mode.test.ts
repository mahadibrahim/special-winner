import { describe, it, expect } from "vitest";
import { deriveSignupMode } from "@/lib/programs/derive";

describe("deriveSignupMode", () => {
  it("returns 'interest' for a forming season", () => {
    expect(deriveSignupMode({ status: "forming" })).toBe("interest");
  });

  it("returns 'register' for an open season", () => {
    expect(deriveSignupMode({ status: "open" })).toBe("register");
  });

  it("returns 'register' for an active season", () => {
    expect(deriveSignupMode({ status: "active" })).toBe("register");
  });

  it("prefers an explicit signupMode field when present", () => {
    expect(deriveSignupMode({ status: "open", signupMode: "interest" })).toBe("interest");
  });

  it("defaults to 'register' when status is missing", () => {
    expect(deriveSignupMode({})).toBe("register");
  });
});
