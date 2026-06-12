import { getDb } from "@/lib/db";
import { mediaAuditLog } from "@/lib/db/schema/media";

export type AuditEntity = "asset" | "tag" | "session" | "agreement";
export type AuditAction =
  | "create"
  | "update"
  | "delete"
  | "approve"
  | "publish"
  | "revoke";

export interface MediaAuditEntry {
  actorUserId: string | null;
  entityType: AuditEntity;
  entityId: string;
  action: AuditAction;
  diff?: Record<string, unknown> | null;
}

export async function logMediaAction(params: MediaAuditEntry): Promise<void> {
  await logMediaActions([params]);
}

/** Multi-row variant for bulk paths (e.g. batch tagging) — one INSERT. */
export async function logMediaActions(entries: MediaAuditEntry[]): Promise<void> {
  if (entries.length === 0) return;
  await getDb()
    .insert(mediaAuditLog)
    .values(
      entries.map((e) => ({
        actorUserId: e.actorUserId,
        entityType: e.entityType,
        entityId: e.entityId,
        action: e.action,
        diff: e.diff ?? null,
      })),
    );
}
