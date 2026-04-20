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

export async function logMediaAction(params: {
  actorUserId: string | null;
  entityType: AuditEntity;
  entityId: string;
  action: AuditAction;
  diff?: Record<string, unknown> | null;
}): Promise<void> {
  await getDb().insert(mediaAuditLog).values({
    actorUserId: params.actorUserId,
    entityType: params.entityType,
    entityId: params.entityId,
    action: params.action,
    diff: params.diff ?? null,
  });
}
