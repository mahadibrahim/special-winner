import { getBrandTheme, type BrandId } from "@/lib/branding/themes";

/**
 * The spectator waiver copy — the ONE place it is written.
 *
 * It lives in a leaf module (no server imports) because both sides need it:
 * the kiosk form renders it, and `spectator/sign.ts` stores the exact string it
 * rendered into `spectator_waivers.waiver_text_shown`. If the form showed one
 * paragraph and we filed another, the signed document proves nothing — the same
 * reason CONSENT_COPY is not inlined in its checkbox.
 *
 * The waiver names a legal entity, so the entity phrase comes from the brand
 * theme (themes.ts → waiverEntity), never a hardcoded brand name here. See
 * WaiverCard.tsx for the incident that rule comes from: an Aspire customer once
 * signed a waiver naming SoccerOne.
 *
 * This is the SPECTATOR text — someone entering the building to watch, not to
 * play. It deliberately says nothing about fitness to participate.
 */
export function spectatorWaiverText(brandId?: BrandId): string {
  const entity = getBrandTheme(brandId).waiverEntity;
  return `I am entering the facility as a spectator. I acknowledge the inherent risks of being present at a recreational sports facility, including stray balls, collisions, and slippery or uneven surfaces. I waive ${entity} from liability for injuries that occur while I am on the premises, and I agree to follow all posted facility rules and staff instructions.`;
}
