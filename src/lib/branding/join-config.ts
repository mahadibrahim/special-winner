import type { BrandId } from "@/lib/branding/themes";

/**
 * Per-brand content for the /join landing page. Link values are content
 * placeholders (REPLACE_ME…) until the founder supplies the real accounts —
 * see docs/superpowers/specs/2026-06-16-join-page-design.md.
 *
 * Theming (cream vs dark/lime) is NOT here — it comes from the html[data-brand]
 * CSS-var system applied by BaseLayout. This module is content only.
 */

/** One WhatsApp group link shared by both brands (decision 2026-06-16). */
export const JOIN_WHATSAPP_URL = "https://chat.whatsapp.com/REPLACE_ME";

/**
 * Shared subcopy — intentionally identical across brands for now.
 * Deliberately count-agnostic: channels render conditionally (an unset
 * WhatsApp group or an uncreated YouTube channel is simply not shown), so
 * copy that names a number goes stale the moment one is added or removed.
 */
const DEFAULT_JOIN_SUBCOPY = "Pick one — or all of them — and stay in the loop.";

export interface JoinSocialLinks {
  instagram?: string;
  facebook?: string;
  youtube?: string;
  tiktok?: string;
}

export interface JoinBrandContent {
  headline: string;
  subcopy: string;
  socials: JoinSocialLinks;
}

const JOIN_CONTENT: Record<BrandId, JoinBrandContent> = {
  aspire: {
    headline: "Join Aspire Sports",
    subcopy: DEFAULT_JOIN_SUBCOPY,
    socials: {
      // Confirmed live. TikTok is omitted because no account exists — add a
      // key only when its profile is real, since every key here renders a
      // button.
      instagram: "https://www.instagram.com/aspiresportsohio",
      facebook: "https://www.facebook.com/aspiresportsohio",
      // Channel-ID form, not the @AspireSportsOhio handle, deliberately:
      // handles are editable and this channel is still to be customized, so
      // a handle URL can break without warning. The channel ID is permanent
      // and is what YouTube itself reports as the canonical og:url.
      youtube: "https://www.youtube.com/channel/UC7EHJoPzl1YDRoElIH2FoLw",
    },
  },
  soccerone: {
    headline: "Join SoccerOne",
    subcopy: DEFAULT_JOIN_SUBCOPY,
    // SoccerOne's accounts are not confirmed — neither gosoccerone.com nor
    // this repo references one. Left empty rather than stubbed: a key here
    // renders a button, and placeholders are what put five dead links on
    // Aspire's /join. Add real URLs when the handles are known.
    socials: {},
  },
};

export function joinContentFor(brand: BrandId): JoinBrandContent {
  return JOIN_CONTENT[brand];
}

/**
 * True only when a link points at a real account.
 *
 * Placeholder URLs are syntactically valid, so a plain truthiness check
 * happily renders them — which is exactly how /join shipped five live
 * buttons to instagram.com/REPLACE_ME. Every surface that renders one of
 * these links must gate on this, not on `Boolean(url)`.
 */
export function isConfiguredLink(url: string | undefined | null): url is string {
  return typeof url === "string" && url.length > 0 && !url.includes("REPLACE_ME");
}
