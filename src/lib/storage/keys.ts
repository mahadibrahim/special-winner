export function originalKey(
  orgId: string,
  sessionId: string,
  assetId: string,
  ext: string
): string {
  const base = `org/${orgId}/shoots/${sessionId}/${assetId}`;
  const cleaned = ext.replace(/^\./, "").trim().toLowerCase();
  return cleaned.length > 0 ? `${base}.${cleaned}` : base;
}

export function thumbnailKey(
  orgId: string,
  sessionId: string,
  assetId: string
): string {
  return `org/${orgId}/shoots/${sessionId}/thumbs/${assetId}.jpg`;
}

export function parseKey(
  key: string
): { orgId: string; sessionId: string; assetId: string; ext: string } | null {
  const m = key.match(
    /^org\/([0-9a-f-]+)\/shoots\/([0-9a-f-]+)\/([0-9a-f-]+)\.([^./]+)$/i
  );
  if (!m) return null;
  return { orgId: m[1], sessionId: m[2], assetId: m[3], ext: m[4].toLowerCase() };
}
