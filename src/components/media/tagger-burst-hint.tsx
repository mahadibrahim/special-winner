"use client";

type Props = {
  burstSize: number;
  positionInBurst: number;
};

export function TaggerBurstHint({ burstSize, positionInBurst }: Props) {
  if (burstSize <= 1) return null;
  return (
    <div
      className="rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm text-amber-900"
      role="note"
      data-testid="burst-hint"
    >
      Burst {positionInBurst} of {burstSize} —{" "}
      <kbd className="rounded border bg-white px-1">Shift</kbd>+
      <kbd className="rounded border bg-white px-1">Enter</kbd> tags the whole
      burst.
    </div>
  );
}
