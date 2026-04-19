# Aspire Media Workflow — Design

**Date:** 2026-04-19
**Status:** Draft (autonomous design mode; Mahad to approve)
**Builds toward:** In-house photography/video operation for Aspire Sports
**Supersedes parts of:** `docs/VIDEO_MEDIA_STRATEGY.md` (strategic intent still valid; staffing model and interface-as-moat thesis updated on 2026-04-19)

---

## 1. Summary

This spec covers the end-to-end platform primitives that turn Aspire Sports into the media home for a kid's youth-sports career: a new `media_staff` role, a photographer-facing web app for session check-in and uploads, an admin console for assigning and tracking shoots, a keyboard-driven manual tagger UI, contract and media-release management, and 1099 payout plumbing via the existing Stripe Connect integration.

The design is explicitly **manual-first**: no computer vision in v1. The moat is workflow quality, not tagging automation. CV becomes worth investing in at roughly 5-10× current volume.

All four phases are designed together so the data model and interface contracts remain coherent. Implementation will be phased: four separate plans consumed by `writing-plans`.

## 2. Goals

- A photographer can be onboarded, assigned a shoot, check in at a game, dump an SD-card worth of files, and leave — without ever thinking about folders, naming conventions, or links.
- An admin can look at next weekend's games and assign shooters in under five minutes.
- An offshore (or in-house) tagger can process a full game's keeper set (~300 photos) in under thirty minutes with 100% accuracy.
- A parent opens the Aspire dashboard and sees only their kid's photos, filtered by roster/jersey and gated by media-release status.
- 1099 onboarding (contract) and media release are captured in-platform with legally defensible artifacts (signed timestamp + IP + PDF snapshot).
- Photographer payouts flow through the existing Stripe Connect plumbing.

## 3. Non-goals

- Automated CV-based jersey detection or face recognition. Revisit at scale.
- Automated highlight reel generation. Deferred.
- Pixellot / Veo video ingestion pipelines. Scoped separately — this spec covers the media-staff workflow; third-party video ingestion will be its own design once core is stable.
- Native mobile apps. Everything is web-first (PWA-capable where it helps).
- DocuSign / HelloSign integration for contract signing. Click-through e-sign is sufficient for MVP; structured so we can swap in DocuSign later without data-model changes.
- Public photo marketplaces, printed-book fulfillment, or keepsake e-commerce. Deferred.

## 4. Phasing overview

| Phase | Scope | Ships when |
|---|---|---|
| **1. Foundation** | `media_staff` role, shoot assignment, photographer check-in, web uploader, admin shoot list, basic asset storage | End-to-end: admin creates shoot → photographer uploads files → files land in Aspire with `shoot_session_id` attached |
| **2. Tagger UI** | Keyboard-driven tagger, burst-awareness, offshore-editor permission flag, audit log | A tagger can process a full game in < 30 min and the parent view surfaces their kid's photos |
| **3. Contracts & releases** | `media_staff_agreements` (1099 e-sign), `media_release` fields on `family_members`, publishing filter | No unsigned photographer can be assigned; no photo of a declined player appears in any gallery |
| **4. Payouts & polish** | Rate cards, Stripe Connect payouts for media_staff, admin analytics dashboards | Photographers get paid automatically on admin approval; ops has visibility into coverage/quality/spend |

Each phase has its own implementation plan downstream.

---

## 5. Architecture

### 5.1 Data model additions

All new tables live in a new schema module: `src/lib/db/schema/media.ts`.

