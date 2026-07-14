export type OpsPingEvent =
  | { kind: "registration_paid"; brand: string; eventId: string; label: string; amountCents: number }
  | { kind: "dropin_booked"; brand: string; eventId: string; label: string; amountCents: number }
  | { kind: "rental_confirmed"; brand: string; eventId: string; label: string; amountCents: number }
  | { kind: "membership_started"; brand: string; eventId: string; label: string; amountCents: number }
  | { kind: "payment_succeeded"; brand: string; eventId: string; label: string; amountCents: number }
  | { kind: "user_signup"; brand: string; eventId: string; label: string }
  | { kind: "job_application"; brand: string; eventId: string; label: string }
  | { kind: "host_incident"; brand: string; eventId: string; label: string }
  | { kind: "test"; brand: string; eventId: string; label: string };

/** Max instant pings per rolling hour before overflow collapses. */
export const OPS_PING_RATE_LIMIT_PER_HOUR = 10;

/** Kinds that ping immediately. user_signup is digest-only by design. */
export const INSTANT_KINDS: ReadonlySet<string> = new Set([
  "registration_paid",
  "dropin_booked",
  "rental_confirmed",
  "membership_started",
  "payment_succeeded",
  "job_application",
  "host_incident",
  "test",
]);

export const OPS_PING_KIND_LABELS: Record<OpsPingEvent["kind"], string> = {
  registration_paid: "Registration",
  dropin_booked: "Drop-in",
  rental_confirmed: "Rental",
  membership_started: "Membership",
  payment_succeeded: "Payment",
  user_signup: "New user",
  job_application: "Job application",
  host_incident: "Host incident",
  test: "Test ping",
};

const KIND_EMOJI: Record<OpsPingEvent["kind"], string> = {
  registration_paid: "💰",
  dropin_booked: "💰",
  rental_confirmed: "💰",
  membership_started: "💰",
  payment_succeeded: "💰",
  user_signup: "👤",
  job_application: "📝",
  host_incident: "🚨",
  test: "🔔",
};

export function formatBrandTag(brand: string): string {
  if (brand === "aspire") return "[Aspire]";
  if (brand === "soccerone") return "[SoccerOne]";
  return `[${brand.charAt(0).toUpperCase()}${brand.slice(1)}]`;
}

export function formatOpsPingMessage(event: OpsPingEvent): string {
  const head = `${KIND_EMOJI[event.kind]} ${formatBrandTag(event.brand)} ${OPS_PING_KIND_LABELS[event.kind]} — ${event.label}`;
  if ("amountCents" in event) {
    return `${head}, $${(event.amountCents / 100).toFixed(2)}`;
  }
  return head;
}
