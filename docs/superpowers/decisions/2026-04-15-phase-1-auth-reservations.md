# Phase 1 Auth Reservations — Default Decisions

**Status:** Default decisions, awaiting user review
**Context:** Spec `docs/superpowers/specs/2026-04-14-phase-1-messaging-layer-design.md` listed four open reservations about phone-first authentication that were flagged but not resolved during brainstorming. User directed continued implementation, so these defaults were chosen and documented here.

**Override policy:** any of these can be revisited and changed before production launch. Change them by editing the relevant spec section and the affected code. The decisions here are "reasonable defaults" — not architectural lock-ins.

---

## Decision 1 — Shared device / spouse scenarios

**Question:** How do two parents of the same kid coexist in the system?

**Default:** **Option A — each parent is an independent `users` record, linked to shared kids via a `family_member_parents` join table.**

**Rationale:**
- Matches the existing `users` table identity model where every user has their own authentication identity, session history, and preferences.
- Supports the messaging thesis: each parent can text in from their own phone and the system recognizes both as authorized for the kid. No ambiguity about "who sent this message."
- Allows divergent notification preferences — Mom wants SMS reminders, Dad wants email digests. Both can coexist.
- Matches how every modern parent-facing app works (school portals, pediatric EHR, youth sports). Parents expect to log in as themselves.
- The `family_member_parents` join table is a minimal schema addition — one new table with `(family_member_id, parent_user_id, relationship, is_primary)`.

**Implementation notes:**
- When Path 1 (self-service registration) is used, the submitting parent becomes the first linked parent with `is_primary = true`. They can invite a spouse from settings later.
- When Path 3 (admin-added) is used, admin can enter multiple parent names/phones on the registration form; the first is primary.
- Outbound messages addressed to "the family" (e.g., practice cancellation) go to ALL linked parents. Outbound messages scoped to a specific parent (e.g., "your payment receipt") go to that one.
- Inbound messages from any linked parent's phone are recognized and routed to the same conversation (shared thread). The `conversation_messages.sender_user_id` records which specific parent sent each message.

**Override cost if changed later:** medium. Schema is easy to reshape; the hard part is migrating existing multi-parent families once they exist.

---

## Decision 2 — Lost phone recovery

**Question:** If a parent loses their phone and gets a new number, how do they recover access?

**Default:** **Two-tier recovery — (A) email recovery if email on file, (B) admin-mediated recovery if no email.** Tier C (third factor / security questions) deferred until a specific need arises.

**Rationale:**
- Email as fallback is the standard pattern across passwordless products (Slack, Notion, Substack all do this).
- Parents who registered via Path 1 (self-service) will typically have provided an email — even if they selected SMS as primary channel, we can capture email as a recovery identifier.
- Admin-mediated recovery handles the edge case where a parent has neither email nor phone access (e.g., grandparent whose phone is lost, kid transferred custody, etc.). Admin verifies identity out-of-band (call, visit, etc.) and manually updates the phone number in the admin panel.
- Third-factor recovery (security questions, SSN last-4, etc.) adds friction and attack surface without meaningful benefit in the youth sports context. Defer until a specific security requirement surfaces.

**Implementation notes:**
- Self-service recovery form at `/auth/recover`:
  - Parent enters old phone number (or email)
  - If email is on file, send magic link to email with `purpose: phone_change`
  - Magic link opens a page where parent enters new phone number, verifies via OTP, and the new phone replaces the old one in `users.phone`
  - Audit trail: `phone_opt_ins` for old phone marked `opted_out` with `stop_keyword_triggered = 'phone_changed_via_recovery'`; new phone gets a fresh `phone_opt_ins.opted_in` record
- Admin recovery flow at `/admin/parents/[id]/recover`:
  - Admin verifies identity manually
  - Admin updates phone number in admin panel
  - Audit trail: same as above but `opt_in_source = 'admin_recovery'`

**Override cost if changed later:** low. Recovery flows are self-contained.

---

## Decision 3 — Legal framing of magic-link auth

**Question:** Does "magic-link is our secure login mechanism" conflict with any youth-data-privacy rules the pilot org operates under?

