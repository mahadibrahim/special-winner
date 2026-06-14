# WhatsApp message templates (Zernio)

Reference + runbook for creating WhatsApp **message templates** for the Aspire /
SoccerOne WhatsApp number, via Zernio (our official Meta WhatsApp Cloud API
provider). Templates are how we **initiate** conversations — any business-started
WhatsApp message outside the customer's 24-hour window must use an **approved**
template.

- **Provider:** Zernio · API base `https://zernio.com/api/v1`
- **WhatsApp account id (`accountId`):** `6a2dc6165f7d1751aba63220`
  (display name "Aspire Sports Ohio", number **+1 602-654-4211**). Discover with
  `GET /accounts` → the entry where `platform === "whatsapp"`.
- **Auth:** `Authorization: Bearer $ZERNIO_API_KEY`. Account id is
  `ZERNIO_ACCOUNT_ID` (set in Netlify + `.env`).

## The two messaging modes (why templates exist)

| Mode | When allowed | Content |
|---|---|---|
| **Free-form** | Only inside a **24h window** that opens when the customer messages us first | Any text/media, no template |
| **Template** | Any time (business-initiated) | Must be a **Meta-approved** template |

So a cold outbound (a marketing blast, a reminder to someone who hasn't messaged
recently) **requires an approved template**. A reply to someone who just messaged
us can be free-form (this is how the earlier test send worked).

## Hard-won constraints (read before building one)

These cost real time to discover — honor them:

1. **Custom templates with buttons must be built in the Zernio _dashboard_,
   not the API.** `POST /whatsapp/templates` with a `BUTTONS` component returns a
   generic `400 {"error":"Invalid input"}`. The API's custom-template path
   (`components`) is **text-only** in practice (BODY, and header/footer text).
2. **Buttons via the API exist only on the Template _Library_ import path**
   (`library_template_button_inputs`) — and library templates are Meta's fixed,
   pre-approved generic copy. They don't fit custom marketing messages.
3. **URL buttons on a custom template are _static only_** (in the dashboard
   builder). You **cannot** put a `{{1}}` variable in a button URL on a custom
   template — that's a library-template feature. → Deep-link to a **list/landing
   page**, not a per-record page, or accept a static URL.
4. **Body variables _are_ supported** (`{{1}}`, `{{2}}` …) on both API and
   dashboard. Each needs a **sample** value at submit time (Meta requirement).
5. **`category: "MARKETING"`** templates always go through **Meta review
   (minutes–24h)**. `UTILITY` (transactional: reminders, confirmations) reviews
   faster and is cheaper to send. Library import skips the review wait.
6. **Marketing sends require recipient opt-in.** WhatsApp only delivers a
   MARKETING template to numbers that opted in. We do **not** yet have an
   opt-in audience layer (plan's M1/M2) — so approved ≠ sendable-at-scale yet.
7. **Variable sample URLs should _resolve_.** Meta reviewers may click the
   example link; a 404 risks rejection. Use a real, live URL (e.g. pull a real
   open session from `GET https://gosoccerone.com/api/dropin/sessions`).

**Rule of thumb:** custom copy + a button → **dashboard**. Pure body text (with
optional variables) → API is fine. Generic confirmation with a button →
Template Library import.

## Deep-link targets (for button URLs / inline links)

Real, resolving routes — branding resolves by host (`gosoccerone.com` →
SoccerOne skin):

| Target | URL | Use |
|---|---|---|
| Worthington pickup list | `https://gosoccerone.com/soccerone/pickup?facility=worthington` | Static button — that night's open Worthington games |
| Downtown pickup list | `https://gosoccerone.com/soccerone/pickup?facility=downtown` | Static button — Downtown games |
| All pickup | `https://gosoccerone.com/soccerone/pickup` | Static button — all locations |
| Specific drop-in session | `https://gosoccerone.com/dropin/<sessionId>` | Inline body link only (can't be a dynamic button on a custom template) |

`facility` values are exactly `worthington` / `downtown` / (omit for all).

## Catalog

### `pickup_soccer_worthington_tonight` — MARKETING · `en` · _pending Meta review (submitted 2026-06-14)_

Built in the dashboard (has a button). Evergreen — works any evening; fill the
body time at send.

- **Header (text):** `Open Pickup Tonight`
- **Body:**
  ```
  Pickup soccer tonight at *SoccerOne Worthington*, powered by Aspire Sports.

  Open games {{1}} — no team needed, just show up and play. Spots are limited.

  Tap below to claim your spot.
  ```
  - `{{1}}` = game time/window. Sample: `at 7:00 PM`
- **Footer:** `Reply STOP to opt out of SoccerOne updates.`
- **Button → URL (static):** `Register` → `https://gosoccerone.com/soccerone/pickup?facility=worthington`

> Design note: originally scoped with a dynamic `…/dropin/{{1}}` button to deep-link
> a specific session, but custom-template buttons can't take a variable (constraint
> #3). Static link to the Worthington pickup list is the clean substitute — and one
> template then serves every night.

## How to add a template

**Custom copy with a button (most marketing) → dashboard:**
1. Zernio dashboard → WhatsApp → Templates → New.
2. Set name (`lower_snake_case`), category, language `en`.
3. Add header/body/footer text; put `{{n}}` where you'll vary copy; give each a
   sample (constraint #4, #7).
4. Add a CTA URL button with a **static** deep link (constraint #3).
5. Submit → status `pending` → Meta review.

**Pure body text (no button) → API:**
```bash
curl -X POST https://zernio.com/api/v1/whatsapp/templates \
  -H "Authorization: Bearer $ZERNIO_API_KEY" -H "Content-Type: application/json" \
  -d '{
    "accountId": "6a2dc6165f7d1751aba63220",
    "name": "my_template", "category": "MARKETING", "language": "en",
    "components": [{ "type": "BODY", "text": "Hi {{1}}, ..." }]
  }'
```

**List / check status:**
```bash
curl "https://zernio.com/api/v1/whatsapp/templates?accountId=6a2dc6165f7d1751aba63220" \
  -H "Authorization: Bearer $ZERNIO_API_KEY"
# each template has { name, status: PENDING|APPROVED|REJECTED, category, language }
```

## Sending an approved template

Only `APPROVED` templates send. Recipient must be opted in for MARKETING.
Send is a broadcast/message call referencing the template name + language +
component parameter values (fill the `{{n}}` samples with real values). See the
Zernio "send template / broadcast" docs and `src/lib/zernio/messaging.ts` for the
transport client. The team-side inbound + group plumbing lives in
`src/lib/messaging/` (see the WhatsApp-channel work in PRs #206/#207/#209–#212).

## Open prerequisites for a real campaign

1. **Opt-in audience** — the M1 (owned list) or M2 (join-by-link group)
   marketing-audience layer is unbuilt. Today only numbers that messaged us are
   reachable.
2. **Business verification** — required to unlock WhatsApp **Groups** (separate
   from 1:1 templates). In progress.
