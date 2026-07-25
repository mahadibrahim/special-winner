"use client";

import { CONSENT_CHANNELS, CONSENT_COPY, type ConsentChannel } from "@/lib/consents/marketing-channels";

/**
 * Every box renders UNCHECKED. This is not a style preference — a pre-checked
 * opt-in is exactly what got this project's 10DLC registration DECLINED on
 * 2026-07-13 ("the opt-in form needed an unchecked checkbox"). There is a test
 * that fails if any box defaults to checked. Do not "helpfully" pre-select one.
 *
 * The copy comes from CONSENT_COPY and nowhere else: the sentence displayed
 * here is stored verbatim with the consent record, and a carrier reviewer
 * compares the two.
 */
export function ConsentBoxes({
  selected,
  onChange,
}: {
  selected: ConsentChannel[];
  onChange: (next: ConsentChannel[]) => void;
}) {
  const toggle = (c: ConsentChannel) =>
    onChange(selected.includes(c) ? selected.filter((x) => x !== c) : [...selected, c]);

  return (
    <fieldset className="space-y-2">
      <legend className="text-sm text-ink-muted pb-2">
        Optional — you can come in either way.
      </legend>
      {CONSENT_CHANNELS.map((c) => (
        <label
          key={c}
          className="flex items-start gap-3 min-h-[60px] p-4 rounded-xl border border-border bg-paper cursor-pointer hover:bg-cream-2 transition-colors"
        >
          <input
            type="checkbox"
            checked={selected.includes(c)}
            onChange={() => toggle(c)}
            className="mt-1 w-5 h-5 accent-primary"
          />
          <span className="text-base text-ink leading-relaxed">{CONSENT_COPY[c]}</span>
        </label>
      ))}
    </fieldset>
  );
}
