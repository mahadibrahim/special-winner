# Coach

Field-side worker accountable for one team's compliance, conduct, and
attendance during youth programs.

This manual is hand-authored (`role.coach.yaml` declares
`manual_target: hand_authored`) — coaches are external staff and this
chapter is written as a standalone handbook, not generated from the
catalog like the employee manuals. Catalog activity ids (`act.*`) are
referenced inline so it stays traceable to the operating model.
Ratios, caps, timings, and schedules come from the Aspire coaching
philosophy (`src/data/coaching-philosophy.ts`); do not vary them
without a Director-approved catalog change.

## 1. Before the season

### Credentials

All four must be current before your first session with players.
Coordinate renewals with the Director; you cannot be scheduled without
them on file.

- SafeSport training certificate
- Background check
- CPR / first-aid certification
- Concussion protocol training

### Required reading

**The Aspire coaching philosophy.** The non-negotiables:

- **Development over winning.** Success is effort, improvement, and
  enjoyment — not the scoreboard. "Winning takes care of itself when
  athletes develop properly."
- **Every child can improve.** There is no "non-athletic" child.
- **Long-term athlete development.** We're building athletes for age
  25, not just age 8. Never sacrifice long-term development for
  short-term results.
- **Holistic growth** across all four domains: technical, tactical,
  physical, psychological.
- **The Double-Goal Coach.** Strive to win AND develop character; when
  the two conflict, character development comes first. Redefine
  "winner," fill the emotional tank, honor the game.
- **The ELM framework.** Feedback centers on Effort, Learning, and
  Mistakes — the things athletes control. Normalize mistakes; athletes
  who fear them play tentatively.
- **The 5:1 magic ratio.** At least five positive interactions for
  every one corrective interaction.

**Your sport's development guide.** Open `/coach/resources` and read
the guides for your sport before planning a session. Key
sport-specific points: soccer — both-feet development from the
earliest ages, no assigned goalkeepers until age 10+; basketball —
both hands from day one, lower baskets for younger players (8-foot for
U8), smaller balls for hand size; hockey — skating fundamentals first,
cross-ice games for more touches; baseball — arm care is paramount
(pitch counts, rest), everyone plays every position.

**Age-appropriate expectations.** Program delivery uses the
philosophy's age bands: Discovery (4-6), Fundamentals (7-9),
Skill Building (10-12), Development (13-15). Know your band's
principles and its "avoid" list — e.g., no score-keeping or criticism
at Discovery; no position specialization at Fundamentals; no yelling
instructions during play at Skill Building. (The assessment
curriculum's stage records use slightly different age splits —
Discovery 3-5, Fundamentals 6-8, Skill Building 9-10, Development
11-12, Competitive 13-15 — follow whatever stage the platform shows
for the player when assessing.)

### Tooling — the /coach portal

| Page | What you do there |
|---|---|
| `/coach` | Dashboard — today at a glance |
| `/coach/teams` | Your team assignments |
| `/coach/roster/[teamId]` | Team roster |
| `/coach/schedule` | Practices and games |
| `/coach/practices`, `/coach/practices/new` | Practice planner — build and reuse session plans |
| `/coach/attendance/[teamId]` | Attendance per session |
| `/coach/assessments`, `/coach/assess/[playerId]` | Player assessments (see §3) |
| `/coach/messages` | Team messaging to families (see §5) |
| `/coach/resources` | Coaching guides by sport, domain, and skill |

### Pre-season checklist (league)

1. Confirm practice and game schedule with all families
2. Prepare equipment list and verify availability
3. Create contact list for team communication
4. Set up team meeting to discuss philosophy and expectations
5. Plan first 3 practices in advance
6. Establish playing time rotation system
7. Create simple way to track individual skill progress
8. Plan end-of-season celebration

## 2. Day-of delivery

Rules that apply to every format:

- Arrive early enough to complete the session-open checks before
  players are dropped off (`act.class_session_open` for classes,
  camps, clinics, and drop-ins).
- Never start a session over-ratio. Hold the start and escalate to the
  event lead.
- 70% of session time is active — playing, not waiting in lines. Every
  player has a ball or is in a small group. Games and activities, not
  drills in lines. Questions develop thinking; commands develop
  robots. Always end on a positive note.
- Coach during water breaks, not during play.
- Standard session arc: warmup (10-15 min) → technical (15-20 min) →
  game play (20-30 min) → cooldown (5-10 min).

### 2.1 League practice

