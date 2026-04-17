# Video & Media Strategy (Deferred)

**Status:** Deferred — not building yet. Core platform functionality comes first. Revisit when the core Aspire product is stable.

**Date drafted:** 2026-04-17

**One-line summary:** Layer a video + photo media product on top of Aspire by combining automated Pixellot cameras (baseline, bundled) with on-demand high-school student photographers (premium), monetized through a $99/kid season pass.

---

## Why this matters

Video is becoming table-stakes for youth sports organizations in 2026. Parents expect to watch games they miss, share clips with grandparents, and keep a record of their kid's season. Organizations that offer this win registrations over organizations that don't.

More importantly, it's a real moat vs. competitors like LeagueApps: once parents have their kid's entire media history inside Aspire, switching costs become high. We stop being "a league management SaaS" and become "the media home for your kid's youth sports career."

---

## Provider landscape

The core question for any third-party video provider: **do we own the files, or do they?**

| Provider | Model | Lock-in risk |
|---|---|---|
| Hudl | Hosts on their platform, parents log into Hudl | High — walled garden |
| VEO | Automated AI camera, hosted on VEO | High |
| Pixellot | Automated multi-camera; offers file export + API | Low — API-friendly |
| Trace | Soccer-specific, API + file access | Low |
| Self-hosted (PTZOptics, Panasonic + RTMP) | You buy cameras, run your own ingest | None |

**Requirement for any provider:** Must allow pulling raw video files (MP4/HLS) into Aspire via API, permit re-hosting/redistribution on our platform, and expose metadata (game, teams, timestamps) through a documented REST API.

**Recommended starting provider:** Pixellot (primary) or Trace (soccer). Both meet the API requirement and are proven at the youth-sports scale.

---

## The hybrid model

Pixellot cameras and HS-kid photographers solve different problems. Combining them produces a product neither can make alone.

| | Pixellot | HS student photographer |
|---|---|---|
| Coverage | 100% of every game, every minute | Selective, subject to attendance |
| Angle | One wide, elevated view | Close-ups, sideline, emotion |
| Content type | Video replay | Photos + highlight clips |
| Cost structure | Fixed monthly per field | Variable per game ($40/game) |
| Reliability | Always on | Human-dependent |

Pixellot is the **baseline**. The HS kid is the **premium layer**.

---

## Pricing tiers

### Tier 1 — Bundled in program fee (Pixellot)

- Full game replay
- Team page with all games
- Parents can watch anything from their kid's team
- **Cost to parent:** invisible, baked into ~$15-25 program fee uplift
- **Purpose:** Differentiator for marketing. "Every game, streamed and recorded — included."

### Tier 2 — Premium Season Pass ($99/kid/season)

- AI-cut personal highlight reel (Pixellot footage auto-clipped around jersey # and game events)
- Face-tagged photo library (HS kid's photos, filtered to just this child)
- Close-up action clips
- End-of-season montage
- **Target attach rate:** 50%

### Tier 3 — Keepsake add-ons

- Printed photo books ($40-75)
- Custom college-recruiting highlight reel ($100-200)
- Team packages for coaches and sponsors ($75)

---

## Operational model

### HS shooter dispatch rules

- Shooter dispatched **only** to games with ≥5 premium season-pass holders on roster
- Guarantees every dispatched game is already profitable before labor is spent
- Parents without premium still receive full Pixellot replay (no degraded experience)
- 2-deep shooter bench per region to cover flakes
- Refund policy if shooter fails to show

### Shooter requirements

- iPhone 15 Pro (or equivalent) is acceptable — don't require DSLR
- Optional lent-out gimbal (~$150) per shooter
- 1-page shot list: team photo at start, action shots of every jersey #, celebration/emotion post-game
- Safeguarding training + parental consent for minor shooters working around other minors
- Worker classification review (1099 vs. W-2) before launch

### Field connectivity

- Indoor venues: typically WiFi, verify bandwidth per site
- Outdoor venues: cellular router (Peplink, Cradlepoint) with failover
- Weatherproof enclosure, PoE, UPS for outdoor camera installs

---

## Economics

### Per field per season (assumptions: 10 games, 4 teams, ~48 kids using field)

| Line item | Amount |
|---|---|
| Pixellot subscription (fixed) | –$2,400 |
| HS shooter labor (30 of 40 games dispatched) | –$1,200 |
| Premium season pass (48 kids × 50% × $99) | +$2,376 |
| Program fee uplift (~150 families × $15) | +$2,250 |
| **Net per field per season** | **~+$1,026** |

Keepsake add-ons are pure upside on top of this.

### Capex comparison: managed (Pixellot) vs. self-hosted

Per field, 5-year total cost of ownership:

| | Managed (Pixellot) | Self-hosted |
|---|---|---|
| Hardware | $4,000 | $5,000 |
| Recurring (sub / cellular / storage) | $12,000 | $7,800 |
| Hardware refresh reserve | — | $750 |
| **5-year total** | **~$16,000** | **~$13,500** |

**Breakeven:** ~5-8 fields. Below that, managed wins on operational simplicity. Above that, self-hosted saves ~$25k+ over 5 years at 10 fields, ~$60k+ at 25 fields, minus one-time software build.

**Recommended path:** Start with Pixellot. Build Aspire's video layer against Pixellot's API *as if* it were our own storage. When field count crosses ~5-8, swap the backend to self-hosted cameras — the parent-facing experience doesn't change.

---

## Software roadmap

When development resumes, these are the components Claude Code can build:

1. **Pixellot API integration.** Pull raw footage and metadata into Aspire; attach to game records.
2. **Auto-clipping engine.** Use roster + game clock + score events to cut per-jersey-# highlights from wide-angle Pixellot video.
3. **Face-tagging ML pipeline.** Parent uploads reference photo at registration; system auto-tags every image/clip containing that child across all games. **This is the killer feature** — it's how GotPhoto monetizes school photography.
4. **Jersey number OCR** as a fallback tagging method when faces are unclear.
5. **Shooter dispatch tool.** Match HS photographers to games by geography and availability; enforce the ≥5-premium-holders rule.
6. **Parent media timeline.** Unified per-kid library showing all photos and clips (free + premium gated).
7. **Shooter payment tracking.** 1099 reporting, per-game payment records.
8. **Camera health monitoring.** Admin dashboard showing offline Pixellot cameras, signal issues, storage state.

---

## Risks to watch

1. **Labor / liability.** Minors photographing other minors requires parental consent, safeguarding policy, and proper worker classification. Budget 30 min with employment counsel before launch.
2. **Shooter reliability.** HS kids flake. Refund policy and bench depth are not optional.
3. **Quality floor.** Standardized shot list turns mediocre shooters into acceptable shooters.
4. **Connectivity at outdoor venues.** Cellular signal quality varies by venue. Survey before committing to a field.
5. **Parent privacy.** Face-tagging requires opt-in consent from each family. COPPA considerations for any child under 13.
6. **Competitive response.** Once this works, LeagueApps and Hudl will copy it. Moat is in the combined experience and the face-tagged per-kid library, not any single feature.

---

## Why we're deferring

The core platform (registration, payments, team management, scheduling) must be rock-solid before layering a media product on top. Media is a revenue amplifier, not a foundation. Also: this requires hardware procurement, shooter recruiting, and legal review — all non-software work that competes with core engineering time.

**Revisit trigger:** When core functionality is stable, revenue is growing, and we have bandwidth to run a second workstream.
