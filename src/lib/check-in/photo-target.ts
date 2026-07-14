/**
 * WHO does a self-serve photo belong to, and do they already have one?
 *
 * Two callers need the exact same answer and must never diverge:
 *  - `POST /api/self-serve/[token]/photo` — the WRITE target (users.avatarUrl
 *    for an adult signer, family_members.photoUrl for a minor).
 *  - `buildSelfServeContext` — whether to OFFER the photo card at all
 *    (`outstanding.photo`), which is exactly "does that same target already
 *    have a photo on file?".
 *
 * The derivation used to live inline in the photo endpoint only. Sharing it
 * here is the point: a second, hand-rolled rule in the context builder would
 * be able to offer the card for one person and save the file against another.
 */
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema/users";
import { familyMembers } from "@/lib/db/schema/registrations";
import type { ResolvedSigner } from "./resolve-signer";

export type PhotoTarget =
  | { kind: "user"; id: string }
  | { kind: "family_member"; id: string };

/**
 * `tokenRecipientUserId` is the token row's own recipientUserId — the
 * fallback for the paths where resolveSigner can't produce a user (it is
 * carried on every minted token; see tokens-db.mintToken).
 *
 * Returns null when there is nothing to attach a photo to — an admin-created
 * field rental for a walk-up renter with no account, say. Callers treat null
 * as "no photo step": never offer it, never write.
 */
export function resolvePhotoTarget(
  signer: ResolvedSigner | null,
  tokenRecipientUserId: string | null,
): PhotoTarget | null {
  if (signer?.isMinor && signer.familyMemberId) {
    return { kind: "family_member", id: signer.familyMemberId };
  }
  const userId = signer?.recipientUserId ?? tokenRecipientUserId;
  return userId ? { kind: "user", id: userId } : null;
}

/**
 * True when the target already has a photo — the context builder uses this to
 * NOT re-ask a returning customer who has one on file.
 */
export async function hasPhotoOnFile(target: PhotoTarget): Promise<boolean> {
  const db = getDb();
  if (target.kind === "family_member") {
    const [row] = await db
      .select({ photoUrl: familyMembers.photoUrl })
      .from(familyMembers)
      .where(eq(familyMembers.id, target.id))
      .limit(1);
    return Boolean(row?.photoUrl);
  }
  const [row] = await db
    .select({ avatarUrl: users.avatarUrl })
    .from(users)
    .where(eq(users.id, target.id))
    .limit(1);
  return Boolean(row?.avatarUrl);
}