```
shoot_sessions
├─ id uuid pk
├─ organization_id uuid (denormalized for scoping)
├─ location_id uuid (nullable — posed sessions at a studio may not tie to a venue)
├─ game_id uuid → games.id (nullable — team-posed / non-game sessions allowed)
├─ venue_id uuid → venues.id (nullable)
├─ assigned_user_id uuid → users.id (the media_staff user)
├─ assigned_by_user_id uuid → users.id
├─ session_type varchar ('game', 'team_posed', 'practice', 'event')
├─ status varchar ('assigned'|'confirmed'|'checked_in'|'uploading'|'uploaded'|'tagging'|'ready'|'published'|'cancelled')
├─ scheduled_start timestamp
├─ scheduled_end timestamp
├─ confirmed_at timestamp (null = unconfirmed)
├─ checked_in_at timestamp
├─ checked_in_lat decimal(10,6)
├─ checked_in_lng decimal(10,6)
├─ checked_out_at timestamp
├─ rate_type varchar ('per_game', 'per_day', 'flat')
├─ rate_cents integer (snapshot at assignment time)
├─ payout_status varchar ('unearned', 'pending_approval', 'approved', 'paid', 'cancelled')
├─ stripe_transfer_id varchar (nullable, Phase 4)
├─ notes text
├─ created_at / updated_at

media_assets
├─ id uuid pk
├─ shoot_session_id uuid → shoot_sessions.id
├─ organization_id uuid (denormalized)
├─ asset_type varchar ('photo', 'video', 'video_clip')
├─ storage_key text (internal key: org/<org_id>/shoots/<session_id>/<uuid>.ext)
├─ thumbnail_key text
├─ original_filename varchar
├─ file_size_bytes bigint
├─ mime_type varchar
├─ width integer (nullable)
├─ height integer (nullable)
├─ duration_seconds integer (video only, nullable)
├─ captured_at timestamp (from EXIF; falls back to upload time)
├─ uploaded_at timestamp
├─ burst_group_id uuid (assets from the same session with captured_at within 2s of a neighbor share an id; computed by a background job after upload completes)
├─ status varchar ('uploaded', 'culled', 'edited', 'tagged', 'published', 'rejected')
├─ edit_pass varchar ('none', 'ai_only', 'human_reviewed')
├─ created_at / updated_at

media_tags
├─ id uuid pk
├─ media_asset_id uuid → media_assets.id
├─ family_member_id uuid → family_members.id (nullable for team-scope tags)
├─ team_id uuid → teams.id (nullable for player-scope tags)
├─ tag_scope varchar ('player', 'team', 'both_teams')
├─ source varchar ('manual_staff', 'manual_offshore', 'manual_admin', 'auto_jersey_ocr', 'auto_face', 'burst_propagated')
├─ confidence decimal(3,2) (1.00 for manual, model score for auto)
├─ tagged_by_user_id uuid → users.id
├─ created_at
└─ UNIQUE (media_asset_id, family_member_id) WHERE family_member_id IS NOT NULL
└─ UNIQUE (media_asset_id, team_id) WHERE team_id IS NOT NULL AND family_member_id IS NULL

media_staff_agreements
├─ id uuid pk
├─ user_id uuid → users.id
├─ organization_id uuid → organizations.id
├─ agreement_type varchar ('independent_contractor', 'nda', 'background_check_consent')
├─ version integer (bump when terms change)
├─ terms_snapshot_url text (PDF of terms rendered at sign time, in object storage)
├─ status varchar ('draft', 'sent', 'signed', 'expired', 'revoked')
├─ signed_at timestamp
├─ signed_ip varchar(45)
├─ signed_user_agent text
├─ signed_full_name varchar(200) (typed name)
├─ signature_image_key text (nullable — for future drawn-signature upgrade)
├─ expires_at timestamp (nullable)
├─ created_at / updated_at

media_rate_cards
├─ id uuid pk
├─ organization_id uuid
├─ name varchar ('Standard', 'Premium Event', etc.)
├─ session_type varchar ('game', 'team_posed', 'practice', 'event')
├─ rate_type varchar ('per_game', 'per_day', 'flat')
├─ rate_cents integer
├─ active boolean
├─ created_at / updated_at

media_staff_profiles
├─ user_id uuid pk → users.id
├─ organization_id uuid
├─ stripe_connect_account_id varchar (reuses existing Connect plumbing)
├─ preferred_rate_type varchar
├─ preferred_rate_cents integer (nullable — falls back to rate card)
├─ service_location_ids uuid[] (which locations they can be scheduled at)
├─ active boolean
├─ onboarded_at timestamp
├─ notes text
├─ created_at / updated_at

media_audit_log
├─ id uuid pk
├─ actor_user_id uuid → users.id
├─ entity_type varchar ('asset', 'tag', 'session', 'agreement')
├─ entity_id uuid
├─ action varchar ('create', 'update', 'delete', 'approve', 'publish', 'revoke')
├─ diff jsonb
├─ created_at
```

