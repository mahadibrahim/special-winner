import { describe, it, expect } from "vitest";
import { directionsUrl } from "@/lib/dashboard/maps";

describe("directionsUrl", () => {
  it("prefers the address when present", () => {
    expect(directionsUrl({ name: "Aspire Downtown", address: "1810 N High St, Columbus OH" }))
      .toBe("https://www.google.com/maps/dir/?api=1&destination=1810%20N%20High%20St%2C%20Columbus%20OH");
  });
  it("falls back to the name when address is missing", () => {
    expect(directionsUrl({ name: "Aspire Downtown", address: null }))
      .toBe("https://www.google.com/maps/dir/?api=1&destination=Aspire%20Downtown");
  });
  it("falls back to the name when address is undefined", () => {
    expect(directionsUrl({ name: "Aspire Downtown" }))
      .toBe("https://www.google.com/maps/dir/?api=1&destination=Aspire%20Downtown");
  });
  it("treats a whitespace-only address as absent", () => {
    expect(directionsUrl({ name: "Aspire Downtown", address: "   " }))
      .toBe("https://www.google.com/maps/dir/?api=1&destination=Aspire%20Downtown");
  });
  it("returns null when neither is present", () => {
    expect(directionsUrl({ name: null, address: null })).toBeNull();
  });
});