**Arrival/setup.** Walk the space, stage equipment, pull the roster in
`/coach/attendance`, and take attendance as players arrive. Have the
session plan from `/coach/practices` open — every plan lists its
equipment checklist and setup steps per segment.

**Duration and group shape by age band:**

| Band | Practice length | Games |
|---|---|---|
| Discovery League (4-6) | 45 min, 1×/week | 1/week, 4×8 min quarters, 3v3 or 4v4 |
| Fundamentals League (7-9) | 60 min, 1×/week | 1/week, 2×20 min halves, 5v5 or 6v6 |
| Development League (10-12) | 75 min, 2×/week | 1/week, 2×25 min halves, 7v7 or 9v9 |

**Session structure.** Follow the standard arc. Warmup includes the
ball from the start, dynamic not static. Technical block: 1-2 skills
maximum, high repetition, high success rate. Game play: small-sided
games (3v3, 4v4) to maximize touches; use "freeze" moments sparingly.
Cooldown: ask players what they learned, highlight efforts and
improvements, build excitement for next practice.

**Playing-time and conduct rules** (from the league key principles):
Discovery — everyone plays equal time, no goalkeeper position, no
score-keeping; Fundamentals — all players rotate all positions, 50%
playing time minimum for all, no all-star or MVP selections;
Development — all players get meaningful playing time, position
exploration continues.

**Game day (league).** Attend the coach pregame briefing
(`act.coach_pregame_briefing`, ~15 min before each youth-league
kickoff, tracked by your signature): rules of the day, special
situations, conduct expectations, ref crew. Team check-in
(`act.team_check_in`) is run by the event lead — have your roster
current. Post-game, keep the focus on effort, not score.

**Wrap-up/handoff.** End on time and positive. Release players only to
a recognized parent/guardian; use pickup for the 30-second parent
handoff (what we worked on + at-home activity). Log attendance and
coach notes.

### 2.2 Skills development class

4-6 week focused blocks for players who want extra development outside
league play. Curriculum themes run 4-6 weeks each (Ball Mastery,
Passing & Receiving, Attacking Skills, Defensive Fundamentals, Game
Intelligence).

**Ratios and group sizes (hard caps — checked at session open):**

| Tier | Ages | Session | Class size | Coach ratio |
|---|---|---|---|---|
| Little Movers | 4-6 | 45 min, 1×/week, 4-5 weeks | 8-10 max | 1:4 |
| Skill Builders | 7-9 | 60 min, 1×/week, 5-6 weeks | 10-12 max | 1:5 |
| Performance Academy | 10-12 | 75 min, 1-2×/week, 6 weeks | 12-14 max | 1:6 |

**Arrival/setup.** Run `act.class_session_open`: walk the space, stage
equipment, take attendance, verify ratio before play begins.

**Session structure (sample sessions from the philosophy):**

- *Little Movers (45):* 10 movement games/animal walks → 10 ball
  exploration with guided discovery → 10 simple skill games
  (stop/start, find space) → 10 fun mini-game with no score → 5
  celebration circle, stickers/high-fives.
- *Skill Builders (60):* 10 dynamic warmup with ball, skill-based tag →
  15 focused skill work (high repetition) → 15 skill application in
  small games → 15 modified games emphasizing the week's skill → 5
  review, Q&A, at-home challenge.
- *Performance Academy (75):* 12 dynamic warmup, juggling/ball mastery
  → 20 technical focus with progressions → 18 tactical situation
  training → 20 conditioned games applying concepts → 5
  self-reflection, journaling, homework.

**Equipment.** Per the session plan's equipment checklist — as a
baseline, a ball per player, cones, and pinnies staged before arrival.

