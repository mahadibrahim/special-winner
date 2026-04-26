import type { APIRoute } from "astro";
import { consumeMagicLink } from "@/lib/auth/magic-link";
import { lucia } from "@/lib/auth/lucia";
import type { MagicLinkPurpose } from "@/lib/db/schema/magic-links";

/**
 * Magic-link redemption endpoint.
 *
 * GET /m/:token — consumes the token atomically, creates a Lucia session
 * for the bound user, and redirects the browser to the purpose-specific
 * task page.
 *
 * This route is intentionally a plain APIRoute (not an .astro page) so the
 * redirect can happen before any HTML renders — the parent should land
 * directly on their destination, not see a flash of a landing page.
 */

export const prerender = false;

export const GET: APIRoute = async ({ params, cookies, redirect, url }) => {
  const token = params.token;

  if (!token || typeof token !== "string") {
    return redirect(expiredUrl(url.origin, "malformed"));
  }

  const result = await consumeMagicLink(token);

  if (!result.ok) {
    return redirect(expiredUrl(url.origin, result.reason));
  }

  // Create a Lucia session for the bound user
  const session = await lucia.createSession(result.userId, {});
  const sessionCookie = lucia.createSessionCookie(session.id);
  cookies.set(sessionCookie.name, sessionCookie.value, sessionCookie.attributes);

  // Redirect to purpose-specific landing page
  const destination = destinationFor(
    result.purpose,
    result.purposeContext,
    url.origin,
  );
  return redirect(destination);
};

function destinationFor(
  purpose: MagicLinkPurpose,
  context: Record<string, unknown> | null,
  origin: string,
): string {
  const ctx = context ?? {};

  switch (purpose) {
    case "login":
    case "password_reset_login": {
      const redirectTo = typeof ctx.redirectTo === "string" ? ctx.redirectTo : null;
      // Only honor relative paths starting with "/" to prevent open redirects.
      if (redirectTo && redirectTo.startsWith("/") && !redirectTo.startsWith("//")) {
        return redirectTo;
      }
      return "/dashboard";
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

function expiredUrl(origin: string, reason: string): string {
  const params = new URLSearchParams({ reason });
  return `/auth/link-expired?${params.toString()}`;
}
