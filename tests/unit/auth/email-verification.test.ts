import { describe, it, expect, vi } from "vitest";
import { consumeEmailVerificationToken } from "@/lib/auth/email-verification";
import { hashToken } from "@/lib/auth/token-hash";

/**
 * Regression guard for the prod incident where EVERY email verification link
 * said "invalid or has expired." The link opens verify-email/[token].astro,
 * which looked up the token by the RAW value — but send-verification.ts stores
 * only the SHA-256 digest (hashToken). Raw ≠ digest, so no row ever matched.
 *
 * The shared consumer must hash the presented token before lookup (matching
 * storage), and must refresh sessions on success (signin caps unverified
 * sessions to 1h and relies on verification to extend them to 30 days).
 */
describe("consumeEmailVerificationToken", () => {
  it("looks up the token by its SHA-256 digest, never the raw token", async () => {
    const raw = "0123456789abcdef";
    const findValidToken = vi.fn().mockResolvedValue({ userId: "user-1" });
    const markVerifiedAndRefreshSessions = vi.fn().mockResolvedValue(undefined);

    const result = await consumeEmailVerificationToken(raw, {
      findValidToken,
      markVerifiedAndRefreshSessions,
    });

    // The exact bug: the page queried by `raw`. It must query by the digest.
    expect(findValidToken).toHaveBeenCalledWith(hashToken(raw));
    expect(findValidToken).not.toHaveBeenCalledWith(raw);
    expect(markVerifiedAndRefreshSessions).toHaveBeenCalledWith("user-1");
    expect(result.ok).toBe(true);
  });

  it("fails without mutating anything when no valid token matches", async () => {
    const findValidToken = vi.fn().mockResolvedValue(null);
    const markVerifiedAndRefreshSessions = vi.fn();

    const result = await consumeEmailVerificationToken("nope", {
      findValidToken,
      markVerifiedAndRefreshSessions,
    });

    expect(result.ok).toBe(false);
    expect(markVerifiedAndRefreshSessions).not.toHaveBeenCalled();
  });
});