**Wrap-up/handoff.** Run `act.class_session_close`: release every
player to a recognized parent/guardian, deliver the parent handoff
(week's skill + at-home challenge, keep it fun and brief — 10-15 min),
tear down and count equipment, sweep for personal items, log notes.

### 2.3 Summer camp day

**Formats and daily schedule (run the day to these blocks):**

*Half-day camp (3 hours):*

| Time | Activity |
|---|---|
| 9:00-9:15 | Arrival, team meeting |
| 9:15-9:45 | Dynamic warmup, skill games |
| 9:45-10:30 | Technical session #1 |
| 10:30-10:45 | Water break, snack |
| 10:45-11:15 | Technical session #2 |
| 11:15-11:50 | Scrimmages and games |
| 11:50-12:00 | Cool down, recap, dismissal |

*Full-day camp (6-7 hours):*

| Time | Activity |
|---|---|
| 9:00-9:15 | Arrival, team meeting |
| 9:15-9:45 | Dynamic warmup, movement games |
| 9:45-10:45 | Technical session #1 (skill focus) |
| 10:45-11:00 | Water break |
| 11:00-11:45 | Small-sided games |
| 11:45-12:30 | Lunch break |
| 12:30-1:15 | Camp games, team building |
| 1:15-2:00 | Technical session #2 (new skill) |
| 2:00-2:15 | Water break, snack |
| 2:15-3:00 | Position play, tactical games |
| 3:00-3:45 | Tournament/World Cup games |
| 3:45-4:00 | Awards, recap, dismissal |

**Groups and ratios:**

| Group | Ages | Format | Size per coach | Notes |
|---|---|---|---|---|
| Little Kickers | 4-6 | Half-day only | 8-10 | Change activities every 8-10 min |
| Juniors | 7-9 | Half- or full-day | 10-12 | Longer sessions OK; variety + water breaks |
| Intermediates | 10-12 | Full-day recommended | 12-14 | Ready for tactical work, competition, position-specific training |

**Equipment (per the camp essential-equipment list):** balls in
age-appropriate sizes (1 per player + extras), 50+ cones in mixed
colors, 2 pinnies per player, 4-8 portable goals depending on field
size, first-aid kit (1 per field), water cooler (1 per group), whistle
(1 per coach), clipboard/roster (1 per group).

**Session structure.** Open the day with `act.class_session_open`
(ratio check against your group size). Each week has a technical theme
and a character trait (e.g., Week 1 Foundation Week — ball mastery,
Effort; Week 6 Championship Week — complete player, Sportsmanship)
capped by a Friday event. Camp culture: establish camp values on Day
1, daily awards for character (not just skill), mixed-age activities,
Friday celebrations, parent showcase at end of camp.

**Rotations.** Every station/block move is `act.camp_group_rotation`:
gather the group, walk together (no child moves alone), **count heads
against the group roster before play resumes**, then increment the
rotation counter. A mismatched count stops everything on site.

**Wrap-up/handoff.** Dismissal per the schedule block; run
`act.class_session_close`. Every camper leaves with a recognized
parent/guardian — you stay until the last one is picked up.

### 2.4 Clinic / drop-in

**Arrival/setup.** Same open procedure (`act.class_session_open`).
Registration is not yours: front of house registers day-of players via
`act.walk_on_registration` (waiver, payment, roster add). Only players
on the roster participate — if someone shows up unregistered, send the
parent to front of house; never take cash or a verbal waiver yourself.

**Ratios and group sizes.** Staff to the skills-class caps for the age
group (1:4 / 8-10 for ages 4-6, 1:5 / 10-12 for ages 7-9, 1:6 / 12-14
for ages 10-12). Because walk-ons join during the intake window,
re-check your headcount as players are added; if the next walk-on
would put you over-ratio, tell front of house to close intake and
escalate to the event lead.

**Equipment.** Ball per player, cones, pinnies — staged before the
intake window opens.

**Session structure.** A clinic is a single self-contained session:
run the standard arc (warmup → technical → game play → cooldown) sized
to the age band's session length (45/60/75 min). No season continuity
— pick one skill focus, keep success rate high, and make sure every
player leaves having touched the ball constantly.

**Wrap-up/handoff.** `act.class_session_close` as usual. There is no
weekly update for drop-ins, so the pickup handoff is the whole parent
touchpoint — make the one sentence count.

## 3. Assessment duties

**Assess during play, not formal tests.** Watch for skills during
regular activities and games — the curriculum's assessment format is
explicitly "how to assess (during regular play)." Record what you
observed in `/coach/assess/[playerId]` with the observation context
(practice, game, scrimmage). Ratings are levels 1-5 (Emerging,
Developing, Competent, Proficient, Advanced) against the skill's
rubric of observable behaviors.

**Cadence.** Technical and tactical domains: monthly. Physical and
psychological domains: once per season. The Development League season
flow builds a baseline in weeks 1-2 (skill assessment, goal setting) —
get first assessments in early so end-of-season trends mean something.

**Calibrating your ratings.** A 2 for one player and a 2 for another should
mean the same thing. Read the skill's progression-level descriptions and
observable-behavior list on the assessment page before you rate — don't go
from memory. Compare a player to their own past ratings, not to teammates.
If a rating feels borderline (a strong 2 vs. a weak 3, especially), use your
shadow session to co-assess with a lead coach and compare notes. The full
worked-example guide is at `/coach/resources` (topic: assessment
calibration).

**Coach notes.** Notes you log against a player are **visible to
parents by default** — write every note as if the parent is reading
it, because they are. Use ELM language: name the effort, what was
learned, and the next step. Record specific strengths and areas for
improvement; never compare a child to a teammate in a note.

**What parents see.** The parent dashboard shows a per-domain
development report built from your assessments: average level per
domain, number of assessments, and a trend (improving / stable /
declining). Achievements unlocked by assessments trigger parent
notifications. Sparse or last-minute assessing produces misleading
trends — keep the cadence.

## 4. Safety & incident escalation

**First-aid readiness.** The venue manager verifies every kit and the
AED before the day starts (`act.first_aid_kit_check`, ~60 min before
first start; no event begins without a verified kit). Your job at
session open is to confirm a kit is physically at your field/court —
it is an item on `chk.class_session_open`. Camps carry one kit per
field.

**Incident response (`act.incident_response`).** For any injury,
altercation, or medical event:

1. Stop play. Attend to the child; render first aid within your
   CPR/first-aid training.
2. Life-threatening: call 911 immediately — this also escalates
   directly to the Director.
3. Notify the event lead / venue manager. The venue manager is
   accountable for the incident form (captured within ~5 minutes);
   give them your first-hand account: who responded, what immediate
   care was given, whether 911 was called.
4. Do not speculate about diagnosis to parents; stick to what happened
   and what was done. The full report is finalized post-session
   (`act.incident_report_finalization`) and families get a follow-up
   within 24-48h (`act.incident_followup`).

**Weather and rainouts.** The venue manager owns the 72h forecast
review (`act.weather_pre_check`) and the pregame check
(`act.weather_check_pregame`, ~90 min out). **You never make the
rainout call** — that is `act.rainout_decision` (venue manager, with
Director consulted). Cancellations reach families through the platform
broadcast (`act.cancellation_broadcast`); direct parents to the
official notice rather than announcing your own. If conditions turn
dangerous mid-session, stop play, move players to shelter, keep the
group together with a headcount, and wait for the venue manager's
decision.

**Recognizing athletes who need support.** Watch the four red-flag
categories from the philosophy — physical (persistent fatigue/injury,
avoiding activity they enjoyed), emotional (excessive anxiety,
withdrawal, frequent crying, loss of enjoyment), social (bullying,
isolation, unresolved conflict), developmental (significant skill lag
despite effort, difficulty understanding instructions, attention
challenges). Responses range from a private conversation and reduced
pressure to involving parents and suggesting evaluation. General
principle: **when in doubt, communicate with parents** — they know
their child best.

## 5. Parent communication

**Channels.**

- `/coach/messages` — your team messaging surface; use it for the
  season-start letter, weekly updates, and individual notes.
- Platform broadcasts — attendance confirmations
  (`act.attendance_roster_confirm`), 24h reminders
  (`act.parent_t24_reminder`), and cancellations
  (`act.cancellation_broadcast`) are sent by the platform. Don't
  duplicate them; don't contradict them.
- In person — the pickup handoff at session close (§2).

**Principles** (from the philosophy): set expectations early in the
season; focus on development, not standings; share what you're working
on, not who's "best"; provide specific things to practice at home;
welcome questions and concerns. Keep the 5:1 ratio in written
communication too.

**Templates.** Use the philosophy's four templates as your starting
point (full text lives with the coaching philosophy; summarized here):

- *Season start* — introduce your development-effort-fun philosophy
  and ask parents to praise effort not outcomes, ask "Did you have
  fun?" after games, avoid coaching from the sidelines, celebrate
  improvement over results.
- *Weekly update* — "This week in practice we focused on [SKILL]…",
  two at-home activities ("keep it fun and brief — 10-15 min"), and
  one positive team/effort highlight.
- *Positive progress* — share a specific improvement with two concrete
  observations, credited to the child's effort and willingness to try
  new things.
- *Addressing a concern* — thank the parent, share what you've
  observed, state your plan, and commit to staying in touch. Never
  litigate playing time or standings by message; move it to a
  conversation.

**Sideline coaching by parents** is handled with the season-start
framing first ("avoid coaching from the sidelines"), a friendly
in-person reminder second; persistent conduct problems are the event
lead's to enforce (`act.code_of_conduct_enforcement`), not yours to
police mid-session.
