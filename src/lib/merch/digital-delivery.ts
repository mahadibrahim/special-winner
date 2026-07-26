/** Generate a url-safe download token (32 hex characters). */
export function generateDownloadToken(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

/** Calculate the expiry date 6 months after purchase. Does not mutate input. */
export function grantExpiryFrom(purchasedAt: Date): Date {
  const expiry = new Date(purchasedAt);
  const currentMonth = expiry.getMonth();
  expiry.setMonth(currentMonth + 6);
  return expiry;
}

/** Check if a grant has expired relative to the given time. */
export function isGrantExpired(
  grant: { expiresAt: Date },
  now: Date,
): boolean {
  return now > grant.expiresAt;
}
