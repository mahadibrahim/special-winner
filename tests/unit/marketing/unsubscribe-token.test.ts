import { describe, it, expect } from "vitest";
import {
  signUnsubscribeToken,
  verifyUnsubscribeToken,
} from "@/lib/marketing/unsubscribe-token";

const SECRET = "test-unsubscribe-secret";
const USER_ID = "11111111-1111-1111-1111-111111111111";

describe("unsubscribe token", () => {
  it("round-trips a user id", () => {
    const token = signUnsubscribeToken(USER_ID, SECRET);
    expect(verifyUnsubscribeToken(token, SECRET)).toBe(USER_ID);
  });

  it("rejects a tampered token", () => {
    const token = signUnsubscribeToken(USER_ID, SECRET);
    const tampered = token.slice(0, -2) + (token.slice(-2) === "aa" ? "bb" : "aa");
    expect(verifyUnsubscribeToken(tampered, SECRET)).toBeNull();
  });

  it("rejects a token signed with a different secret", () => {
    const token = signUnsubscribeToken(USER_ID, SECRET);
    expect(verifyUnsubscribeToken(token, "other-secret")).toBeNull();
  });

  it("rejects a malformed token", () => {
    expect(verifyUnsubscribeToken("garbage", SECRET)).toBeNull();
    expect(verifyUnsubscribeToken("", SECRET)).toBeNull();
  });
});
