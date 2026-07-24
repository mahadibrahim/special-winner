import { expect } from "vitest";

const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:4321";

/**
 * Signs in with the given credentials and returns the auth_session cookie value.
 * The signin API returns 200 with a Set-Cookie header containing the session.
 */
export async function getAuthCookie(
  email: string,
  password: string
): Promise<string> {
  const res = await fetch(`${BASE_URL}/api/auth/signin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
    redirect: "manual",
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `Sign-in failed for ${email} (status ${res.status}): ${body}`
    );
  }

  const setCookie = res.headers.get("set-cookie");
  if (!setCookie) {
    throw new Error(
      `Sign-in for ${email} succeeded but no Set-Cookie header was returned`
    );
  }

  return setCookie;
}

/**
 * Convenience wrapper around fetch that prepends the base URL and sets
 * JSON content-type. Pass a cookie string to authenticate the request.
 */
export async function apiFetch(
  path: string,
  options: RequestInit & { cookie?: string } = {}
): Promise<Response> {
  const { cookie, headers: extraHeaders, ...rest } = options;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(extraHeaders as Record<string, string>),
  };

  if (cookie) {
    headers["Cookie"] = cookie;
  }

  return fetch(`${BASE_URL}${path}`, { headers, ...rest });
}

// ---- Cached cookies ----

let _adminCookie: string | null = null;
let _coachCookie: string | null = null;
let _parentCookie: string | null = null;
let _teamHubCaptainCookie: string | null = null;
let _mediaStaffCookie: string | null = null;
let _mediaEditorCookie: string | null = null;
let _refereeCookie: string | null = null;

/**
 * Returns a cached admin auth cookie. Signs in on first call.
 */
export async function getAdminCookie(): Promise<string> {
  if (!_adminCookie) {
    _adminCookie = await getAuthCookie(
      "admin@test.aspiresports.com",
      "TestAdmin123!"
    );
  }
  return _adminCookie;
}

/**
 * Returns a cached coach auth cookie. Signs in on first call.
 */
export async function getCoachCookie(): Promise<string> {
  if (!_coachCookie) {
    _coachCookie = await getAuthCookie(
      "coach@test.aspiresports.com",
      "TestCoach123!"
    );
  }
  return _coachCookie;
}

/**
 * Returns a cached parent auth cookie. Signs in on first call.
 */
export async function getParentCookie(): Promise<string> {
  if (!_parentCookie) {
    _parentCookie = await getAuthCookie(
      "parent@test.aspiresports.com",
      "TestParent123!"
    );
  }
  return _parentCookie;
}

/**
 * Returns a cached Team Hub captain auth cookie. Signs in on first call. This
 * is the dedicated adult-captain account (real @aspiresportsohio.com alias) that
 * owns the seeded Team Hub fixture.
 */
export async function getTeamHubCaptainCookie(): Promise<string> {
  if (!_teamHubCaptainCookie) {
    _teamHubCaptainCookie = await getAuthCookie(
      "teamhub-captain@aspiresportsohio.com",
      "TestCaptain123!"
    );
  }
  return _teamHubCaptainCookie;
}

/**
 * Returns a cached media staff auth cookie. Signs in on first call.
 */
export async function getMediaStaffCookie(): Promise<string> {
  if (!_mediaStaffCookie) {
    _mediaStaffCookie = await getAuthCookie(
      "media_staff@test.aspiresports.com",
      "TestMedia123!"
    );
  }
  return _mediaStaffCookie;
}

/**
 * Returns a cached media editor auth cookie. Signs in on first call.
 */
export async function getMediaEditorCookie(): Promise<string> {
  if (!_mediaEditorCookie) {
    _mediaEditorCookie = await getAuthCookie(
      "media_editor@test.aspiresports.com",
      "TestMedia123!"
    );
  }
  return _mediaEditorCookie;
}

/**
 * Returns a cached referee auth cookie for the seeded training referee
 * account (TRAINING_USERS.referee in src/lib/db/seeds/seed-e2e-tests.ts).
 * Signs in on first call.
 *
 * Note: this account is assigned to the shared "training-referee-gameday"
 * fixture match, not a per-test-run game — fine for tests that just need
 * *a* referee session (e.g. exercising the /referee portal generally), but
 * tests that need control over the match/venue (e.g. geofence-coordinate
 * scenarios) should self-seed a fresh referee + gameOfficials assignment
 * instead, same as tests/api/referee/report-preserves-ejections.test.ts.
 */
export async function getRefereeCookie(): Promise<string> {
  if (!_refereeCookie) {
    _refereeCookie = await getAuthCookie(
      "training+referee@test.aspiresports.com",
      "TestReferee123!"
    );
  }
  return _refereeCookie;
}

/**
 * Resets all cached cookies. Call in afterAll if needed.
 */
export function resetCookies(): void {
  _adminCookie = null;
  _coachCookie = null;
  _parentCookie = null;
  _teamHubCaptainCookie = null;
  _mediaStaffCookie = null;
  _mediaEditorCookie = null;
  _refereeCookie = null;
}

/**
 * Generates a unique slug for test data to avoid collisions.
 */
export function testSlug(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}-test-${Date.now()}-${rand}`;
}

/**
 * Asserts the response has the expected status code and returns parsed JSON.
 */
export async function expectJson(
  res: Response,
  status: number
): Promise<any> {
  expect(res.status).toBe(status);
  const json = await res.json();
  return json;
}
