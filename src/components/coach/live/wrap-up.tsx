"use client";

import type { AttendanceStatus, LivePayload } from "@/lib/sessions/types";
import type { QueueState } from "@/lib/sessions/capture-queue";

export interface WrapUpProps {
  payload: LivePayload;
  queue: QueueState;
  readOnly: boolean;
  onAttendance: (rosterId: string, status: AttendanceStatus) => void;
  onConsume: (clientIds: string[]) => void;
  onFinish: (reflection?: Record<string, unknown>) => Promise<boolean>;
}

// Placeholder — Task 9 replaces this body with the wrap-up UI (final
// attendance confirm, capture review/consume, reflection + finish). Signature
// is load-bearing; content is not.
export default function WrapUp(_props: WrapUpProps) {
  return <div data-testid="wrap-up" />;
}
