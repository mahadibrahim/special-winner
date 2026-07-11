"use client";

import type { AttendanceStatus, CaptureInput, LivePayload } from "@/lib/sessions/types";
import type { QueueState } from "@/lib/sessions/capture-queue";

export interface FieldModeProps {
  payload: LivePayload;
  queue: QueueState;
  onCapture: (c: CaptureInput) => void;
  onAttendance: (rosterId: string, status: AttendanceStatus) => void;
  onEnd: () => void;
}

// Placeholder — Task 8 replaces this body with the in-session field UI
// (segment timer, glow/grow capture, attendance). Signature is load-bearing;
// content is not.
export default function FieldMode(_props: FieldModeProps) {
  return <div data-testid="field-mode" />;
}
