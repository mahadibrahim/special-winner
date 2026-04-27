/**
 * Single source of truth for the user attributes that flow from the DB
 * (via Lucia's adapter) to `Astro.locals.user`. Adding a new column to
 * the `users` table? Update this interface — both lucia.ts and env.d.ts
 * pick it up automatically.
 */
export interface UserAttributes {
  id: string;
  email: string;
  emailVerified: boolean;
  firstName: string | null;
  lastName: string | null;
  birthDate: string | null;
  avatarUrl: string | null;
  phone?: string | null;
}
