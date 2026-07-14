"use client";

/**
 * On-screen numeric keypad for the kiosk.
 *
 * The kiosk is a mounted iPad in a lobby — a focused <input> pops the iOS
 * software keyboard, which covers roughly half the screen and buries the
 * results list. A keypad keeps the whole flow visible, and the search only
 * takes digits anyway (see the kiosk search endpoint).
 */

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"];

export function PhoneKeypad({
  value,
  onChange,
  maxLength = 10,
}: {
  value: string;
  onChange: (v: string) => void;
  maxLength?: number;
}) {
  const press = (k: string) => {
    if (k === "") return;
    if (k === "⌫") {
      onChange(value.slice(0, -1));
      return;
    }
    if (value.length >= maxLength) return;
    onChange(value + k);
  };

  return (
    <div className="grid grid-cols-3 gap-3">
      {KEYS.map((k, i) => (
        <button
          key={i}
          type="button"
          disabled={k === ""}
          onClick={() => press(k)}
          aria-label={k === "⌫" ? "Delete" : k || undefined}
          className={
            k === ""
              ? "invisible h-20"
              : "h-20 rounded-xl border border-border bg-paper text-2xl font-medium text-ink transition-colors hover:bg-cream-2 active:scale-[0.98]"
          }
        >
          {k}
        </button>
      ))}
    </div>
  );
}
