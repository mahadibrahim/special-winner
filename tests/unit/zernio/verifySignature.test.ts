import { describe, it, expect } from "vitest";
import crypto from "node:crypto";
import { verifyZernioSignature } from "@/lib/zernio/verifySignature";

const SECRET = "whsec_test_zernio_123";
const BODY = JSON.stringify({ id: "evt_1", event: "post.published", post: { _id: "abc" } });

function sign(body: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(body, "utf8").digest("hex");
}

describe("verifyZernioSignature", () => {
  it("returns true for a correct lowercase-hex HMAC-SHA256 of the raw body", () => {
    const sig = sign(BODY, SECRET);
    expect(verifyZernioSignature(BODY, sig, SECRET)).toBe(true);
  });

  it("returns false for a tampered body", () => {
    const sig = sign(BODY, SECRET);
    expect(verifyZernioSignature(BODY + " ", sig, SECRET)).toBe(false);
  });

  it("returns false for a signature computed with the wrong secret", () => {
    const sig = sign(BODY, "wrong-secret");
    expect(verifyZernioSignature(BODY, sig, SECRET)).toBe(false);
  });

  it("returns false for a missing/null signature", () => {
    expect(verifyZernioSignature(BODY, null, SECRET)).toBe(false);
    expect(verifyZernioSignature(BODY, "", SECRET)).toBe(false);
  });

  it("returns false when the secret is missing", () => {
    const sig = sign(BODY, SECRET);
    expect(verifyZernioSignature(BODY, sig, "")).toBe(false);
  });

  it("returns false for a signature of the wrong length without throwing", () => {
    expect(verifyZernioSignature(BODY, "deadbeef", SECRET)).toBe(false);
  });
});
