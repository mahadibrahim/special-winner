export type DropInSuccessPhase =
  | "none"
  | "finalizing"
  | "finalizing-timed-out"
  | "confirmed";

/**
 * Decide what the drop-in session page should show after a Stripe return.
 *
 * A paid checkout redirects to `?booking=success`, but the booking row is
 * created asynchronously by the `checkout.session.completed` webhook — so
 * for a beat the page has a successful return with no booking recorded
 * yet. During that window the page must show a "finalizing" state, never
 * the live "Book" button (which would invite a double payment).
 */
export function deriveDropInSuccessPhase(input: {
  bannerKind: "success" | "cancelled" | null;
  bookingStatus: string | null;
  pollExhausted: boolean;
}): DropInSuccessPhase {
  if (input.bannerKind !== "success") return "none";
  if (input.bookingStatus != null) return "confirmed";
  return input.pollExhausted ? "finalizing-timed-out" : "finalizing";
}
