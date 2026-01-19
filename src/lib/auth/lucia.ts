import { Lucia } from "lucia";
import { DrizzlePostgreSQLAdapter } from "@lucia-auth/adapter-drizzle";
import { getDb } from "../db";
import { sessions, users } from "../db/schema";
import type { User } from "../db/schema/users";

const adapter = new DrizzlePostgreSQLAdapter(getDb(), sessions, users);

export const lucia = new Lucia(adapter, {
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