**Changes to existing tables:**
- `family_members` gains three columns (Phase 3): `media_release_status` varchar default `'not_asked'`, `media_release_signed_at` timestamp, `media_release_version` integer default 1.
- `roleNameEnum` gains two values (Phase 1): `media_staff`, `media_editor`. `media_editor` is a tagging-only role for offshore workers.
- No changes to `games`, `teams`, `rosters`, `venues`, `registrations`.

### 5.2 Auth and permissions

New roles:
- `media_staff` — can view/update sessions assigned to them; can upload to their sessions; can view their payout history; can read roster for their assigned games only.
- `media_editor` — can view sessions scoped by `service_location_ids`; can view and tag assets; **cannot** see contact info, registration data, or any data outside the tagging surface. Used by offshore editors.

Both roles use the existing `user_roles` scoping (`scopeType='location'`, `scopeId=location.id`) so a media_staff user can be active at multiple locations.

Middleware-level gate: unsigned `media_staff` users (no `signed` `media_staff_agreements` row for the current org) cannot have sessions assigned. Admin UI blocks the assignment; API route enforces it defensively.

### 5.3 Storage

**Backend:** Cloudflare R2 via S3-compatible API.

- Bucket: `aspire-media-<env>` (e.g., `aspire-media-prod`).
- Key scheme: `org/<org_id>/shoots/<shoot_session_id>/<asset_uuid>.<ext>` for originals; `.../thumbs/<asset_uuid>.jpg` for thumbs.
- Why R2: zero egress cost, which matters for a product where every parent download is free bandwidth. S3 egress would dominate unit economics at scale.
- Access: uploads via signed PUT URLs (photographer browser → R2 direct). Downloads via signed GET URLs minted by the Aspire API with short TTLs.

**Thumbnail generation:** on the server (Netlify Function) when asset moves to `uploaded`, using `sharp`. Writes thumb to R2. Fires before the tagger ever sees the asset.

**Retention:** originals kept indefinitely (at R2 prices this is affordable). Deletions are soft by default; a hard-delete flow is admin-only and audit-logged.

### 5.4 Upload path

Phase 1 uses **direct-to-R2 multipart upload** via signed URLs:

1. Photographer selects files in the uploader UI.
2. Aspire API issues signed multipart-init + part URLs for each file, creating `media_assets` rows in `uploading` state.
3. Browser uploads parts directly to R2 (multipart, chunked, parallel).
4. Browser reports completion; API finalizes the multipart upload and transitions asset to `uploaded`.
5. Background job creates thumbnail and extracts EXIF `captured_at`.
6. When all assets in a session are `uploaded`, session transitions to `uploaded` state and the tagger queue receives it.

Resumability (tus-style) is deferred to Phase 2 if needed. Modern browser multipart with retry on failed parts covers 95% of flaky-venue-wifi cases.

### 5.5 Publishing path (Phase 3+)

An asset is visible to a parent if **all** are true:
1. Asset status is `published` (set when the session is published by an admin or an auto-publish rule fires).
2. There is a `media_tag` with `family_member_id` matching a player in the parent's family.
3. **Every** `family_member_id` tagged on the asset has `media_release_status='granted'`. If even one tagged player has not granted release, the asset is suppressed from **every** parent dashboard and from public galleries.

This is the strict rule: declined families are fully protected — their kid's image does not leak even to granted co-players' families. Section 8.2 restates the same rule in Phase 3 context.

Exception: tagger/admin preview URLs bypass this filter but carry short-TTL signed URLs and a visible "internal preview" watermark.

---

## 6. Phase 1 — Foundation

