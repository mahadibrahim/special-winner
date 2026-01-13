import type { APIContext } from "astro";
import { lucia } from "./lucia";
import type { Session, User } from "lucia";

export async function validateSession(
  context: APIContext
): Promise<{ user: User; session: Session } | { user: null; session: null }> {
  const sessionId = context.cookies.get(lucia.sessionCookieName)?.value ?? null;

  if (!sessionId) {
    return { user: null, session: null };
  }

  const result = await lucia.validateSession(sessionId);

  if (result.session && result.session.fresh) {
    const sessionCookie = lucia.createSessionCookie(result.session.id);
    context.cookies.set(sessionCookie.name, sessionCookie.value, sessionCookie.attributes);
  }

  if (!result.session) {
    const sessionCookie = lucia.createBlankSessionCookie();
    context.cookies.set(sessionCookie.name, sessionCookie.value, sessionCookie.attributes);
  }

  return result;
}

export async function createSession(userId: string, context: APIContext): Promise<Session> {
  const session = await lucia.createSession(userId, {});
  const sessionCookie = lucia.createSessionCookie(session.id);
  context.cookies.set(sessionCookie.name, sessionCookie.value, sessionCookie.attributes);
  return session;
}

export async function invalidateSession(context: APIContext): Promise<void> {
  const sessionId = context.cookies.get(lucia.sessionCookieName)?.value ?? null;

  if (sessionId) {
    await lucia.invalidateSession(sessionId);
  }

  const sessionCookie = lucia.createBlankSessionCookie();
  context.cookies.set(sessionCookie.name, sessionCookie.value, sessionCookie.attributes);
}
