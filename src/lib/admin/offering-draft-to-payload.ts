import type { OfferingType } from "@/lib/admin/offering-types";
import type { OfferingDraft } from "@/components/admin/offering-wizard/DetailsStep";

const cents = (s: string) => (s.trim() === "" ? null : Math.round(parseFloat(s) * 100));
const intOrNull = (s: string) => (s.trim() === "" ? null : parseInt(s, 10));
const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");

export function draftToOfferingPayload(
  type: OfferingType,
  d: OfferingDraft,
  ctx: { locationId: string; sportId: string; publish: boolean },
) {
  const slug = d.slug.trim() !== "" ? d.slug.trim() : slugify(d.name);

  const signupModes: ("individual" | "team")[] =
    type === "tournament"
      ? ["team"]
      : type === "league" && d.teamPrice.trim() !== ""
        ? ["individual", "team"]
        : ["individual"];

  const priceCents =
    type === "tournament"
      ? (cents(d.teamPrice) ?? 0)
      : type === "league"
        ? (cents(d.individualPrice) ?? 0)
        : (cents(d.fullDayPrice) ?? 0);

  return {
    programType: type,
    locationId: ctx.locationId,
    sportId: ctx.sportId,
    name: d.name,
    slug,
    // Explicit, so a youth league is not caught by the offerings API's
    // "league => adults" fallback (offerings.ts:100). That fallback is what
    // made youth leagues render "per player" instead of "per kid".
    audienceType: d.audience === "adult" ? "adults" : "parents",
    season: {
      name: d.name,
      slug,
      startDate: d.startDate,
      endDate: d.endDate,
      startTime: d.dailyStartTime.trim() === "" ? null : d.dailyStartTime,
      endTime: d.dailyEndTime.trim() === "" ? null : d.dailyEndTime,
      priceCents,
      teamPriceCents: cents(d.teamPrice),
      halfDayPriceCents: cents(d.halfDayPrice),
      minAge: intOrNull(d.minAge),
      maxAge: intOrNull(d.maxAge),
      maxParticipants: intOrNull(d.capacity),
      depositCents: cents(d.deposit),
      allowDeposit: cents(d.deposit) != null,
      signupModes,
      divisionGender: d.divisionGender.trim() === "" ? null : d.divisionGender,
      skillLevel: d.skillLevel.trim() === "" ? null : d.skillLevel,
      status: ctx.publish ? "open" : "draft",
    },
  };
}
