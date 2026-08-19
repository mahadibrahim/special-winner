// Server-side catalog loader for the youth sport league landing pages
// (/youth/leagues/<sport>). It lives here, outside the shared page component,
// because the page must know whether the fetch succeeded BEFORE it can decide
// to opt into edge caching: `setMarketingEdgeCache` writes response headers,
// and by the time a child component's frontmatter runs Astro has already
// flushed them — the call silently no-ops. Page frontmatter calls this, then
// caches on success and hands the result down as a prop.
import { partitionTerms, type TermSeason } from "./terms";
import { filterYouthSeasons } from "./youth-seasons";
import { divisionRowModel, type DivisionRowModel } from "./division-row-model";

export interface YouthLeaguePageData {
  /** True only when the live catalog fetch succeeded — gates edge caching. */
  catalogOk: boolean;
  currentTerm: { slug: string; label: string } | null;
  upcomingTerms: { slug: string; label: string }[];
  pastTerms: { slug: string; label: string }[];
  openRows: DivisionRowModel[];
  competitiveRows: DivisionRowModel[];
  developmentalRows: DivisionRowModel[];
  bannerDeadline: string | null;
  bannerTermLabel: string | null;
  bannerTermSlug: string | null;
}

export async function fetchYouthLeaguePageData(opts: {
  origin: string;
  cookie: string;
  sportSlug: string;
}): Promise<YouthLeaguePageData> {
  const { origin, cookie, sportSlug } = opts;

  // ---- Term links -> the only crawlable entry to /youth/leagues/<sport>/<term>
  // The finder rows link straight to /register/<id>, and the calendar band
  // only anchors in-page, so without these server-rendered <a>s the term page,
  // every division page under it, their Event JSON-LD and the completed-term
  // archive are reachable only by typing the URL. They live as a compact
  // line-list inside #calendar (the top banner points at on-page booking).
  // Islands can't do this job: they render nothing into the HTML.
  let currentTerm: { slug: string; label: string } | null = null;
  let upcomingTerms: { slug: string; label: string }[] = [];
  let pastTerms: { slug: string; label: string }[] = [];
  let catalogOk = false;

  // ---- Live open divisions -> the deadline banner + the inline rows in the two
  // type cards. Server-rendered on purpose: the type cards must show real,
  // bookable divisions in the HTML, not after an island settles.
  let openRows: DivisionRowModel[] = [];
  let competitiveRows: DivisionRowModel[] = [];
  let developmentalRows: DivisionRowModel[] = [];
  let bannerDeadline: string | null = null;
  let bannerTermLabel: string | null = null;
  let bannerTermSlug: string | null = null;

  try {
    // Live + completed, mirroring the term page: completed terms are the
    // permanent standings archive and deserve inbound links.
    const [liveRes, doneRes] = await Promise.all([
      fetch(`${origin}/api/public/seasons?sport=${sportSlug}&audience=youth`, { headers: { cookie } }),
      fetch(`${origin}/api/public/seasons?sport=${sportSlug}&audience=youth&status=completed`, { headers: { cookie } }),
    ]);
    catalogOk = liveRes.ok;
    const liveRows: any[] = liveRes.ok ? ((await liveRes.json()).seasons ?? []) : [];
    const doneRows: any[] = doneRes.ok ? ((await doneRes.json()).seasons ?? []) : [];
    const termSeasons: TermSeason[] = filterYouthSeasons([...liveRows, ...doneRows])
      .filter((s) => s.termSlug)
      .map((s) => ({
        id: s.id,
        termSlug: s.termSlug,
        termLabel: s.termLabel,
        status: s.status,
        startDate: s.startDate,
      }));
    const { current, upcoming, past } = partitionTerms(termSeasons);
    // No open/active term -> render nothing. A link with no destination is
    // worse than no link, and for a newly-launched sport it is the normal state.
    if (current) currentTerm = { slug: current.slug, label: current.label };
    upcomingTerms = upcoming.map((t) => ({ slug: t.slug, label: t.label }));
    pastTerms = past.map((t) => ({ slug: t.slug, label: t.label }));

    // Only seasons you can actually buy today feed the banner and the card rows.
    // 'open' is the enum value (seasons.status is draft|forming|open|closed|
    // active|completed|cancelled) — /api/public/seasons returns open|active|
    // forming, and only 'open' has a live checkout. There is no
    // 'registration_open' status; matching on one silently emptied this whole
    // block, which is why the banner never rendered.
    const open = filterYouthSeasons(liveRows).filter((s) => s.status === "open");
    // `.map((s) => divisionRowModel(s))` — a bare reference would hand the
    // model Array#map's index as its optional `now` argument.
    openRows = open.map((s) => divisionRowModel(s));
    // The two type cards are two DOORS, not two disjoint buckets: the left card
    // lists every division a whole team can enter, the right lists every
    // division one kid can join. A dual-mode winter division is genuinely both,
    // so it appears in both cards — hiding it from one of them is exactly the
    // defect this split had (the team door vanished off all of Winter 1).
    competitiveRows = openRows.filter((r) => r.team != null).slice(0, 3);
    developmentalRows = openRows.filter((r) => r.solo != null).slice(0, 3);
    // ONE season drives the whole banner — the open season whose registration
    // closes soonest (falling back to the first open season when none carry a
    // deadline). Reading the label, the slug and the date from three different
    // places is how a banner ends up pairing Winter I's name with Winter II's
    // deadline once two terms are open at the same time.
    const withDeadline = open
      .filter((s) => Boolean(s.registrationCloses))
      .sort((a, b) => String(a.registrationCloses).localeCompare(String(b.registrationCloses)));
    const bannerSeason = withDeadline[0] ?? open[0] ?? null;
    bannerDeadline = bannerSeason?.registrationCloses ?? null;
    bannerTermLabel = bannerSeason?.termLabel ?? null;
    bannerTermSlug = bannerSeason?.termSlug ?? null;
  } catch {
    // A catalog blip must not 500 the page — the commitment facts, venue cards
    // and FAQs are static and still worth serving. Falls through with no banner,
    // no inline rows and no term links.
  }

  return {
    catalogOk,
    currentTerm,
    upcomingTerms,
    pastTerms,
    openRows,
    competitiveRows,
    developmentalRows,
    bannerDeadline,
    bannerTermLabel,
    bannerTermSlug,
  };
}
