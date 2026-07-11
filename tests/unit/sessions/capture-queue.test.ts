import { describe, it, expect } from "vitest";
import {
  emptyQueue, enqueueCapture, enqueueAttendance, enqueueConsume,
  buildEnvelope, markFlushed, serializeQueue, restoreQueue,
} from "@/lib/sessions/capture-queue";
import type { CaptureInput } from "@/lib/sessions/types";

const cap = (clientId: string): CaptureInput => ({
  clientId, rosterId: "r1", kind: "glow", skillId: null, note: null,
});

describe("capture queue", () => {
  it("dedupes captures by clientId (last write wins)", () => {
    let q = enqueueCapture(emptyQueue, cap("c1"));
    q = enqueueCapture(q, { ...cap("c1"), note: "updated" });
    expect(q.captures).toHaveLength(1);
    expect(q.captures[0].note).toBe("updated");
  });

  it("attendance is last-wins per roster", () => {
    let q = enqueueAttendance(emptyQueue, "r1", "absent");
    q = enqueueAttendance(q, "r1", "present");
    expect(q.attendance).toEqual({ r1: "present" });
  });

  it("buildEnvelope returns null when empty, envelope otherwise", () => {
    expect(buildEnvelope(emptyQueue)).toBeNull();
    const q = enqueueCapture(emptyQueue, cap("c1"));
    expect(buildEnvelope(q)?.captures).toHaveLength(1);
  });

  it("markFlushed removes exactly what was sent; later writes survive", () => {
    let q = enqueueCapture(emptyQueue, cap("c1"));
    const envelope = buildEnvelope(q)!;
    q = enqueueCapture(q, cap("c2")); // arrives mid-flight
    q = markFlushed(q, envelope);
    expect(q.captures.map((c) => c.clientId)).toEqual(["c2"]);
  });

  it("consume queue accumulates and flushes", () => {
    let q = enqueueConsume(emptyQueue, ["c1", "c2"]);
    q = enqueueConsume(q, ["c2", "c3"]);
    expect(buildEnvelope(q)?.consumedClientIds).toEqual(["c1", "c2", "c3"]);
  });

  it("serialize/restore round-trips; restore tolerates garbage", () => {
    const q = enqueueAttendance(enqueueCapture(emptyQueue, cap("c1")), "r2", "late");
    expect(restoreQueue(serializeQueue(q))).toEqual(q);
    expect(restoreQueue(null)).toEqual(emptyQueue);
    expect(restoreQueue("{not json")).toEqual(emptyQueue);
  });
});
