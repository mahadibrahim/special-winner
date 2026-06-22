/**
 * Allowlist for client-supplied photo URLs.
 *
 * Photos legitimately come from our own storage: Cloudinary delivery URLs
 * (res.cloudinary.com) and R2 (the configured R2_PUBLIC_URL host, or the
 * default *.r2.dev / *.r2.cloudflarestorage.com domains). Accepting an
 * arbitrary client URL let a user point a stored avatar at any external host —
 * a tracking pixel / content-spoof that loads in staff browsers. Constrain to
 * https + our own hosts.
 */

function allowedHosts(): Set<string> {
  const hosts = new Set<string>(["res.cloudinary.com"]);
  try {
    if (process.env.R2_PUBLIC_URL) {
      hosts.add(new URL(process.env.R2_PUBLIC_URL).hostname.toLowerCase());
    }
  } catch {
    // Malformed R2_PUBLIC_URL — leave it out of the allowlist.
  }
  return hosts;
}

export function isAllowedPhotoUrl(raw: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:") return false;
  const host = parsed.hostname.toLowerCase();
  return (
    allowedHosts().has(host) ||
    host.endsWith(".r2.dev") ||
    host.endsWith(".r2.cloudflarestorage.com")
  );
}
