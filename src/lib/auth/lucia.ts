import { Lucia } from "lucia";
import { DrizzlePostgreSQLAdapter } from "@lucia-auth/adapter-drizzle";
import { getDb } from "../db";
import { sessions, users } from "../db/schema";
import type { User } from "../db/schema/users";

// Lazy-load the adapter to avoid throwing at module initialization
// when DATABASE_URL is not set (e.g., in CI environments)
let _lucia: Lucia<
  Record<never, never>,
  {
    email: string;
    emailVerified: boolean;
    firstName: string | null;
    lastName: string | null;
    avatarUrl: string | null;
  }
> | null = null;

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

interface DatabaseUserAttributes {
  email: string;
  emailVerified: boolean;
  firstName: string | null;
  lastName: string | null;
  avatarUrl: string | null;
}

export type Auth = typeof lucia;
