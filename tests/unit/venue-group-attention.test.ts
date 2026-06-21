import { describe, it, expect } from "vitest";
import { groupAttention, attentionTotal } from "@/lib/venue/group-attention";
import type { VenueAttentionItem } from "@/lib/venue/today-types";

const it_ = (kind: VenueAttentionItem["kind"], id: string): VenueAttentionItem =>
  ({ kind, id, title: id, subtitle: "" });

describe("groupAttention", () => {
  const items = [it_("photo", "p1"), it_("waiver", "w1"), it_("waiver", "w2"), it_("request", "r1")];
  it("groups by kind in display order, omitting empty groups", () => {
    const g = groupAttention(items);
    expect(g.map((x) => [x.key, x.count])).toEqual([["waiver", 2], ["photo", 1], ["request", 1]]);
  });
  it("labels groups", () => {
    expect(groupAttention(items)[0].label).toBe("Waivers outstanding");
  });
  it("totals all items", () => {
    expect(attentionTotal(items)).toBe(4);
  });
});
