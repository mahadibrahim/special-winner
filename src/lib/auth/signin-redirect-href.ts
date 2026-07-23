/**
 * Builds a same-origin `/signin?redirect=` href carrying the visitor's full
 * current path + query string, so magic-link redemption lands them back on
 * the exact page they started from (e.g. `/register/[seasonId]?audience=
 * adult`) instead of a bare season path that drops the mode/audience hint.
 *
 * Mirrors the `redirectParam` construction in `src/middleware.ts`'s
 * authed-route bounce. The consumer side (signin-form.tsx / signup-form.tsx
 * read this back off `window.location.search` and forward it as
 * `redirectTo`) validates it with `isSafeRelativePath` before honoring it —
 * see `src/lib/auth/magic-link-destination.ts`. This builder only ever
 * encodes trusted same-page `window.location` values, so it needs no
 * validation of its own.
 */
export function buildSigninRedirectHref(pathname: string, search = ""): string {
  return `/signin?redirect=${encodeURIComponent(pathname + search)}`
}
