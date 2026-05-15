/**
 * Photo upload pipeline. Downsize to 1024px JPEG (sharp), upload to R2,
 * write the URL to users.avatarUrl OR family_members.photoUrl depending
 * on the target. Used by manager + self-serve photo endpoints.
 */
import sharp from "sharp";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema/users";
import { familyMembers } from "@/lib/db/schema/registrations";
import { putObject } from "@/lib/storage/r2";

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_LONGEST_EDGE = 1024;
const JPEG_QUALITY = 82;

export interface PhotoUploadInput {
  bytes: Buffer;
  contentType: string;
  target:
    | { kind: "user"; id: string }
    | { kind: "family_member"; id: string };
}

export type PhotoUploadResult =
  | { ok: true; url: string }
  | { ok: false; reason: "too_big" | "bad_type" | "process_failed" };

const ACCEPT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

function publicUrlFor(key: string): string {
  // Prefer the configured public bucket URL; fall back to the
  // r2.cloudflarestorage.com direct URL pattern used by the storage helper.
  // The storage module's `endpoint` const is the s3-API endpoint; the
  // public URL is conventionally <R2_PUBLIC_URL>/<key>. Without
  // R2_PUBLIC_URL set, return the bucket-relative key — callers should
  // configure R2_PUBLIC_URL in prod (CLAUDE.md note: this is set in
  // Netlify env). For local dev / tests with R2_MOCK=1 the URL just
  // needs to round-trip through the DB column.
  const base = process.env.R2_PUBLIC_URL?.replace(/\/$/, "");
  if (base) return `${base}/${key}`;
  // R2_MOCK or unconfigured: use a stable mock-prefixed key so tests
  // can recognize "this is a mocked R2 URL."
  return `mock-r2://${key}`;
}

export async function uploadPhoto(
  input: PhotoUploadInput,
): Promise<PhotoUploadResult> {
  if (input.bytes.byteLength > MAX_BYTES) {
    return { ok: false, reason: "too_big" };
  }
  if (!ACCEPT_TYPES.has(input.contentType)) {
    return { ok: false, reason: "bad_type" };
  }

  let processed: Buffer;
  try {
    processed = await sharp(input.bytes)
      .rotate() // honor EXIF orientation
      .resize({
        width: MAX_LONGEST_EDGE,
        height: MAX_LONGEST_EDGE,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
      .toBuffer();
  } catch (err) {
    console.error("[check-in.photo] sharp processing failed", err);
    return { ok: false, reason: "process_failed" };
  }

  const key = `avatars/${input.target.kind}/${input.target.id}/${Date.now()}.jpg`;
  await putObject(key, processed, "image/jpeg");
  const url = publicUrlFor(key);

  const db = getDb();
  if (input.target.kind === "user") {
    await db
      .update(users)
      .set({ avatarUrl: url })
      .where(eq(users.id, input.target.id));
  } else {
    await db
      .update(familyMembers)
      .set({ photoUrl: url })
      .where(eq(familyMembers.id, input.target.id));
  }

  return { ok: true, url };
}
