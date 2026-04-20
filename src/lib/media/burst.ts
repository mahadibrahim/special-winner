import { randomUUID } from "node:crypto";

export type BurstInputAsset = {
  id: string;
  capturedAt: Date | null;
};

export function computeBurstGroups(
  assets: BurstInputAsset[]
): Map<string, string> {
  const result = new Map<string, string>();

  const dated: BurstInputAsset[] = [];
  for (const a of assets) {
    if (a.capturedAt === null) {
      result.set(a.id, randomUUID());
    } else {
      dated.push(a);
    }
  }

  dated.sort(
    (a, b) =>
      (a.capturedAt as Date).getTime() - (b.capturedAt as Date).getTime()
  );

  let currentGroup = randomUUID();
  let prevMs: number | null = null;

  for (const a of dated) {
    const ms = (a.capturedAt as Date).getTime();
    if (prevMs !== null && ms - prevMs > 2000) {
      currentGroup = randomUUID();
    }
    result.set(a.id, currentGroup);
    prevMs = ms;
  }

  return result;
}
