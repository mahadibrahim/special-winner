/**
 * Returns a canonical form of an email address for uniqueness purposes.
 *
 * Gmail and Googlemail addresses are equivalent inboxes when dots and
 * +tags are stripped from the local-part: `a.g.i.v.o.b@gmail.com`,
 * `agivob@gmail.com`, and `agivob+spam@gmail.com` all resolve to the
 * same Gmail inbox. Bots exploit this to defeat naive uniqueness checks
 * (we saw 4 such signups on prod between 2026-05-05 and 2026-05-14 —
 * see security_prod-bot-signups memory).
 *
 * For non-Gmail domains, dots and +tags may be meaningful. Only lowercase
 * the whole address.
 */
export function normalizeForUniqueness(email: string): string {
  const lower = email.toLowerCase().trim();
  const atIdx = lower.lastIndexOf("@");
  if (atIdx <= 0) return lower;

  const local = lower.slice(0, atIdx);
  const domain = lower.slice(atIdx + 1);

  if (domain === "gmail.com" || domain === "googlemail.com") {
    const stripped = local.replace(/\./g, "").split("+")[0];
    return `${stripped}@gmail.com`;
  }

  return `${local}@${domain}`;
}