### 6.1 Role + agreement gate
- Add `media_staff` and `media_editor` to `roleNameEnum` (migration).
- Seed permissions strings in `roles.permissions` (Phase 1 only needs `media_staff`; `media_editor` is wired but unused until Phase 2).
- Add `media_staff_profiles` table (Phase 1 populates minimal fields; contract/payout integration in Phases 3/4).

### 6.2 Admin UI
- `/admin/media/shoots` — list view:
  - Filters: date range, location, status, assigned photographer, has-coverage
  - Row: game/team, venue, scheduled start, status chip, photographer name + avatar, asset count
  - Row actions: edit, cancel, unassign, view assets
- `/admin/media/shoots/new` — create-shoot wizard:
  - Step 1: pick date → shows games + non-game session options
  - Step 2: pick photographer (list filtered by service_location_ids)
  - Step 3: confirm rate (default from rate card, override allowed)
  - On save: creates session, sends notification
- `/admin/media/shoots/bulk` — weekend assignment view: calendar grid of unassigned games, drag-drop photographers onto games
- `/admin/media/staff` — media-staff directory: invite, activate/deactivate, view active assignments, view agreement status (Phase 3 populates this)

### 6.3 Photographer UI (`/media/*`)
Distinct top-level route namespace, not `/dashboard/*`, to keep surfaces clean.

- `/media/jobs` — "My Jobs" list:
  - Sections: Needs Confirmation, Confirmed, Today, Upcoming, Past
  - Card: game vs opponent, venue with map link, arrival time, roster preview, rate
- `/media/jobs/:id` — shoot detail:
  - Roster (home + away, with jersey numbers and family-member photos if available)
  - Venue details + directions
  - Coach contact
  - **Check In** button (requests geolocation, stamps `checked_in_at` + lat/lng, transitions session to `checked_in`)
  - Upload surface (see 6.4)
  - **End Session** button
- `/media/history` — past shoots with asset counts and (Phase 4) payout status

### 6.4 Uploader
- Drag-and-drop zone, click-to-browse fallback.
- Also supports folder selection (`<input webkitdirectory>`).
- For each file: show filename, size, progress bar, per-file retry, overall session progress.
- Writes locally in IndexedDB so partial upload survives browser crash/reload (queue + file handles; if the user picked a folder we keep `FileSystemDirectoryHandle` via File System Access API where supported, fallback to re-pick).
- Visual confirmation: "412 photos uploaded for Saturday vs Hawks — view in dashboard."
- Warns if the user navigates away with in-progress uploads.
- Bandwidth: no throttling in v1; if we see problems later we add a concurrency knob.

### 6.5 Notifications
- Assignment → notification to photographer (email + in-app). Reuses existing notification plumbing.
- 48h and 24h pre-shoot reminders if unconfirmed; auto-alert admin at 24h mark if still unconfirmed.
- Upload complete → notification to admin.

### 6.6 API routes (Phase 1)
```
POST   /api/admin/media/shoots                  — create
GET    /api/admin/media/shoots                  — list (filtered)
GET    /api/admin/media/shoots/:id              — detail
PATCH  /api/admin/media/shoots/:id              — update (reassign, reschedule, cancel)
GET    /api/admin/media/staff                   — list media_staff users
POST   /api/admin/media/staff/invite            — invite flow
GET    /api/media/jobs                          — photographer's assigned sessions
POST   /api/media/jobs/:id/confirm              — confirm assignment
POST   /api/media/jobs/:id/check-in             — stamp check-in (body: lat, lng)
POST   /api/media/jobs/:id/check-out            — stamp check-out
POST   /api/media/jobs/:id/uploads              — request signed multipart URLs
POST   /api/media/jobs/:id/uploads/:asset/complete  — finalize
```

---

## 7. Phase 2 — Tagger UI

### 7.1 Tag queue
- Admin view `/admin/media/tag-queue`: sessions in `uploaded` state, ordered by oldest, with asset count and elapsed time since upload.
- Assigning a queue item to an editor flips session to `tagging` and locks it to prevent double-work.

