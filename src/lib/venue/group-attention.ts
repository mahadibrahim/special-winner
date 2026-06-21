import type { VenueAttentionItem } from "./today-types";

const ORDER: VenueAttentionItem["kind"][] = ["waiver", "photo", "ref", "request", "message"];
const LABELS: Record<VenueAttentionItem["kind"], string> = {
  waiver: "Waivers outstanding",
  photo: "Missing check-in photos",
  ref: "Unassigned referees",
  request: "Requests",
  message: "Messages",
};

export function groupAttention(items: VenueAttentionItem[]) {
  return ORDER.map((key) => {
    const groupItems = items.filter((i) => i.kind === key);
    return { key, label: LABELS[key], count: groupItems.length, items: groupItems };
  }).filter((g) => g.count > 0);
}

export function attentionTotal(items: VenueAttentionItem[]): number {
  return items.length;
}
