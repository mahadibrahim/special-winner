// Lucia generates session IDs from a CSPRNG and stores them server-side; the
// cookie value is just an opaque random ID, not a signed token. There is no
// `AUTH_SECRET` to wire in — Lucia doesn't sign or HMAC anything. If a future
// auth piece (custom JWTs, signed-cookie middleware, etc.) ever needs a server
// secret, plumb it in through env at that layer.
import { Lucia } from "lucia";
import { DrizzlePostgreSQLAdapter } from "@lucia-auth/adapter-drizzle";
import { getDb } from "../db";
import { sessions, users } from "../db/schema";
import type { User } from "../db/schema/users";
import type { UserAttributes as DatabaseUserAttributes } from "./types";

// Lazy-load the adapter to avoid throwing at module initialization
// when DATABASE_URL is not set (e.g., in CI environments)
let _lucia: Lucia<Record<never, never>, DatabaseUserAttributes> | null = null;

function getLucia() {
  if (!_lucia) {
    const adapter = new DrizzlePostgreSQLAdapter(getDb(), sessions, users);
    _lucia = new Lucia(adapter, {
      sessionCookie: {
        attributes: {
          secure: import.meta.env.PROD,
        },
      },
      getUserAttributes: (attributes) => {
        return {
          email: attributes.email,
          emailVerified: attributes.emailVerified,
          firstName: attributes.firstName,
          lastName: attributes.lastName,
          birthDate: attributes.birthDate,
          phone: attributes.phone,
          gender: attributes.gender,
          avatarUrl: attributes.avatarUrl,
        };
      },
    });
  }
  return _lucia;
}

// Export a proxy that delegates to the lazy-loaded instance
export const lucia = new Proxy({} as ReturnType<typeof getLucia>, {
  get(_, prop) {
    const instance = getLucia();
    const value = (instance as any)[prop];
    if (typeof value === "function") {
      return value.bind(instance);
    }
    return value;
  },
});

declare module "lucia" {
  interface Register {
    Lucia: typeof lucia;
    DatabaseUserAttributes: DatabaseUserAttributes;
  }
}

export type Auth = typeof lucia;