### 7.2 Tagger interface (`/media/tag/:session_id`)
Layout:
- **Left (60%)**: current asset, big. Keyboard nav between assets.
- **Right sidebar (40%)**:
  - Tabbed roster: Home | Away
  - Each roster entry: jersey # badge, name, thumbnail face card (from `family_members.photoUrl`)
  - Hover or keyboard-focus a player to preview "tagged count" for this session
  - Progress bar: tagged / total assets
  - Burst indicator: "This is 1 of 7 in a burst" + shortcut to tag the whole burst
  - Performance bar: tags/min, elapsed, queue depth (for managers)

Keyboard map:
- `0-9` keys type a jersey number; Enter confirms tag; auto-advances to next asset
- `,` separates multi-player tags (`4,12,21 Enter`)
- `T` tags all players on both teams (team-level photo — group shots)
- `H` / `A` tags everyone on home / away roster (one-team group shot)
- `S` skip (unusable asset; status → `rejected`)
- `U` undo last tag
- `←` / `→` navigate assets
- `Shift+↵` "apply to whole burst" (replicates last tag set across the burst group)
- `.` focus on sidebar search (type player name)

### 7.3 Burst awareness
`burst_group_id` is computed on upload: assets from the same photographer within a 2-second capture window share an id. Tagging a representative asset auto-proposes the same tags for the whole burst (visibly highlighted; one keystroke to accept). Source = `burst_propagated`.

### 7.4 Quality controls
- Low-confidence tags (Phase 1: no CV, so n/a; Phase 5+: CV-proposed) surface in a "needs review" queue.
- Audit log rows written on every tag/untag.
- Per-editor stats surface in admin analytics (Phase 4).

### 7.5 Offshore access model
- `media_editor` role is granted at location scope.
- Access is restricted by API-level filters: an editor can only query `media_assets` and `rosters` for sessions in their scope that are in `tagging` state.
- Editors cannot access `family_members` contact fields — their roster query returns only `{id, first_name, last_initial, jersey_number, photo_url}`.
- IP allow-listing is deferred; monitoring is via audit log.

### 7.6 API routes (Phase 2)
```
GET    /api/admin/media/tag-queue               — queue
POST   /api/admin/media/tag-queue/:id/claim     — claim a session for tagging
GET    /api/media/tag/:session_id               — tagger payload (assets + roster subset)
POST   /api/media/tag/:session_id/tags          — bulk tag (asset_id + player_ids + source)
DELETE /api/media/tag/:session_id/tags/:tag_id  — untag
POST   /api/media/tag/:session_id/complete      — mark session `ready`
```

---

## 8. Phase 3 — Contracts & releases

### 8.1 Photographer 1099 contract

New UI flow at `/media/onboarding`:
1. User accepts role invite → redirected to onboarding
2. Displays rendered agreement (HTML from a templated Markdown file in-repo, merged with user/org fields: `templates/media/independent-contractor-v1.md`)
3. User reads, types full name in signature field, checks "I agree" box, clicks Sign
4. System: renders PDF snapshot of exact HTML seen, uploads to R2, writes `media_staff_agreements` row with `signed_ip`, `signed_user_agent`, `signed_full_name`, `signed_at`, `terms_snapshot_url`
5. User status flips to active; admin notified

Versioning: when a new `version` is issued, existing staff get an in-app prompt on next login; old version remains on file.

**Template fields required:**
- Parties (Aspire org legal name ↔ photographer name)
- Work description (media capture services per assignment)
- Compensation (references `media_rate_cards` structure, actual rates captured per-session)
- Independent contractor language
- IP assignment (work-for-hire: Aspire owns the captures)
- Minors safeguarding language (photographers working around minors)
- Term, termination, indemnification, governing law
- Background check consent (checkbox; defers actual check to a future integration)

### 8.2 Media release (family/player consent)

Registration flow update:
- After the existing waiver step, a new step: "Media & Photography"
- Clear language: what photos/videos are taken, who sees them, how to revoke, the opt-out option
- Default: "not_asked" until parent answers; registration can complete either way (not blocking)
- Saves `media_release_status`, `media_release_signed_at`, `media_release_version` on the `family_member`

Parent dashboard:
- New panel at `/dashboard/media-preferences/:family_member_id`
- Shows current status, version signed, history of changes
- Allows change: grant/revoke. Revoke immediately hides all tagged assets from public view (asset-level cache invalidation).

