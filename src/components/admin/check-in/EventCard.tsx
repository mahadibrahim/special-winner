"use client";

interface Props {
  event: {
    kind: "drop_in_session" | "game" | "field_rental";
    id: string;
    startsAt: string;
    endsAt: string;
    fieldNumber: number | null;
    title: string;
    subtitle: string | null;
    counts: { expected: number; waiversOutstanding: number; checkedIn: number };
  };
  onOpen?: () => void; // T19 wires the drawer
}

const kindLabel: Record<Props["event"]["kind"], string> = {
  drop_in_session: "Pickup / Class",
  game: "Game",
  field_rental: "Field rental",
};

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function EventCard({ event, onOpen }: Props) {
  const start = fmtTime(event.startsAt);
  const end = fmtTime(event.endsAt);
  const field = event.fieldNumber != null ? `Field ${event.fieldNumber}` : null;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full text-left rounded-lg border bg-white p-4 hover:border-stone-400 transition flex items-center justify-between gap-3"
    >
      <div>
        <div className="text-xs uppercase tracking-wide text-stone-500">
          {kindLabel[event.kind]}
        </div>
        <div className="text-sm font-medium">
          {start}&ndash;{end} {field ? `· ${field}` : ""}
        </div>
        <div className="text-base">{event.title}</div>
        {event.subtitle && (
          <div className="text-sm text-stone-500">{event.subtitle}</div>
        )}
      </div>
      <div className="flex flex-col items-end gap-1 text-xs">
        <span className="bg-stone-100 px-2 py-0.5 rounded-full">
          {event.counts.expected} booked
        </span>
        {event.counts.waiversOutstanding > 0 && (
          <span className="bg-amber-100 text-amber-900 px-2 py-0.5 rounded-full">
            {event.counts.waiversOutstanding} waivers out
          </span>
        )}
        <span className="text-stone-500">
          {event.counts.checkedIn} here
        </span>
      </div>
    </button>
  );
}
