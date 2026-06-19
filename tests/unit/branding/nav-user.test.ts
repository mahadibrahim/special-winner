import { describe, it, expect } from "vitest";
import { resolveNavUser } from "@/lib/branding/nav-user";

const user = { id: "u1", email: "a@b.com", firstName: "Ada", lastName: "Lovelace" };

describe("resolveNavUser", () => {
  it("returns undefined when prerendered (auth resolved client-side)", () => {
    expect(resolveNavUser({ isPrerendered: true, edgeCached: false, user })).toBeUndefined();
  });

  it("returns undefined when edge-cached, even with a user present", () => {
    expect(resolveNavUser({ isPrerendered: false, edgeCached: true, user })).toBeUndefined();
  });

  it("returns null for an anonymous, non-cached request", () => {
    expect(resolveNavUser({ isPrerendered: false, edgeCached: false, user: null })).toBeNull();
  });

  it("returns the user object for an authed, non-cached request", () => {
    expect(resolveNavUser({ isPrerendered: false, edgeCached: false, user })).toEqual(user);
  });
});
