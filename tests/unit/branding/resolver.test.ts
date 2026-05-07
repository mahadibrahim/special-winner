import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  getDb: () => ({
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () =>
            Promise.resolve([
              {
                id: "b1",
                organizationId: "org1",
                domain: "test.example.com",
                displayName: "Test",
                logoMediaId: null,
                heroCopy: null,
                colorTokens: null,
                footerCopy: null,
                featuredVenueIds: [],
                active: true,
                createdAt: new Date(),
                updatedAt: new Date(),
              },
            ]),
        }),
      }),
    }),
  }),
}));

import { resolveBrandProfile } from "@/lib/branding/resolver";

describe("resolveBrandProfile", () => {
  it("returns the brand profile for an active domain", async () => {
    const b = await resolveBrandProfile("test.example.com");
    expect(b?.displayName).toBe("Test");
    expect(b?.id).toBe("b1");
    expect(b?.featuredVenueIds).toEqual([]);
  });
});
