# Unified People Model — Design Brief

**Date:** April 27, 2026
**Status:** Approved for build
**Audience:** Internal + partnership leave-behind

## Thesis

> A program is a program. A person finds and joins it.

Aspire Sports today is built around a youth-sports primitive: **Family + Family Members**, where a parent owns an account and registers children. To serve adult leagues at the same facilities — and the very common case of an adult who *also* has children playing — we are evolving the primitive.

The new primitive is **People**, where a person can register for any age-eligible program — themselves, or a dependent they manage. There is no separate "adult side" or "youth side" of the platform. There is one platform. Programs filter by age, location, and sport. Players find what fits.

## Why this matters for partner facilities

Most indoor soccer facilities run both youth and adult leagues, and a meaningful share of their adult-league players are parents whose children also play youth at the same facility. A platform that forces those people to maintain two accounts — or that forks into two products — adds friction at every operational touchpoint: registration, payment, scheduling, communication, refunds.

A unified people model means:
- **One account per household.** Mom plays adult coed Wednesdays, daughter plays U10 Saturdays. Same login, same payment method, same calendar.
- **One source of truth for the facility.** Owner sees one roster system, one payments dashboard, one broadcast tool — segmented by program, not by audience.
- **One brand, one URL.** No splash gates. No subdomain forks. Marketing scales as the partner grows.

## What changes

### Data model
- `family_members` table evolves into a "people" concept. A row can represent either a *dependent* of a user (today's behavior) or the *user themselves* (new). A check constraint ensures exactly one of those is true per row.
- `registrations` continues to point to a person — but that person can now be self.
- COPPA / parental-consent fields stay on dependent rows only (nullable for self), preserving the audit trail required for minors.

### User experience

**Marketing homepage** — dual-CTA hero, equally weighted:
> *Register your child  |  Register yourself*

Both CTAs land on the same authenticated wizard with different pre-selections. Wrong pick? Switch in one click.

**Authenticated wizard** — Step 1 reads "Who are you registering?" and lists:
- *Myself* (when age-eligible programs exist)
- *Each dependent the user has added*
- *+ Add a person* (asks "yourself or a child?")

**Account dashboard** — "Players" tab shows everyone the user manages, themselves included. Schedule view aggregates across all of them.

**Waiver** — same template, branched copy. "I agree to participate" for self; "I authorize [dependent name] to participate" for dependents.

**Walk-up registration (admin)** — toggle for "self" vs "child" at the top of the form; rest of fields adapt accordingly.

### Adult-specific features (v1)

Shipping in this initial sprint:
- **Free-agent flag** on a registration: "I don't have a team — please place me." Surfaces on admin's roster-assignment view.

Deferred to v2 with partner input:
- **Team-as-unit registration** (one captain registers a full roster, invites players via link, captain pays or splits). Worth designing collaboratively with the partner since adult-league captain workflows vary by facility.
- **Free-agent matching board** (players see other free agents, message each other). Real value, but high moderation surface — wait for demand signal.

## What does *not* change

- **Multi-tenant architecture.** The org → location → program hierarchy stays exactly as it is. Partner with two facilities = one org, two locations.
- **Stripe Connect.** Payouts continue to flow per-org, unchanged.
- **Coach experience.** Coaches see their team's roster regardless of whether the players are kids or adults — same roster view, same attendance, same practice planner.
- **Communication channels.** Email (Resend), Telegram, eventually SMS — all already broadcast at the program/season/team level, which is the right grain for both audiences.

## Rollout

| Phase | Work | Days |
|---|---|---|
| 1 | Schema migration + check constraint | 1 |
| 2 | Backend: registration APIs handle self | 1 |
| 3 | Wizard Step 1 + waiver branching | 2 |
| 4 | Account dashboard updates | 1 |
| 5 | Marketing homepage dual CTA + age filter on programs index | 1 |
| 6 | Admin walk-up form adult mode | 0.5 |
| 7 | Free-agent flag + admin roster surface | 0.5 |
| **Total** | | **~7 working days** |

CI validation runs at each phase boundary. Full E2E suite gates the merge.

## Decisions captured (autonomous design mode)

- **Primitive:** People with mutually-exclusive `parent_user_id` / `self_user_id`.
- **Table name:** `family_members` retained for v1 (rename deferred to a future cleanup task to minimize migration blast radius).
- **Surface pattern:** Dual-CTA homepage, single wizard. No splash gate. No subdomain split.
- **Adult features in v1:** Free-agent flag only.
- **Team-unit registration:** v2, designed with partner.
- **Marketing voice:** Unified `aspiresportsohio.com`. Reserve `adults.` subdomain for future marketing-only divergence if/when needed.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| COPPA audit gap if `parent_user_id` becomes nullable | DB-level CHECK constraint enforcing exactly-one-of, plus application-level guard in the family-member upsert path |
| Existing parent-only UI copy ("My Family", "Add Child") feels wrong with self-registrants | Phase 4 includes a copy pass; "Family" → "Players", "Child" → "Person" or "Player" where relevant |
| Existing E2E tests assume parent-registers-child flow | Phase 3 adds new Playwright cases for adult self-registration; existing tests continue to cover parent-of-child flow unchanged |
| Walk-up admin staff trained on parent+child model get confused | Phase 6 form keeps "child" as default mode (preserves muscle memory); adult mode is an explicit toggle |

## Partnership framing

This sprint converts Aspire Sports from "youth-sports platform" to "sports platform that serves households." That framing is more accurate to what partner facilities actually run, and more durable as the partner's program mix evolves.

When the platform ships at the partner's facilities, an adult player and their kid both register, pay, view their schedules, and receive game-change notifications from one account on one URL — the same experience as if they used any modern consumer product. That is the bar.
