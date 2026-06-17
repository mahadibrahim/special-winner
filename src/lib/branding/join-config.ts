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

/** Shared subcopy — intentionally identical across brands for now. */
const DEFAULT_JOIN_SUBCOPY = "Pick one — or all three — and stay in the loop.";

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
    headline: "Three ways to join Aspire Sports",
    subcopy: DEFAULT_JOIN_SUBCOPY,
    socials: {
      instagram: "https://instagram.com/REPLACE_ME",
      facebook: "https://facebook.com/REPLACE_ME",
      youtube: "https://youtube.com/@REPLACE_ME",
      tiktok: "https://tiktok.com/@REPLACE_ME",
    },
  },
  soccerone: {
    headline: "Three ways to join SoccerOne",
    subcopy: DEFAULT_JOIN_SUBCOPY,
    socials: {
      instagram: "https://instagram.com/REPLACE_ME",
      facebook: "https://facebook.com/REPLACE_ME",
    },
  },
};

export function joinContentFor(brand: BrandId): JoinBrandContent {
  return JOIN_CONTENT[brand];
}