Publishing filter (applied in every read path — restates Architecture §5.5 in Phase 3 context):
- If **every** tagged family_member has `media_release_status='granted'`, the asset is visible to the tagged players' families.
- If **any** tagged family_member has `media_release_status != 'granted'` (i.e., `not_asked`, `declined`, or `revoked`), the asset is suppressed from every parent dashboard and from public galleries.
- Admin and tagger preview paths bypass the filter with short-TTL signed URLs and watermarks.

Rationale: declined/unrevealed families deserve full protection. A strict gate is the right default — an asset can always be republished later once consent is collected, but a leak can't be unleaked.

### 8.3 Admin release overview
- `/admin/media/releases` — table of players with current release status, filterable by team/location, with counts
- Bulk-ask action: sends media-release prompt email to all `not_asked` parents

### 8.4 API routes (Phase 3)
```
GET    /api/media/onboarding                    — pending agreements
POST   /api/media/onboarding/:id/sign           — sign (body: full_name, ip captured server-side)
GET    /api/admin/media/agreements              — list
POST   /api/admin/media/agreements/version      — publish new version
PATCH  /api/family/:id/media-release            — parent updates
GET    /api/admin/media/releases                — admin overview
```

---

## 9. Phase 4 — Payouts & polish

### 9.1 Rate cards
- `/admin/media/rates` — CRUD on `media_rate_cards`
- Photographer profile edit: preferred rate type/amount overrides
- At session creation, default rate resolves: photographer's override → most-recent active card matching `session_type` → prompt

### 9.2 Payouts via Stripe Connect
- Reuse existing Connect account creation/onboarding patterns
- New flow: `media_staff_profile.stripe_connect_account_id` populated on onboarding
- Session payout state machine: `unearned` → (session `ready` or `published`) → `pending_approval` → (admin approves) → `approved` → (Connect transfer succeeds) → `paid`
- Transfer metadata: `shoot_session_id`, `org_id`, `user_id` for reconciliation
- Weekly batch: admin reviews `pending_approval` sessions for the week, bulk-approves
- Photographer view `/media/payments`: per-session history, running total, year-to-date, 1099-NEC PDF at year-end (generated from aggregated paid transfers)

### 9.3 Analytics dashboards
- `/admin/media/analytics`:
  - Coverage rate (assigned / eligible games) by week and location
  - Confirmation lead time distribution
  - Upload SLA (check-in → upload complete)
  - Tag SLA (uploaded → ready)
  - Cost per game, cost per tagged asset
  - Per-photographer: sessions completed, no-shows, tags/photo, avg upload speed
  - Per-editor: tags/hr, sessions processed

### 9.4 API routes (Phase 4)
```
GET    /api/admin/media/rates                   — list rate cards
POST   /api/admin/media/rates                   — create
PATCH  /api/admin/media/rates/:id               — update
POST   /api/admin/media/shoots/:id/approve      — approve payout
POST   /api/admin/media/shoots/bulk-approve     — weekly batch
GET    /api/media/payments                      — photographer's own history
GET    /api/admin/media/analytics/*             — various dashboards
```

---

## 10. Assumptions & defaults

Every non-obvious decision is listed here so it can be flagged:

