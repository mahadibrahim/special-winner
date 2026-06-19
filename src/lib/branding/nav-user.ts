export type NavUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
};

/**
 * Decide what user state BaseLayout embeds into the nav island.
 *
 * - `undefined` → "auth unknown, resolve client-side": Navigation fetches
 *   /api/auth/me itself. Used for prerendered pages AND edge-cached pages,
 *   so the rendered HTML carries no per-user data and is safe to cache and
 *   serve to every visitor.
 * - `null` → known-anonymous (SSR, not cached).
 * - object → known-authed (SSR, not cached).
 */
export function resolveNavUser(opts: {
  isPrerendered: boolean;
  edgeCached: boolean;
  user: NavUser | null;
}): NavUser | null | undefined {
  if (opts.isPrerendered || opts.edgeCached) return undefined;
  if (!opts.user) return null;
  return {
    id: opts.user.id,
    email: opts.user.email,
    firstName: opts.user.firstName,
    lastName: opts.user.lastName,
  };
}
