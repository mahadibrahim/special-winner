import type { MagicLinkPurpose } from "@/lib/db/schema/magic-links";
import { resolvePostLoginTarget } from "@/lib/portal/resolve";

/**
 * Open-redirect guard. A redirect target is only safe to honor if it's a
 * site-relative path beginning with a single "/" — scheme-relative ("//host")
 * and absolute ("https://host") URLs are rejected so a crafted ?redirect=
 * can't bounce a freshly-authenticated session off-site.
 *
 * Shared by the magic-link issuers (which validate before storing the value
 * in purposeContext) and destinationFor (which validates again at redeem
 * time — defense in depth).
 */
export function isSafeRelativePath(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.startsWith("/") &&
    !value.startsWith("//")
  );
}

/**
 * Maps a redeemed magic-link to its post-login destination path.
 *
 * Pure function — testable in isolation. The consumer at /m/[token]
 * fetches the user's roles and passes `roleNames` so the "plain login"
 * case can route to the appropriate portal (hub for multi-role users,
 * portal home for single-role staff, dashboard for customers).
 *
 * Open-redirect protection: a context.redirectTo override is only honored
 * if it's a relative path beginning with "/" and not scheme-relative
 * ("//host" patterns are rejected).
 */
export function destinationFor(
  purpose: MagicLinkPurpose,
  context: Record<string, unknown> | null,
  _origin: string,
  opts: { roleNames: string[] },
): string {
  const ctx = context ?? {};

  switch (purpose) {
    case "login":
    case "password_reset_login": {
      if (isSafeRelativePath(ctx.redirectTo)) {
        return ctx.redirectTo;
      }
      return resolvePostLoginTarget(opts.roleNames);
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
