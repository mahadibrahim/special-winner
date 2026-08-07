# Partner Demo Runbook — 2026-08-07

**Site:** https://aspire-sports-staging.netlify.app (Stripe TEST mode; no real email/SMS can send)

## Morning of (5 min)
1. `./scripts/with-bws.sh npx tsx scripts/seed-demo-day.ts` — re-anchors tonight's ref assignment and today's practice session to demo day.
2. Spot-check: /coach/practices shows a Today session; /referee (as demo.ref) shows an Upcoming assignment tonight.
3. If the coach's 'today' session has passed (demo runs late), re-run the seed — it re-anchors to +3h from run time.

## Freeze rules (until demo is over)
- Do NOT run `npm run db:seed:e2e` against staging.
- Do NOT merge anything to `main` (staging auto-deploys it).
- No other Claude/dev sessions mutating the staging DB.

## Accounts — password for all: `AspireDemo2026!`
| Who | Email | Opens on |
|---|---|---|
| Admin | demo.admin@aspiresportsohio.com | /admin |
| Coach (phone) | demo.coach@aspiresportsohio.com | /coach |
| Parent | demo.parent@aspiresportsohio.com | /dashboard |
| Referee (phone) | demo.ref@aspiresportsohio.com | /referee |

## Demo arc (tab order)
1. **Public** — home → /programs (Youth Soccer Fall 2026 open) → /adult/leagues/flag-football → Summer 2026 NOW REGISTERING with live standings + Spring 2026 archive showing final standings (derived from played games) → Fall 2026 UPCOMING (forming, not open registration).
2. **Parent** (laptop) — Maya's dashboard: coach notes, development radar, upcoming Fall 2026, payment history.
3. **Coach** (phone) — /coach: Thunder roster (10 kids), today's "Practice — Game Prep & Set Pieces" at now+3h (Tuesday practice; Saturday game upcoming), attendance history, assessments showing level progression.
4. **Referee** (phone) — /referee: tonight's assignment at now+3h, 27 completed games history (15 paid Spring + 12 unpaid Summer) with scores, /referee/pay showing unpaid Summer fees at $35/game.
5. **Admin** (laptop) — registrations (multi-season trend), revenue (with $50 partial refund on Zoe Okonkwo registration — talking point), NPS (score 50, 8 responses), referee ratings (Jordan Avery: 12 ratings, 4.5 avg), payroll export (referee CSV = unpaid Summer fees; hours CSV = coach practice hours). Optional: live registration on Youth Soccer Fall 2026 via /programs (registration open) — or a late-join into flag Summer 2026 — with test card 4242 4242 4242 4242 (any future expiry, any CVC).
6. **Scale story** — open https://gosoccerone.com (prod) in a tab: same platform, second brand, own domain.

## If something looks wrong
Re-run the seed (idempotent). If a surface is broken, drop it from the arc — do not debug live.
