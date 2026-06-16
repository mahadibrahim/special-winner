import { describe, it, expect } from "vitest";
import { joinContentFor, JOIN_WHATSAPP_URL } from "@/lib/branding/join-config";

describe("join-config", () => {
  it("returns distinct headlines per brand", () => {
    expect(joinContentFor("aspire").headline).toMatch(/Aspire/i);
    expect(joinContentFor("soccerone").headline).toMatch(/SoccerOne/i);
  });

  it("exposes a single shared WhatsApp URL", () => {
    expect(typeof JOIN_WHATSAPP_URL).toBe("string");
    expect(JOIN_WHATSAPP_URL.length).toBeGreaterThan(0);
  });

  it("every social value, when present, is an absolute URL", () => {
    for (const brand of ["aspire", "soccerone"] as const) {
      const socials = joinContentFor(brand).socials;
      for (const url of Object.values(socials)) {
        if (url) expect(url).toMatch(/^https?:\/\//);
      }
    }
  });
});