**Default:** **Assume defensible. Magic-link auth is industry-standard in 2026 and used by Stripe, Slack, Notion, Substack, Shopify, and most SaaS products handling sensitive data.** Proceed with implementation. If a specific legal requirement surfaces during pilot launch, address it then.

**Rationale:**
- Magic-link auth has been mainstream since ~2018 and is not a fringe technique. Calling it "insecure" because it lacks a password is a 2005 understanding of security.
- Password-based auth has worse real-world security: passwords get reused, leaked, phished, and stored insecurely. Magic links eliminate most of these attack vectors.
- Youth data privacy rules (FERPA, state-level equivalents) care about data access control, not specifically about password-vs-magic-link login mechanisms. As long as the authenticated session is properly scoped and audited, the login method itself is not prescribed.
- If the pilot org has a specific policy that mandates password auth (uncommon), we handle it as a pilot-specific exception, not as a global redesign.

**Implementation notes:**
- Magic links use signed, short-lived, single-use tokens (industry standard)
- Session management uses the existing Lucia session model (already reviewed and working)
- Every auth event is logged (magic link creation, consumption, session creation, expiration)
- Admin audit trail via `magic_links` table with `created_at`, `consumed_at`, `purpose`, `delivered_channel`, `delivered_to`
- If a specific org requires password auth as an alternative, we can add it back as a secondary option without removing magic-link. Not planned for v1.

**Override cost if changed later:** high. If we had to add password auth back after launch, we'd need to retrofit every registration path and parent account. Better to confirm this assumption explicitly before pilot launch.

**User action item before pilot launch:** quick legal confirmation that the pilot org's parent agreement and youth data policy don't mandate password-based login. Most don't; check anyway.

---

## Decision 4 — No-smartphone edge case (grandparent, phone-sharing, etc.)

**Question:** What about parents who can't receive SMS — grandparents with landlines, parents sharing one phone, etc.?

**Default:** **Explicitly support email-only onboarding as a first-class path.** These parents are created by admin (Path 3) with email as their primary channel, no phone bound.

**Rationale:**
- Real edge case — probably 2-5% of parents in a youth sports population.
- Email-only is a clean fallback: all the same messaging flows work, just via email instead of SMS.
- No need for voice calls, physical mail, or in-person-only communication as first-class channels — those would explode the surface area.
- The messaging thesis ("meet parents where they already are") still holds — for these parents, where they are is email, not SMS.

**Implementation notes:**
- Registration Path 1 (self-service form): make the phone OTP step optional. If parent chooses "I don't want to use SMS," they provide email instead and `users.messaging_primary_channel = 'email'`. Email is verified via a magic-link to the email, same pattern.
- Registration Path 3 (admin-added): admin can enter email instead of (or in addition to) phone. If only email, `messaging_primary_channel = 'email'`. No welcome SMS — welcome email instead.
- Outbound messaging gateway already handles channel resolution (checks primary, then fallback, then fails). Email-only parents just have `primary = email` and `fallback = null`.
- Bot interactions work identically via email — parent replies to a bot message, the webhook handler routes the email reply to the bot, same classification and action dispatch.
- Deep links in messages (`/m/{token}`) work identically in email — click a link, land in authenticated session, same flow.
- Phone-based features (SMS reminders, SMS OTP) are gracefully skipped for these parents.

**Edge case within the edge case:** parents with neither email nor smartphone are handled by admin fully — admin creates the parent record, communication happens out-of-band (phone call, in-person), the parent never logs in. They're a "managed" parent, not an active user. Rare but real; no code needed.

**Override cost if changed later:** low. Email-only is a subset of the multi-channel model; removing it would just mean rejecting email-primary parents at registration.

---

## Summary table

| # | Reservation | Default decision | Override cost |
|---|---|---|---|
| 1 | Shared device / spouse | Each parent is own `users` record, linked via `family_member_parents` join | Medium |
| 2 | Lost phone recovery | Two-tier: email recovery → admin recovery. Defer third factor | Low |
| 3 | Legal framing | Magic-link is defensible; assume so, confirm before pilot | High if wrong |
| 4 | No-smartphone edge | Email-only onboarding explicitly supported | Low |

---

## Change log

- 2026-04-15: Initial defaults written during continuous Phase 1 execution. Awaiting user review and optional overrides.
