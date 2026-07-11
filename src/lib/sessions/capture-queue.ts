import type { AttendanceStatus, CaptureInput } from "./types";

export interface FlushEnvelope {
  captures: CaptureInput[];
  attendance: Array<{ rosterId: string; status: AttendanceStatus }>;
  consumedClientIds: string[];
}

export interface QueueState {
  captures: CaptureInput[];
  attendance: Record<string, AttendanceStatus>;
  consumedClientIds: string[];
}

export const emptyQueue: QueueState = { captures: [], attendance: {}, consumedClientIds: [] };

export function enqueueCapture(q: QueueState, c: CaptureInput): QueueState {
  return { ...q, captures: [...q.captures.filter((x) => x.clientId !== c.clientId), c] };
}

export function enqueueAttendance(
  q: QueueState, rosterId: string, status: AttendanceStatus,
): QueueState {
  return { ...q, attendance: { ...q.attendance, [rosterId]: status } };
}

export function enqueueConsume(q: QueueState, clientIds: string[]): QueueState {
  const merged = [...q.consumedClientIds];
  for (const id of clientIds) if (!merged.includes(id)) merged.push(id);
  return { ...q, consumedClientIds: merged };
}

export function buildEnvelope(q: QueueState): FlushEnvelope | null {
  const attendance = Object.entries(q.attendance).map(([rosterId, status]) => ({ rosterId, status }));
  if (q.captures.length === 0 && attendance.length === 0 && q.consumedClientIds.length === 0) {
    return null;
  }
  return { captures: [...q.captures], attendance, consumedClientIds: [...q.consumedClientIds] };
}

/** Remove exactly what a successful flush sent; writes that arrived mid-flight survive. */
export function markFlushed(q: QueueState, sent: FlushEnvelope): QueueState {
  const sentIds = new Set(sent.captures.map((c) => c.clientId));
  const sentConsumed = new Set(sent.consumedClientIds);
  const attendance: Record<string, AttendanceStatus> = {};
  for (const [rosterId, status] of Object.entries(q.attendance)) {
    const sentRow = sent.attendance.find((a) => a.rosterId === rosterId);
    if (!sentRow || sentRow.status !== status) attendance[rosterId] = status;
  }
  return {
    captures: q.captures.filter((c) => !sentIds.has(c.clientId)),
    attendance,
    consumedClientIds: q.consumedClientIds.filter((id) => !sentConsumed.has(id)),
  };
}

export function serializeQueue(q: QueueState): string {
  return JSON.stringify(q);
}

export function restoreQueue(raw: string | null): QueueState {
  if (!raw) return emptyQueue;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.captures)) return emptyQueue;
    return {
      captures: parsed.captures,
      attendance: parsed.attendance ?? {},
      consumedClientIds: parsed.consumedClientIds ?? [],
    };
  } catch {
    return emptyQueue;
  }
}
