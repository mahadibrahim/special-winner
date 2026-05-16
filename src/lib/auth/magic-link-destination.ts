import type { MagicLinkPurpose } from "@/lib/db/schema/magic-links";

/**
 * Maps a redeemed magic-link to its post-login destination path.
 *
 * Pure function — testable in isolation. The consumer at /m/[token]
 * fetches the user's roles and passes `isAdminRole` so the "plain login"
 * case can route admins to /admin instead of /dashboard.
 *
 * Open-redirect protection: a context.redirectTo override is only honored
 * if it's a relative path beginning with "/" and not scheme-relative
 * ("//host" patterns are rejected).
 */
export function destinationFor(
  purpose: MagicLinkPurpose,
  context: Record<string, unknown> | null,
  _origin: string,
  opts: { isAdminRole: boolean },
): string {
  const ctx = context ?? {};

  switch (purpose) {
    case "login":
    case "password_reset_login": {
      const redirectTo = typeof ctx.redirectTo === "string" ? ctx.redirectTo : null;
      if (redirectTo && redirectTo.startsWith("/") && !redirectTo.startsWith("//")) {
        return redirectTo;
      }
      return opts.isAdminRole ? "/admin" : "/dashboard";
    }

    case "pay_invoice": {
      const invoiceId = typeof ctx.invoiceId === "string" ? ctx.invoiceId : null;
      if (invoiceId) {
        return `/dashboard/payments/${invoiceId}/pay`;
      }
      return "/dashboard/payments";
    }

    case "register_for_season": {
      const seasonId = typeof ctx.seasonId === "string" ? ctx.seasonId : null;
      if (seasonId) {
        return `/register/${seasonId}?returning=1`;
      }
      return "/#programs";
    }

    case "view_development_report": {
      const kidId = typeof ctx.kidId === "string" ? ctx.kidId : null;
      if (kidId) {
        return `/dashboard/children/${kidId}/development`;
      }
      return "/dashboard";
    }

    case "update_medical_info": {
      const kidId = typeof ctx.kidId === "string" ? ctx.kidId : null;
      if (kidId) {
        return `/dashboard/children/${kidId}?edit=medical`;
      }
      return "/dashboard";
    }

    case "update_phone":
      return "/dashboard/settings?section=phone";

    case "view_season_summary": {
      const seasonId = typeof ctx.seasonId === "string" ? ctx.seasonId : null;
      if (seasonId) {
        return `/dashboard/seasons/${seasonId}/summary`;
      }
      return "/dashboard";
    }

    default:
      return "/dashboard";
  }
}
