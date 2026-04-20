import { getDb } from "@/lib/db";
import { mediaAssets } from "@/lib/db/schema/media";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import exifr from "exifr";
import * as r2 from "@/lib/storage/r2";
import { thumbnailKey, parseKey } from "@/lib/storage/keys";

export async function processThumbnail(assetId: string): Promise<void> {
  const db = getDb();
  const [asset] = await db
    .select()
    .from(mediaAssets)
    .where(eq(mediaAssets.id, assetId))
    .limit(1);
  if (!asset) return;
  if (asset.status !== "uploaded") return;
  if (asset.thumbnailKey) return;

  const parsed = parseKey(asset.storageKey);
  if (!parsed) return;

  const url = await r2.getSignedGetUrl(asset.storageKey, 300);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`R2 fetch failed: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());

  let capturedAt: Date | null = null;
  try {
    const exif = await exifr.parse(buf, ["DateTimeOriginal", "CreateDate"]);
    const when = exif?.DateTimeOriginal ?? exif?.CreateDate;
    if (when instanceof Date) capturedAt = when;
  } catch {
    // EXIF missing or unreadable; fall through.
  }

  const thumbBuf = await sharp(buf)
    .rotate()
    .resize({ width: 400, withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer();

  const thumbKey = thumbnailKey(parsed.orgId, parsed.sessionId, parsed.assetId);
  await r2.putObject(thumbKey, thumbBuf, "image/jpeg");

  const meta = await sharp(buf).metadata();

  await db
    .update(mediaAssets)
    .set({
      thumbnailKey: thumbKey,
      capturedAt: capturedAt ?? asset.uploadedAt,
      width: meta.width ?? null,
      height: meta.height ?? null,
      updatedAt: new Date(),
    })
    .where(eq(mediaAssets.id, assetId));
}
