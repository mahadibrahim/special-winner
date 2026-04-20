import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/db";
import { mediaAssets } from "@/lib/db/schema/media";
import { eq, isNull } from "drizzle-orm";

type AssetRow = {
  id: string;
  capturedAt: Date | null;
  burstGroupId: string | null;
};

function assignGroups(assets: AssetRow[]): Map<string, string> {
  const assignments = new Map<string, string>();

  const dated = assets
    .filter((a): a is AssetRow & { capturedAt: Date } => a.capturedAt !== null)
    .sort((a, b) => a.capturedAt.getTime() - b.capturedAt.getTime());

  const logicalGroups: AssetRow[][] = [];
  let current: AssetRow[] = [];
  let prevMs: number | null = null;
  for (const a of dated) {
    const ms = a.capturedAt!.getTime();
    if (prevMs !== null && ms - prevMs > 2000) {
      logicalGroups.push(current);
      current = [];
    }
    current.push(a);
    prevMs = ms;
  }
  if (current.length) logicalGroups.push(current);

  for (const group of logicalGroups) {
    const existing = group
      .map((a) => a.burstGroupId)
      .filter((x): x is string => !!x);
    const allAgree =
      existing.length === group.length && new Set(existing).size === 1;
    const gid = allAgree ? existing[0] : randomUUID();
    for (const a of group) assignments.set(a.id, gid);
  }

  for (const a of assets) {
    if (a.capturedAt === null) {
      assignments.set(a.id, a.burstGroupId ?? randomUUID());
    }
  }

  return assignments;
}

export async function recomputeBurstsForSession(
  sessionId: string
): Promise<{ updated: number }> {
  const db = getDb();
  const assets = await db
    .select({
      id: mediaAssets.id,
      capturedAt: mediaAssets.capturedAt,
      burstGroupId: mediaAssets.burstGroupId,
    })
    .from(mediaAssets)
    .where(eq(mediaAssets.shootSessionId, sessionId));

  if (assets.length === 0) return { updated: 0 };

  const assignments = assignGroups(assets);

  let updated = 0;
  for (const a of assets) {
    const gid = assignments.get(a.id);
    if (!gid) continue;
    if (a.burstGroupId === gid) continue;
    await db
      .update(mediaAssets)
      .set({ burstGroupId: gid, updatedAt: new Date() })
      .where(eq(mediaAssets.id, a.id));
    updated++;
  }

  return { updated };
}

export async function recomputeBurstsForPendingSessions(): Promise<{
  sessions: number;
  updated: number;
}> {
  const db = getDb();
  const rows = await db
    .selectDistinct({ shootSessionId: mediaAssets.shootSessionId })
    .from(mediaAssets)
    .where(isNull(mediaAssets.burstGroupId));

  let total = 0;
  for (const r of rows) {
    const { updated } = await recomputeBurstsForSession(r.shootSessionId);
    total += updated;
  }
  return { sessions: rows.length, updated: total };
}
