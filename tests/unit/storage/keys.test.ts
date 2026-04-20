import { describe, it, expect } from "vitest";
import {
  originalKey,
  thumbnailKey,
  parseKey,
} from "@/lib/storage/keys";

describe("storage keys", () => {
  const orgId = "11111111-1111-1111-1111-111111111111";
  const sessionId = "22222222-2222-2222-2222-222222222222";
  const assetId = "33333333-3333-3333-3333-333333333333";

  it("composes original key with extension lowercased", () => {
    expect(originalKey(orgId, sessionId, assetId, "CR2")).toBe(
      `org/${orgId}/shoots/${sessionId}/${assetId}.cr2`
    );
  });

  it("handles filenames with no extension", () => {
    expect(originalKey(orgId, sessionId, assetId, "")).toBe(
      `org/${orgId}/shoots/${sessionId}/${assetId}`
    );
  });

  it("thumbnail key lives in the thumbs subfolder and is always .jpg", () => {
    expect(thumbnailKey(orgId, sessionId, assetId)).toBe(
      `org/${orgId}/shoots/${sessionId}/thumbs/${assetId}.jpg`
    );
  });

  it("parseKey round-trips", () => {
    const key = originalKey(orgId, sessionId, assetId, "jpg");
    const parsed = parseKey(key);
    expect(parsed).toEqual({ orgId, sessionId, assetId, ext: "jpg" });
  });

  it("parseKey returns null for a thumbnail key", () => {
    const key = thumbnailKey(orgId, sessionId, assetId);
    expect(parseKey(key)).toBeNull();
  });

  it("parseKey returns null for an extension-less key", () => {
    const key = originalKey(orgId, sessionId, assetId, "");
    expect(parseKey(key)).toBeNull();
  });

  it("parseKey returns null for an arbitrary invalid string", () => {
    expect(parseKey("not/a/valid/key")).toBeNull();
  });
});
