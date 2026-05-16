/**
 * Validates a Cloudflare Turnstile token against Cloudflare's siteverify
 * endpoint. Fails closed in production when the secret is missing; fails
 * open in dev for fast iteration.
 *
 * Cloudflare Turnstile is a CAPTCHA replacement: it issues a token on
 * the client when the user clears the (mostly invisible) bot check, and
 * we verify that token on the server before allowing high-value actions.
 */

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export type TurnstileOpts = {
  secret: string | undefined;
  isProd: boolean;
};

export async function verifyTurnstile(
  token: string,
  opts: TurnstileOpts,
): Promise<boolean> {
  // No secret configured: fail-closed in prod (so bots can't skate by
  // just because we forgot to set the env var), fail-open in dev (so
  // local iteration isn't gated on a Cloudflare account).
  if (!opts.secret) {
    return !opts.isProd;
  }
  if (!token) return false;

  try {
    const body = new URLSearchParams();
    body.append("secret", opts.secret);
    body.append("response", token);
    const res = await fetch(VERIFY_URL, { method: "POST", body });
    if (!res.ok) return false;
    const data = (await res.json()) as { success: boolean };
    return Boolean(data.success);
  } catch {
    return false;
  }
}
