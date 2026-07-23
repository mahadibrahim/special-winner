/**
 * Guest adult-self draft, stashed to sessionStorage when an anonymous
 * visitor taps "Sign in" mid-registration-wizard (v2 adult-locked flow
 * only — see registration-wizard.tsx's handleGuestSignInClick). Rehydrated
 * on the next mount of the wizard so a round trip through sign-in doesn't
 * make them retype their name + email.
 *
 * Mirrors the mechanics of `teamDraftKey`/`stashDraft`/`clearDraft` in
 * team-create.tsx, but sessionStorage rather than localStorage — this draft
 * only needs to survive the single sign-in round trip within the same tab,
 * not a return visit days later.
 *
 * Scope is deliberately narrow: ADULT self fields only (first/last/email).
 * NEVER stash child fields, DOB, or phone — see the Global Constraints in
 * docs/superpowers/plans/2026-07-23-funnel-friction-fixes.md.
 */

export const GUEST_DRAFT_VERSION = 1 as const

export interface GuestDraft {
  v: 1
  seasonId: string
  firstName: string
  lastName: string
  email: string
}

export function guestDraftKey(seasonId: string): string {
  return `aspire:guest-draft:${seasonId}`
}

function getStorage(): Storage | null {
  try {
    if (typeof window === "undefined") return null
    return window.sessionStorage
  } catch {
    // Storage disabled (private mode / blocked third-party context).
    return null
  }
}

function isValidDraft(d: unknown, seasonId: string): d is GuestDraft {
  if (typeof d !== "object" || d === null) return false
  const draft = d as Partial<GuestDraft>
  return (
    draft.v === GUEST_DRAFT_VERSION &&
    draft.seasonId === seasonId &&
    typeof draft.firstName === "string" &&
    typeof draft.lastName === "string" &&
    typeof draft.email === "string"
  )
}

/** Stash the adult-self fields before sending the visitor to /signin. */
export function stashGuestDraft(draft: GuestDraft): void {
  const storage = getStorage()
  if (!storage) return
  try {
    storage.setItem(guestDraftKey(draft.seasonId), JSON.stringify(draft))
  } catch {
    // Quota/private-mode write failure — non-fatal, the visitor just retypes.
  }
}

/** Read back a stashed draft for this season, or null if none/invalid. */
export function readGuestDraft(seasonId: string): GuestDraft | null {
  const storage = getStorage()
  if (!storage) return null
  try {
    const raw = storage.getItem(guestDraftKey(seasonId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as unknown
    return isValidDraft(parsed, seasonId) ? parsed : null
  } catch {
    return null
  }
}

/** Discard the stashed draft for this season (consumed or superseded). */
export function clearGuestDraft(seasonId: string): void {
  const storage = getStorage()
  if (!storage) return
  try {
    storage.removeItem(guestDraftKey(seasonId))
  } catch {
    // non-fatal
  }
}
