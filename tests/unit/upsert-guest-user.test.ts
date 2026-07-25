import { describe, it, expect } from "vitest";
import { upsertGuestUser } from "@/lib/registrations/upsert-guest-user";

describe("upsertGuestUser", () => {
  it("should export a function with arity 2", () => {
    expect(typeof upsertGuestUser).toBe("function");
    expect(upsertGuestUser.length).toBe(2);
  });
});
