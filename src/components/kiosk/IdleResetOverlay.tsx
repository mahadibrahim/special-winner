"use client";

/**
 * Full-screen "are you still there?" warning shown after a period of no
 * touch/keyboard activity on any kiosk screen that may be holding a
 * customer's personal details (name, email, phone, DOB). Counts down to a
 * hard reset — see the idle-timer effect in KioskRoot.
 */
export function IdleResetOverlay({
  secondsLeft,
  onStay,
}: {
  secondsLeft: number;
  onStay: () => void;
}) {
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-label="Are you still there?"
      className="fixed inset-0 z-50 flex items-center justify-center bg-cream/95 p-6"
    >
      <div className="w-full max-w-md space-y-5 rounded-xl border border-border bg-paper p-8 text-center">
        <h2 className="font-display text-3xl font-medium italic text-ink">
          Still there?
        </h2>
        <p className="text-sm text-ink-muted">
          We'll clear this screen in {secondsLeft}s to protect your details.
        </p>
        <button
          type="button"
          onClick={onStay}
          className="w-full min-h-[60px] rounded-xl bg-primary px-6 py-4 text-base font-medium text-cream transition-all hover:bg-primary/90 active:scale-[0.99]"
        >
          I'm still here
        </button>
      </div>
    </div>
  );
}
