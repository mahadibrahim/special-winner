import { describe, it, expect } from "vitest";
import { parseApiError } from "@/lib/api/error-message";

describe("parseApiError", () => {
  it("returns the top-level error when no details are present", () => {
    expect(parseApiError({ error: "Unauthorized" }, "fallback")).toBe(
      "Unauthorized",
    );
  });

  it("appends field-level details when present", () => {
    const body = {
      error: "Validation failed",
      details: {
        parentalConsent: ["Required"],
        birthDate: ["Invalid date format (YYYY-MM-DD)"],
      },
    };
    const result = parseApiError(body, "Failed");
    expect(result.startsWith("Validation failed")).toBe(true);
    expect(result.includes("parentalConsent: Required")).toBe(true);
    expect(result.includes("birthDate: Invalid date format (YYYY-MM-DD)")).toBe(
      true,
    );
  });

  it("returns just the details when there's no top-level error", () => {
    const body = { details: { name: ["Required"] } };
    const result = parseApiError(body, "fallback");
    expect(result).toBe("name: Required");
  });

  it("returns fallback for null/undefined input", () => {
    expect(parseApiError(null, "fallback")).toBe("fallback");
    expect(parseApiError(undefined, "fallback")).toBe("fallback");
  });

  it("returns fallback when neither error nor details parseable", () => {
    expect(parseApiError({}, "fallback")).toBe("fallback");
    expect(parseApiError({ error: 123 } as never, "fallback")).toBe("fallback");
  });

  it("survives a single-string details value (non-array)", () => {
    const body = { error: "Bad", details: { field: "just a string" } };
    expect(parseApiError(body, "fallback")).toBe(
      "Bad\n  field: just a string",
    );
  });

  it("ignores non-string entries inside details arrays", () => {
    const body = {
      error: "Bad",
      details: { field: [42, "real-message", { nested: true }] as unknown[] },
    };
    expect(parseApiError(body, "fallback")).toBe("Bad\n  field: real-message");
  });

  it("regression: family-members rejection now surfaces parentalConsent", () => {
    // This is the exact shape the /api/family-members 400 returned that caused
    // the launch-day "Validation failed" mystery. The customer-visible message
    // must now name `parentalConsent` so future regressions are loud.
    const body = {
      error: "Validation failed",
      details: { parentalConsent: ["Required"] },
    };
    expect(parseApiError(body, "Failed to add member")).toBe(
      "Validation failed\n  parentalConsent: Required",
    );
  });
});