1. **Storage backend: Cloudflare R2.** Picked over S3 for zero egress. Requires an R2 account and access keys in env. If Netlify adjacency matters more than egress economics, swap to AWS S3 with same key scheme.
2. **One session = one game.** Multi-game "shifts" are modeled as multiple sessions on the same day, not one session covering many games. Simpler and matches the per-game/per-day rate structure naturally (per-day rate just assigns N sessions with `rate_type='per_day'` and rate split or primary assignment).
3. **Web-only uploader in Phase 1.** No desktop native app. Multipart direct-to-R2 with browser resume handles flaky wifi well enough.
4. **Click-through e-signature.** Typed name + checkbox + server-captured IP/user-agent + PDF snapshot. Legally defensible; swap in DocuSign later without schema changes by adding `external_provider` / `external_envelope_id` columns if/when needed.
5. **Media editor = role, not permission flag.** Keeps permission logic simple. Lean `roleNameEnum` concerns are minimal — two additions.
6. **Per-photo tagging, not per-player.** Burst propagation is the throughput lever. Per-player workflow is a plausible future enhancement but not default.
7. **Strict publishing rule: any declined player in a photo hides the asset from everyone except granted families.** Protects declined families fully while still letting granted families see photos their kid is in. Safer default for trust.
8. **Media release captured at registration but not blocking.** Declining still lets registration complete. Unreleased (`not_asked`) = treated as "not granted" for publishing — an explicit prompt goes out before a season's first gallery publishes.
9. **No CV in any phase covered here.** Jersey OCR and face recognition are explicitly deferred. The schema supports `source='auto_*'` values so future CV work can layer in without migrations.
10. **`media_staff_profiles.service_location_ids` as uuid array, not a join table.** Cardinality is low (single-digits per photographer); array is simpler. Revisit if a photographer ever needs thousands of locations.
11. **Audit log: single `media_audit_log` table, not per-entity.** jsonb diff keeps things flexible.
12. **Thumbnail sizes: 400px wide for sidebar, 1600px for tagger canvas. Originals untouched.** Numbers adjustable via config.
13. **Burst grouping: 2-second capture window.** Empirically works for sports; tunable.
14. **Stripe Connect: reuse existing franchise Connect account plumbing.** If franchises have their own Connect accounts and individual photographers need separate ones, create a new account type. The `media_staff_profile.stripe_connect_account_id` field is independent of any franchise account field.
15. **Notifications reuse existing email/in-app plumbing.** Telegram integration inherited from `users.messagingPrimaryChannel` — photographers can opt in to Telegram reminders.

---

## 11. Testing strategy

Per project convention (see `CLAUDE.md`), tests live in `tests/api/` (Vitest, hits running dev server over HTTP).

- **Phase 1:** integration tests for shoot CRUD, assignment, check-in geolocation stamping, signed-URL issuance (mock R2), multipart completion, permission gates (non-media_staff cannot upload; unassigned user cannot check in).
- **Phase 2:** tag read/write API, permission gate for `media_editor` role, burst propagation correctness, roster-subset endpoint strips contact info, audit log rows written.
- **Phase 3:** agreement signing flow (snapshot URL written, version honored, unsigned user cannot be assigned), media-release updates propagate (asset visibility flips within one read), publishing filter covers edge cases (mixed-consent tag sets).
- **Phase 4:** rate resolution precedence, payout state transitions, Connect transfer metadata shape, 1099 PDF generation determinism.
- **E2E (Playwright):** single golden-path test per phase — create shoot → assign → check in → upload → tag → release check → approve payout.

Test data: extend seed to add a `media_staff` + `media_editor` test account at `@test.aspiresports.com` with `Test{Role}123!` per convention.

---

## 12. Open questions (non-blocking)

These don't block design approval, but should be settled before each phase's implementation plan:

- **Background checks**: consent column exists, but integration with a provider (Checkr, Sterling) is deferred. Which provider, and is it per-state mandated?
- **Worker classification**: 1099 vs W-2 review is mentioned in the original strategy doc. No schema change needed; ops matter separately.
- **R2 account / keys**: env var wiring is straightforward but needs to be provisioned. Who owns the account?
- **Watermarking for previews**: the "internal preview" watermark — on-the-fly via ImageMagick/sharp, or baked in? Leaning on-the-fly.
- **Video capture**: this spec is photo-centric. Video ingest (from photographer phone recordings, not Pixellot) needs a companion mini-spec for Phase 2 or 3 if/when it becomes active.

---

## 13. Out of scope for this spec

- Pixellot / Veo / third-party automated video ingest
- Highlight reel generation (manual or automated)
- Public-facing photo marketplace / e-commerce
- Photo book / print fulfillment
- CV (jersey OCR, face recognition)
- Mobile native apps
- Advanced editing workflows (color grading pipelines, LUT management beyond Imagen AI preset)
