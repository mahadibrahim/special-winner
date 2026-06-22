import { describe, it, expect } from "vitest";
import { isAllowedPhotoUrl } from "@/lib/storage/photo-url";

describe("isAllowedPhotoUrl", () => {
  it("allows Cloudinary delivery URLs", () => {
    expect(
      isAllowedPhotoUrl("https://res.cloudinary.com/demo/image/upload/v1/family-photos/x.jpg"),
    ).toBe(true);
  });

  it("allows R2 default public domains", () => {
    expect(isAllowedPhotoUrl("https://pub-abc123.r2.dev/photos/x.jpg")).toBe(true);
    expect(
      isAllowedPhotoUrl("https://bucket.account.r2.cloudflarestorage.com/x.jpg"),
    ).toBe(true);
  });

  it("rejects arbitrary external hosts (tracking-pixel vector)", () => {
    expect(isAllowedPhotoUrl("https://attacker.example.com/track.png")).toBe(false);
  });

  it("rejects non-https schemes", () => {
    expect(isAllowedPhotoUrl("http://res.cloudinary.com/demo/x.jpg")).toBe(false);
    expect(isAllowedPhotoUrl("javascript:alert(1)")).toBe(false);
    expect(isAllowedPhotoUrl("data:image/png;base64,AAAA")).toBe(false);
  });

  it("rejects malformed input", () => {
    expect(isAllowedPhotoUrl("not a url")).toBe(false);
    expect(isAllowedPhotoUrl("")).toBe(false);
  });

  it("rejects a host that merely contains an allowed host as a substring", () => {
    // e.g. an attacker domain crafted to look like Cloudinary
    expect(isAllowedPhotoUrl("https://res.cloudinary.com.evil.test/x.jpg")).toBe(false);
  });
});
