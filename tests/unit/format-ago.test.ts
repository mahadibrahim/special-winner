import { describe, it, expect } from "vitest";
import { formatAgo } from "@/lib/venue/format-ago";

describe("formatAgo", () => {
  it("renders seconds under a minute", () => {
    expect(formatAgo(0)).toBe("0s");
    expect(formatAgo(59)).toBe("59s");
  });
  it("renders whole minutes under an hour", () => {
    expect(formatAgo(60)).toBe("1m");
    expect(formatAgo(3599)).toBe("59m");
  });
  it("renders hours beyond that", () => {
    expect(formatAgo(3600)).toBe("1h");
    expect(formatAgo(7300)).toBe("2h");
  });
  it("clamps negatives to 0s", () => {
    expect(formatAgo(-5)).toBe("0s");
  });
});
