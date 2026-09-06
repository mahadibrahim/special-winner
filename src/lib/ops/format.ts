export type OpsPingEvent =
  | { kind: "registration_paid"; brand: string; eventId: string; label: string; amountCents: number }
  | { kind: "team_reserved"; brand: string; eventId: string; label: string; amountCents: number }
  | { kind: "team_backstop_charged"; brand: string; eventId: string; label: string; amountCents: number }
  | { kind: "team_backstop_failed"; brand: string; eventId: string; label: string }
  | { kind: "team_deposit_refunded"; brand: string; eventId: string; label: string; amountCents: number }
  | { kind: "dropin_booked"; brand: string; eventId: string; label: string; amountCents: number }
  | { kind: "rental_confirmed"; brand: string; eventId: string; label: string; amountCents: number }
  | { kind: "membership_started"; brand: string; eventId: string; label: string; amountCents: number }
  | { kind: "payment_succeeded"; brand: string; eventId: string; label: string; amountCents: number }
  | { kind: "class_pack_purchased"; brand: string; eventId: string; label: string; amountCents: number }
  | { kind: "class_block_purchased"; brand: string; eventId: string; label: string; amountCents: number }
  | { kind: "user_signup"; brand: string; eventId: string; label: string }
  | { kind: "job_application"; brand: string; eventId: string; label: string }
  | { kind: "host_incident"; brand: string; eventId: string; label: string }
  | { kind: "test"; brand: string; eventId: string; label: string };

/** Max instant pings per rolling hour before overflow collapses. */
export const OPS_PING_RATE_LIMIT_PER_HOUR = 10;

/** Kinds that ping immediately. user_signup is digest-only by design. */
export const INSTANT_KINDS: ReadonlySet<string> = new Set([
  "registration_paid",
  "team_reserved",
  "team_backstop_charged",
  "team_backstop_failed",
  "team_deposit_refunded",
  "dropin_booked",
  "rental_confirmed",
  "membership_started",
  "payment_succeeded",
  "class_pack_purchased",
  "class_block_purchased",
  "job_application",
  "host_incident",
  "test",
]);

export const OPS_PING_KIND_LABELS: Record<OpsPingEvent["kind"], string> = {
  registration_paid: "Registration",
  team_reserved: "Team reserved",
  team_backstop_charged: "Team backstop charged",
  team_backstop_failed: "Team backstop FAILED",
  team_deposit_refunded: "Team deposit refunded",
  dropin_booked: "Drop-in",
  rental_confirmed: "Rental",
  membership_started: "Membership",
  payment_succeeded: "Payment",
  class_pack_purchased: "Class pack",
  class_block_purchased: "Class block",
  user_signup: "New user",
  job_application: "Job application",
  host_incident: "Host incident",
  test: "Test ping",
};

const KIND_EMOJI: Record<OpsPingEvent["kind"], string> = {
  registration_paid: "💰",
  team_reserved: "🏆",
  team_backstop_charged: "💰",
  team_backstop_failed: "🚨",
  team_deposit_refunded: "💸",
  dropin_booked: "💰",
  rental_confirmed: "💰",
  membership_started: "💰",
  payment_succeeded: "💰",
  class_pack_purchased: "💰",
  class_block_purchased: "💰",
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
