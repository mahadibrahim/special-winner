import type { VenueAttentionItem } from "./today-types";

export type AttentionTarget =
  | { type: "session"; sessionId: string }
  | { type: "href"; href: string }
  | null;

/**
 * Single source of truth for where a needs-attention action goes.
 * Both hrefs must be reachable by location_admin — /admin/registrations and
 * /admin/messages (which doesn't exist) caused the ISS audit findings 3+4.
 */
export function attentionActionTarget(item: VenueAttentionItem): AttentionTarget {
  if (item.sessionId) return { type: "session", sessionId: item.sessionId };
  if (item.kind === "message") return { type: "href", href: "/messages" };
  if (item.kind === "request") return { type: "href", href: "/admin/refund-requests" };
  return null;
}
