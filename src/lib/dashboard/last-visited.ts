import type { AstroCookies } from "astro";

const COOKIE = "aspire_dash";

export function readLastVisited(cookies: AstroCookies): "family" | "play" | null {
  const v = cookies.get(COOKIE)?.value;
  return v === "family" || v === "play" ? v : null;
}

export function writeLastVisited(cookies: AstroCookies, value: "family" | "play"): void {
  cookies.set(COOKIE, value, {
    path: "/", httpOnly: true, sameSite: "lax", secure: import.meta.env.PROD,
    maxAge: 60 * 60 * 24 * 180, // 180 days
  });
}
