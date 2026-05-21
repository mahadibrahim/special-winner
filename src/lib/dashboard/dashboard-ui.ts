// Panel + badge class constants shared by DashboardSection.astro (Astro) and
// the React island components. No lucide-react import here on purpose — keeps
// it safe to import from .astro files.

export type SectionAccent = "attention" | "default" | "explore";

/** Outer panel container, per section accent. */
export const PANEL_CLASS: Record<SectionAccent, string> = {
  attention: "rounded-2xl border border-ochre/30 bg-paper overflow-hidden",
  default:   "rounded-2xl border border-border bg-paper overflow-hidden",
  explore:   "rounded-2xl border border-sage/30 bg-paper overflow-hidden",
};

/** Panel header row. */
export const PANEL_HEADER_CLASS: Record<SectionAccent, string> = {
  attention: "flex items-center gap-2.5 px-4 py-3 border-b border-border bg-ochre/[0.07]",
  default:   "flex items-center gap-2.5 px-4 py-3 border-b border-border bg-cream/40",
  explore:   "flex items-center gap-2.5 px-4 py-3 border-b border-border bg-sage/[0.06]",
};

/** Tiny-caps section label. */
export const PANEL_LABEL_CLASS: Record<SectionAccent, string> = {
  attention: "text-[11px] font-semibold tracking-[0.15em] uppercase text-ochre",
  default:   "text-[11px] font-semibold tracking-[0.15em] uppercase text-ink-muted",
  explore:   "text-[11px] font-semibold tracking-[0.15em] uppercase text-sage",
};

/** Solid icon tile in the panel header. */
export const PANEL_ICON_CLASS: Record<SectionAccent, string> = {
  attention: "w-[22px] h-[22px] rounded-md flex items-center justify-center bg-ochre text-cream shrink-0",
  default:   "w-[22px] h-[22px] rounded-md flex items-center justify-center bg-primary text-cream shrink-0",
  explore:   "w-[22px] h-[22px] rounded-md flex items-center justify-center bg-sage text-cream shrink-0",
};

/** Panel body wrapper. */
export const PANEL_BODY_CLASS = "p-4 flex flex-col gap-2.5";

/** Status badge tones — design-system badge recipe. */
export type StatusTone = "confirmed" | "action" | "pending";
export const STATUS_BADGE: Record<StatusTone, string> = {
  confirmed: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20",
  action:    "bg-amber-500/10 text-amber-700 border-amber-500/20",
  pending:   "bg-cream-3 text-ink-2 border-border",
};

/**
 * Raw lucide SVG inner markup for the Astro DashboardSection header icons
 * (Astro cannot render lucide-react components). viewBox 24, stroke.
 */
export const SECTION_ICONS = {
  attention: '<path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/>',
  calendar:  '<rect x="3" y="4.5" width="18" height="17" rx="2.5"/><path d="M3 10h18M8 2v5M16 2v5"/>',
  shield:    '<path d="M12 3 4 6v5c0 5 3.4 8.5 8 10 4.6-1.5 8-5 8-10V6l-8-3Z"/>',
  compass:   '<circle cx="12" cy="12" r="9"/><path d="m15 9-4 1-1 4 4-1 1-4Z"/>',
} as const;

export type SectionIcon = keyof typeof SECTION_ICONS;
