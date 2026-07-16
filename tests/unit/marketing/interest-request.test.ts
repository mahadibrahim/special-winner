import { describe, it, expect } from "vitest";
import { interestRequestFor } from "@/lib/marketing/interest-request";

// One request-builder for every "email me when it opens" slot on both brands.
// Two backends exist and the split is deliberate:
//  - a specific forming season → /api/public/season-interest (per-division list,
//    server enforces status='forming' and tenant ownership)
//  - no specific season (finder empty state) → /api/public/newsletter with a
//    source tag (there is nothing to point season-interest at, and it would 404)
describe("interestRequestFor", () => {
  it("targets season-interest when a seasonId is given", () => {
    const req = interestRequestFor({
      seasonId: "6f9619ff-8b86-d011-b42d-00c04fc964ff",
      email: "player@example.com",
      brand: "soccerone",
      source: "leagues-upcoming",
    });
    expect(req.url).toBe("/api/public/season-interest");
    expect(JSON.parse(req.body)).toEqual({
      seasonId: "6f9619ff-8b86-d011-b42d-00c04fc964ff",
      email: "player@example.com",
    });
  });

  it("falls back to newsletter when no seasonId exists (empty-state slot)", () => {
    const req = interestRequestFor({
      email: "player@example.com",
      brand: "soccerone",
      source: "leagues-empty-state",
    });
    expect(req.url).toBe("/api/public/newsletter");
    expect(JSON.parse(req.body)).toEqual({
      email: "player@example.com",
      brand: "soccerone",
      source: "leagues-empty-state",
    });
  });

  it("newsletter path carries the aspire brand for Aspire slots", () => {
    const req = interestRequestFor({
      email: "a@b.co",
      brand: "aspire",
      source: "divisions-empty-state",
    });
    expect(JSON.parse(req.body).brand).toBe("aspire");
  });

  it("season path never leaks brand/source into the body (endpoint rejects unknown keys implicitly; keep the payload minimal)", () => {
    const req = interestRequestFor({
      seasonId: "6f9619ff-8b86-d011-b42d-00c04fc964ff",
      email: "a@b.co",
      brand: "aspire",
      source: "term-upcoming",
    });
    const body = JSON.parse(req.body);
    expect(body).not.toHaveProperty("brand");
    expect(body).not.toHaveProperty("source");
  });

  it("both paths are POST with a JSON content type", () => {
    for (const seasonId of [undefined, "6f9619ff-8b86-d011-b42d-00c04fc964ff"]) {
      const req = interestRequestFor({ seasonId, email: "a@b.co", brand: "aspire", source: "x" });
      expect(req.method).toBe("POST");
      expect(req.headers["Content-Type"]).toBe("application/json");
    }
  });
});
