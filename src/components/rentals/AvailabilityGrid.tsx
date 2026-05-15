"use client";

interface FreeBlock {
  startsAt: string;
  endsAt: string;
}

export interface FieldAvailability {
  fieldNumber: number;
  free: FreeBlock[];
}

interface Props {
  fields: FieldAvailability[];
  selectedFieldNumber: number | null;
  slotStart: Date | null;
  onSlotClick: (fieldNumber: number, slot: Date) => void;
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function hoursInBlock(block: FreeBlock): Date[] {
  const start = new Date(block.startsAt);
  const end = new Date(block.endsAt);
  const slots: Date[] = [];
  let cur = new Date(start);
  while (cur.getTime() + 60 * 60_000 <= end.getTime()) {
    slots.push(new Date(cur));
    cur = new Date(cur.getTime() + 60 * 60_000);
  }
  return slots;
}

export function AvailabilityGrid({
  fields,
  selectedFieldNumber,
  slotStart,
  onSlotClick,
}: Props) {
  return (
    <div className="space-y-4">
      {fields.map((field) => {
        if (field.free.length === 0) return null;
        return (
          <div
            key={field.fieldNumber}
            className="rounded-xl border border-stone-200 bg-white p-5"
          >
            <h2 className="text-base font-semibold text-stone-900 mb-3">
              Field {field.fieldNumber}
            </h2>
            <div className="space-y-3">
              {field.free.map((block) => {
                const slots = hoursInBlock(block);
                if (slots.length === 0) return null;
                return (
                  <div key={block.startsAt}>
                    <p className="text-xs text-stone-500 mb-2">
                      Available {fmtTime(block.startsAt)} – {fmtTime(block.endsAt)}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {slots.map((slot) => {
                        const isSelected =
                          selectedFieldNumber === field.fieldNumber &&
                          slotStart?.getTime() === slot.getTime();
                        return (
                          <button
                            key={slot.toISOString()}
                            type="button"
                            onClick={() => onSlotClick(field.fieldNumber, slot)}
                            className={`rounded-md border px-3 py-1.5 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-stone-500 ${
                              isSelected
                                ? "border-stone-900 bg-stone-900 text-white"
                                : "border-stone-300 bg-white text-stone-700 hover:border-stone-500 hover:bg-stone-50"
                            }`}
                          >
                            {fmtTime(slot.toISOString())}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
