import { describe, it, expect } from "vitest";
import path from "node:path";
import {
  renderTrainingDeck,
  generateAllTrainingDecks,
} from "../../../../src/lib/ops-catalog/views/training-deck";
import { loadCatalog } from "../../../../src/lib/ops-catalog/loader";
import { buildInlineCatalog, fixtureIds } from "../fixtures/inline-catalog";
import type { Role } from "../../../../src/lib/ops-catalog/types/role";

describe("renderTrainingDeck", () => {
  it("renders a self-contained HTML deck with a title slide for the role", () => {
    const html = renderTrainingDeck(buildInlineCatalog(), fixtureIds.roles.venueManager);

    expect(html).toMatch(/^<!doctype html>/);
    expect(html).toContain("<html lang=\"en\">");
    expect(html).toContain("<title>Venue Manager — Training Deck</title>");
    expect(html).toContain("<h1>Venue Manager</h1>");
    expect(html).toContain("Day-of operational lead at the venue.");
    // No external network dependency.
    expect(html).not.toContain("https://fonts.googleapis.com");
    expect(html).not.toContain("<link");
  });

  it("has slide navigation and print CSS baked into the shell", () => {
    const html = renderTrainingDeck(buildInlineCatalog(), fixtureIds.roles.venueManager);

    expect(html).toContain("class=\"slide\"");
    expect(html).toContain("ArrowRight");
    expect(html).toContain("ArrowLeft");
    expect(html).toMatch(/@media print/);
  });

  it("throws on an unknown roleId", () => {
    expect(() =>
      renderTrainingDeck(buildInlineCatalog(), "role.does_not_exist"),
    ).toThrow(/Unknown role/);
  });

  it("escapes HTML-significant characters in role name/description", () => {
    const catalog = buildInlineCatalog();
    catalog.roles = catalog.roles.map((r) =>
      r.id === fixtureIds.roles.venueManager
        ? { ...r, description: "Handles <script> & \"quotes\"" }
        : r,
    );
    const html = renderTrainingDeck(catalog, fixtureIds.roles.venueManager);
    expect(html).toContain("Handles &lt;script&gt; &amp; &quot;quotes&quot;");
    // Deviation from the plan's literal `expect(html).not.toContain("<script>")`:
    // the deck shell legitimately emits a `<script>` tag for slide navigation
    // (same task, renderDeckShell), so a document-wide ban on that substring
    // can never pass. Narrowed to check the actual security-relevant point —
    // the injected description payload must not appear unescaped.
    expect(html).not.toContain("Handles <script>");
  });
});

describe("renderTrainingDeck — your day + activity slides", () => {
  it("includes a phase-overview slide and per-activity detail slides for matched activities", () => {
    const html = renderTrainingDeck(buildInlineCatalog(), fixtureIds.roles.venueManager);

    // Phase divider chapter headings (day_setup comes before pre_game in
    // PHASE_ORDER) — the flat "Your day: <phase>" heading was replaced by a
    // dedicated divider slide (big Newsreader chapter name) per phase.
    expect(html).toMatch(/<p class="divider-title">Day setup<\/p>.*<p class="divider-title">Pre game<\/p>/s);
    // Per-activity detail content.
    expect(html).toContain("Rainout decision");
    // Natural-language involvement, not the raw RACI label. venue_manager is
    // both accountable and responsible for rainout_decision, which reads as
    // full ownership.
    expect(html).toContain("You own this");
    // Trigger shorthand ("2h") is humanized into plain English.
    expect(html).toContain("Weather/field condition within 2 hours of kickoff suggests cancellation");
    expect(html).toContain("Open admin panel.");
    expect(html).toContain("Check weather.");
    expect(html).toContain("Decide.");
  });

  it("excludes activities the role has no involvement in", () => {
    const html = renderTrainingDeck(buildInlineCatalog(), fixtureIds.roles.parent);
    expect(html).not.toContain("Rainout decision");
    expect(html).not.toContain("Field setup");
  });

  it("emits a graceful-degrade screenshot slot by default (no opts.screenshots)", () => {
    const html = renderTrainingDeck(buildInlineCatalog(), fixtureIds.roles.venueManager);
    expect(html).toContain(
      "../../../../training/screenshots/venue_manager/rainout_decision.png",
    );
    expect(html).toContain("this.parentElement.classList.add('screenshot-missing')");
  });

  it("embeds a data URI screenshot when opts.screenshots has a matching slug", () => {
    const screenshots = new Map([["rainout_decision", "data:image/png;base64,AAAA"]]);
    const html = renderTrainingDeck(buildInlineCatalog(), fixtureIds.roles.venueManager, {
      screenshots,
    });
    expect(html).toContain('src="data:image/png;base64,AAAA"');
    expect(html).not.toContain(
      "../../../../training/screenshots/venue_manager/rainout_decision.png",
    );
  });
});

describe("renderTrainingDeck — natural language pass", () => {
  it("never renders the raw act.* catalog id badge on activity slides", () => {
    const html = renderTrainingDeck(buildInlineCatalog(), fixtureIds.roles.venueManager);
    expect(html).not.toMatch(/<code>act\./);
    expect(html).not.toContain("act.rainout_decision");
    expect(html).not.toContain("act.field_setup");
  });

  it("never renders bare RACI jargon labels", () => {
    const html = renderTrainingDeck(buildInlineCatalog(), fixtureIds.roles.venueManager);
    expect(html).not.toContain("Accountable");
    expect(html).not.toContain("Responsible");
  });

  it("translates responsible-only involvement to \"You're part of this\"", () => {
    // field_setup: venue_manager is accountable, coach is responsible only.
    const html = renderTrainingDeck(buildInlineCatalog(), fixtureIds.roles.coach);
    expect(html).toContain("You&#39;re part of this");
  });

  it("resolves role.<id> tokens AND bare role-id words in free text on activity slides, not just the safety slide", () => {
    const catalog = buildInlineCatalog();
    catalog.roles = [
      ...catalog.roles,
      {
        id: "role.director",
        name: "Director",
        tier: "leadership",
        kind: "worker",
        description: "Oversight.",
        manual_target: "employee_manual",
      },
    ];
    catalog.activities = catalog.activities.map((a) =>
      a.id === fixtureIds.activities.fieldSetup
        ? {
            ...a,
            escalation_path:
              "If venue_manager unreachable, escalate to role.director per the\nstandard handoff ladder.",
          }
        : a,
    );

    const html = renderTrainingDeck(catalog, fixtureIds.roles.venueManager);
    expect(html).not.toContain("role.director");
    expect(html).not.toContain("venue_manager unreachable");
    expect(html).toContain(
      "If Venue Manager unreachable, escalate to Director per the standard handoff ladder.",
    );
  });

  it("never renders the catalog stub procedure text, replacing it with a natural fallback", () => {
    const catalog = buildInlineCatalog();
    catalog.activities = catalog.activities.map((a) =>
      a.id === fixtureIds.activities.fieldSetup
        ? {
            ...a,
            sop_body:
              "Procedure to be authored by the operating team. This activity is defined\n" +
              "in the catalog; full step-by-step SOP content will be added in a\n" +
              "follow-up PR.\n",
          }
        : a,
    );

    const html = renderTrainingDeck(catalog, fixtureIds.roles.venueManager);
    expect(html).not.toContain("Procedure to be authored");
    expect(html).toContain(
      "Your lead will walk you through this step by step during your first shift.",
    );
  });

  it("drops the field-name 'Tracking:' label, but surfaces the checklist as a meta-chip when one exists", () => {
    const html = renderTrainingDeck(buildInlineCatalog(), fixtureIds.roles.venueManager);
    // field_setup (day_setup phase) is tracking_method "checklist" -> chk.field_setup,
    // surfaced as a "Checklist: Field setup" meta-chip (round 2 anatomy —
    // replaced the old "There's a checklist for this" filler sentence).
    expect(html).not.toContain("Tracking:");
    expect(html).toContain('<span class="meta-chip meta-chip--checklist">Checklist: Field setup</span>');
  });

  it("does not mention a checklist for activities tracked another way", () => {
    // rainout_decision is tracking_method "form" for venue_manager.
    const html = renderTrainingDeck(buildInlineCatalog(), fixtureIds.roles.venueManager);
    const rainoutSlideStart = html.indexOf("<h2>Rainout decision</h2>");
    const nextSlideStart = html.indexOf("<section", rainoutSlideStart + 1);
    const rainoutSlide = html.slice(rainoutSlideStart, nextSlideStart);
    expect(rainoutSlide).not.toContain("checklist for this");
  });

  it("renders 'When:' instead of 'Trigger:' and humanizes duration shorthand", () => {
    const catalog = buildInlineCatalog();
    catalog.activities = catalog.activities.map((a) =>
      a.id === fixtureIds.activities.fieldSetup
        ? { ...a, trigger: "48h before event window" }
        : a,
    );
    const html = renderTrainingDeck(catalog, fixtureIds.roles.venueManager);
    expect(html).not.toContain("Trigger:");
    expect(html).toContain("48 hours before the event");
  });
});

describe("renderTrainingDeck — real catalog regression guard", () => {
  it("never renders the catalog stub procedure text in any generated deck", async () => {
    const catalogDir = path.resolve(__dirname, "../../../../docs/operations/catalog");
    const catalog = await loadCatalog(catalogDir);
    const decks = generateAllTrainingDecks(catalog);

    expect(Object.keys(decks).length).toBeGreaterThan(0);
    for (const [roleId, html] of Object.entries(decks)) {
      expect(html, `deck for ${roleId} should not leak the catalog stub string`).not.toContain(
        "Procedure to be authored by the operating team",
      );
      expect(html, `deck for ${roleId} should not leak a raw act.* badge`).not.toMatch(
        /<code>act\./,
      );
    }
  });

  // Categorical id-leak guard (round 2, item 2): strip every tag from every
  // generated deck's HTML and assert no dotted catalog id — of ANY artifact
  // kind, not just act.* — ever appears in the visible text. This is
  // deliberately broader than the single "Checklist: chk.foo" bug that
  // prompted it, so a future regression on a different artifact kind (or a
  // new deck section) trips the same guard.
  it("never leaks a dotted catalog id (act./chk./frm./sig./evt./counter./role./feat.) in visible text on any deck", async () => {
    const catalogDir = path.resolve(__dirname, "../../../../docs/operations/catalog");
    const catalog = await loadCatalog(catalogDir);
    const decks = generateAllTrainingDecks(catalog);

    const dottedIdRe = /\b(?:act|chk|frm|sig|evt|counter|role|feat)\.[a-z0-9_]+\b/g;

    expect(Object.keys(decks).length).toBeGreaterThan(0);
    for (const [roleId, html] of Object.entries(decks)) {
      const visibleText = html
        .replace(/<style[\s\S]*?<\/style>/g, " ")
        .replace(/<script[\s\S]*?<\/script>/g, " ")
        .replace(/<[^>]+>/g, " ");
      const matches = visibleText.match(dottedIdRe);
      expect(matches, `deck for ${roleId} leaked catalog id(s): ${JSON.stringify(matches)}`).toBeNull();
    }
  });
});

describe("renderTrainingDeck — procedure step parsing (real catalog fixture)", () => {
  // TDD fixture: act.weather_pre_check's real sop_body
  // (docs/operations/catalog/activities/act.weather_pre_check.yaml) is a
  // 6-step numbered procedure whose sentences wrap across 16 physical YAML
  // lines. The old line-splitting renderer turned every physical line into
  // its own renumbered <li>, mangling this into 16 fragments (e.g. step 1's
  // "...on the" / "day's schedule..." split across two <li>s). Assert the
  // real, true step count and that no fragment ends mid-sentence.
  it("renders exactly the 6 real steps of act.weather_pre_check as whole sentences, not one <li> per wrapped source line", async () => {
    const catalogDir = path.resolve(__dirname, "../../../../docs/operations/catalog");
    const catalog = await loadCatalog(catalogDir);
    const html = renderTrainingDeck(catalog, "role.venue_manager");

    const slideStart = html.indexOf("<h2>Pre-day weather pre-check</h2>");
    expect(slideStart).toBeGreaterThan(-1);
    const nextSlideStart = html.indexOf("<section", slideStart + 1);
    const slide = html.slice(slideStart, nextSlideStart);

    const stepMatches = [...slide.matchAll(/<li>(.*?)<\/li>/g)].map((m) => m[1]);
    expect(stepMatches).toHaveLength(6);

    // Full first step, reassembled from its 3 wrapped source lines — proves
    // continuation lines are folded into the step, not split into their own
    // list items.
    expect(stepMatches[0]).toBe(
      "72 hours before the event window, pull up every outdoor match on the day&#39;s schedule and check the forecast for temperature, precipitation chance, wind, and lightning risk on the weather-alert dashboard.",
    );
    // Last step, reassembled from its 2 wrapped source lines.
    expect(stepMatches[5]).toBe(
      "Re-run the T-24h recheck if step 5 applied, and carry any still-open risk forward into the pregame weather check.",
    );

    // No step should end on an obvious mid-sentence fragment boundary (the
    // old bug's signature — lines like "...on the" or "...and the").
    for (const step of stepMatches) {
      expect(step.trim()).not.toMatch(/\b(the|and|a|to|of|on)$/i);
    }
  });
});

describe("renderTrainingDeck — checklist slides", () => {
  it("renders a checklist slide for each distinct checklist template the role's matched activities reference", () => {
    const html = renderTrainingDeck(buildInlineCatalog(), fixtureIds.roles.venueManager);
    // Field setup (day_setup) is tracking_method "checklist" -> chk.field_setup,
    // whose derived human title is "Field setup" — the raw id never reaches
    // trainee-facing text (see the "id-leak" regression guard below).
    expect(html).toMatch(/<div class="clipboard-card">\s*<h2>Field setup<\/h2>/);
    expect(html).toContain("Cones placed");
    expect(html).not.toContain("chk.field_setup");
  });

  it("does not render a checklist slide for activities tracked another way", () => {
    // Rainout decision is tracking_method "form", not "checklist" — the venue
    // manager's only checklist reference is field_setup, so there is exactly
    // one checklist slide, not one per matched activity.
    const html = renderTrainingDeck(buildInlineCatalog(), fixtureIds.roles.venueManager);
    const occurrences = html.split('<div class="clipboard-card">').length - 1;
    expect(occurrences).toBe(1);
  });
});

describe("renderTrainingDeck — safety & escalation slide", () => {
  it("lists each matched activity's escalation path, deduplicated", () => {
    const html = renderTrainingDeck(buildInlineCatalog(), fixtureIds.roles.venueManager);
    expect(html).toContain("Safety &amp; escalation");
    expect(html).toContain("If Venue Manager unreachable, on-call Director makes call.");
    expect(html).toContain("Venue Manager radios assistant.");
  });

  it("resolves role.* mentions in escalation text to real role names", () => {
    // The fixture's escalation_path strings use human-readable names (e.g.
    // "Venue Manager"), not catalog role ids — real catalog activities do
    // embed literal "role.xxx" tokens (see docs/operations/catalog/activities/
    // act.ref_check_in.yaml's escalation_path for a real example). Mutate one
    // fixture activity's escalation_path to exercise that real-world shape
    // rather than asserting against text the fixture doesn't actually contain.
    const catalog = buildInlineCatalog();
    catalog.activities = catalog.activities.map((a) =>
      a.id === fixtureIds.activities.postGameReport
        ? { ...a, escalation_path: "If unresolved, escalate to role.venue_manager." }
        : a,
    );

    const html = renderTrainingDeck(catalog, fixtureIds.roles.coach);
    expect(html).toContain("You may need to escalate to:");
    expect(html).toContain("Venue Manager");
  });
});

describe("renderTrainingDeck — your tools + help slides", () => {
  it("lists role-relevant portal pages for a role with known tooling", () => {
    const html = renderTrainingDeck(buildInlineCatalog(), fixtureIds.roles.venueManager);
    expect(html).toContain("Your tools");
    expect(html).toContain("/admin/venue");
  });

  it("lists the coach's /coach surfaces including practices and assessments", () => {
    const html = renderTrainingDeck(buildInlineCatalog(), fixtureIds.roles.coach);
    expect(html).toContain("/coach/practices");
    expect(html).toContain("/coach/assess/[playerId]");
  });

  it("gracefully degrades to an explicit no-tools note for a role with no PORTAL_PAGES entry", () => {
    const html = renderTrainingDeck(buildInlineCatalog(), fixtureIds.roles.parent);
    expect(html).toContain("No dedicated portal pages yet");
  });

  it("closes with a help slide naming the director as final escalation tier", () => {
    const catalog = buildInlineCatalog();
    catalog.roles = [
      ...catalog.roles,
      {
        id: "role.director",
        name: "Director",
        tier: "leadership",
        kind: "worker",
        description: "Oversight.",
        manual_target: "employee_manual",
      },
    ];
    const html = renderTrainingDeck(catalog, fixtureIds.roles.venueManager);
    expect(html).toContain("Where to get help");
    expect(html).toContain("Director is the final escalation tier");
  });
});

describe("renderTrainingDeck — brand design pass", () => {
  it("embeds the editorial cream token set with the corrected single-accent primary value", () => {
    const html = renderTrainingDeck(buildInlineCatalog(), fixtureIds.roles.venueManager);
    // Exact oklch values copied from src/styles/globals.css :root. --primary
    // matches the semantic --primary token (--primary-orange), not the
    // brighter --primary-orange-bright some earlier drafts used.
    expect(html).toContain("--cream: oklch(0.972 0.008 80);");
    expect(html).toContain("--cream-2: oklch(0.955 0.012 78);");
    expect(html).toContain("--cream-3: oklch(0.935 0.018 76);");
    expect(html).toContain("--ink: oklch(0.18 0.008 260);");
    expect(html).toContain("--ink-2: oklch(0.26 0.012 260);");
    expect(html).toContain("--ink-muted: oklch(0.42 0.01 260);");
    expect(html).toContain("--navy: oklch(0.24 0.06 260);");
    expect(html).toContain("--navy-deep: oklch(0.18 0.07 262);");
    expect(html).toContain("--primary: oklch(0.58 0.19 35);");
    expect(html).toContain("--ochre: oklch(0.75 0.12 75);");
    expect(html).toContain("--sage: oklch(0.52 0.08 155);");
    expect(html).toContain("--paper: oklch(0.99 0.003 80);");
  });

  it("never uses a pure black or white literal", () => {
    const html = renderTrainingDeck(buildInlineCatalog(), fixtureIds.roles.venueManager);
    expect(html).not.toMatch(/#(?:fff(?:fff)?|000(?:000)?)\b/i);
  });

  it("embeds all 11 brand font weights/styles as base64 data-URI @font-face rules, no CDN link", () => {
    const html = renderTrainingDeck(buildInlineCatalog(), fixtureIds.roles.venueManager);
    const faceCount = (html.match(/@font-face/g) ?? []).length;
    expect(faceCount).toBe(11);
    expect(html).toContain('src: url(data:font/woff2;base64,');
    expect(html).toContain('format("woff2")');
    expect(html).not.toContain("fonts.googleapis.com");
    expect(html).not.toContain("fonts.gstatic.com");
    // Newsreader normal + italic, both present.
    expect(html).toMatch(/font-family: "Newsreader";\s*font-style: normal;\s*font-weight: 400;/);
    expect(html).toMatch(/font-family: "Newsreader";\s*font-style: italic;\s*font-weight: 600;/);
    expect(html).toMatch(/font-family: "IBM Plex Sans";\s*font-style: normal;\s*font-weight: 500;/);
    expect(html).toMatch(/font-family: "IBM Plex Mono";\s*font-style: normal;\s*font-weight: 400;/);
  });

  it("produces identical font-face bytes across renders (deterministic embedding)", () => {
    const first = renderTrainingDeck(buildInlineCatalog(), fixtureIds.roles.venueManager);
    const second = renderTrainingDeck(buildInlineCatalog(), fixtureIds.roles.coach);
    const extractFaces = (html: string) => html.slice(html.indexOf("@font-face"), html.indexOf(":root"));
    expect(extractFaces(first)).toBe(extractFaces(second));
  });

  it("renders a touchline footer on every slide with a deterministic NN / total counter and position tick", () => {
    const html = renderTrainingDeck(buildInlineCatalog(), fixtureIds.roles.coach);
    const sectionCount = (html.match(/<section class="slide"/g) ?? []).length;
    const footerCount = (html.match(/<footer class="touchline">/g) ?? []).length;
    expect(footerCount).toBe(sectionCount);
    expect(html).toContain(`01 / ${sectionCount}`);
    expect(html).toContain(`${String(sectionCount).padStart(2, "0")} / ${sectionCount}`);
    expect(html).toMatch(/<span class="touchline-tick" style="left: [\d.]+%"><\/span>/);
  });

  it("renders a mono WHEN meta-chip on activity slides carrying the extracted 'When' value", () => {
    const html = renderTrainingDeck(buildInlineCatalog(), fixtureIds.roles.venueManager);
    // field_setup's fixture trigger ("60 minutes before first kickoff") is
    // humanized unchanged (no T+/- or Nh shorthand to expand) and now lives
    // in the meta-chip row's WHEN chip (round 2: replaced the old
    // top-right-floating .time-rail element), not in a separate "When:"
    // meta line.
    expect(html).toContain(
      '<span class="meta-chip meta-chip--when">When: 60 minutes before first kickoff</span>',
    );
    expect(html).not.toContain("<strong>When:</strong>");
    expect(html).not.toContain('class="time-rail"');
  });

  it("gives the poster slide a print-CSS override back to the cream/ink palette", () => {
    const html = renderTrainingDeck(buildInlineCatalog(), fixtureIds.roles.coach);
    const printBlockStart = html.indexOf("@media print");
    expect(printBlockStart).toBeGreaterThan(-1);
    const printBlock = html.slice(printBlockStart);
    expect(printBlock).toContain('[data-kind="poster"] {');
    expect(printBlock).toContain("background: var(--cream) !important;");
    expect(printBlock).toContain("color: var(--ink) !important;");
  });

  it("restricts the primary red-orange accent to the poster quote mark, focus states, links, and the touchline tick", () => {
    const html = renderTrainingDeck(buildInlineCatalog(), fixtureIds.roles.coach);
    const primaryUsages = [...html.matchAll(/color:\s*var\(--primary\)|background:\s*var\(--primary\)|outline:\s*2px solid var\(--primary\)/g)];
    // a { color }, focus-visible outline, .poster-quote color, .touchline-tick background.
    expect(primaryUsages.length).toBe(4);
  });
});

describe("generateAllTrainingDecks", () => {
  it("returns one deck per worker role and excludes customer/system roles", () => {
    const all = generateAllTrainingDecks(buildInlineCatalog());
    expect(Object.keys(all).sort()).toEqual(
      [fixtureIds.roles.coach, fixtureIds.roles.venueManager].sort(),
    );
    expect(all[fixtureIds.roles.parent]).toBeUndefined();
  });

  it("does NOT skip hand_authored worker roles, unlike generateAllRoleManuals", () => {
    const catalog = buildInlineCatalog();
    const handAuthored: Role = {
      id: "role.team_captain",
      name: "Team Captain",
      tier: "field_side",
      kind: "worker",
      description: "Worker role whose manual is written by hand.",
      manual_target: "hand_authored",
    };
    const all = generateAllTrainingDecks({
      ...catalog,
      roles: [...catalog.roles, handAuthored],
    });
    expect(all["role.team_captain"]).toBeDefined();
    expect(all["role.team_captain"]).toContain("<h1>Team Captain</h1>");
    expect(Object.keys(all).sort()).toEqual(
      [fixtureIds.roles.coach, fixtureIds.roles.venueManager, "role.team_captain"].sort(),
    );
  });

  it("produces byte-identical output across repeated renders of the same input", () => {
    const catalog = buildInlineCatalog();
    const first = renderTrainingDeck(catalog, fixtureIds.roles.venueManager);
    const second = renderTrainingDeck(catalog, fixtureIds.roles.venueManager);
    expect(first).toBe(second);

    const allFirst = generateAllTrainingDecks(catalog);
    const allSecond = generateAllTrainingDecks(catalog);
    expect(allFirst).toEqual(allSecond);
  });
});

describe("renderTrainingDeck — hand-authored intro composition", () => {
  const introMd = [
    "## Welcome to the crew",
    "",
    "You're joining a **fast-moving** team.",
    "",
    "- Read the manual first",
    "- Ask your venue manager for a walkthrough",
    "",
    "## What today looks like",
    "",
    "A quick tour of the day-of flow.",
  ].join("\n");

  it("inlines intro.md content as opening slides, before the your-day section", () => {
    const html = renderTrainingDeck(buildInlineCatalog(), fixtureIds.roles.venueManager, {
      intro: introMd,
    });

    expect(html).toMatch(
      /Welcome to the crew.*What today looks like.*Your day at a glance.*<p class="divider-title">Day setup<\/p>/s,
    );
    expect(html).toContain("<strong>fast-moving</strong>");
    expect(html).toContain("<li>Read the manual first</li>");
  });

  it("renders a single 'Welcome' slide when intro.md has no ## headings", () => {
    const html = renderTrainingDeck(buildInlineCatalog(), fixtureIds.roles.venueManager, {
      intro: "Just a plain welcome paragraph, no headings.",
    });
    expect(html).toContain("<h2>Welcome</h2>");
    expect(html).toContain("Just a plain welcome paragraph, no headings.");
  });

  it("renders no intro slides when opts.intro is omitted", () => {
    const html = renderTrainingDeck(buildInlineCatalog(), fixtureIds.roles.venueManager);
    expect(html).not.toContain("Welcome to the crew");
  });

  it("composes intro slides for a hand_authored role via generateAllTrainingDecks", () => {
    const catalog = buildInlineCatalog();
    const handAuthored: Role = {
      id: "role.team_captain",
      name: "Team Captain",
      tier: "field_side",
      kind: "worker",
      description: "Worker role whose manual is written by hand.",
      manual_target: "hand_authored",
    };
    const all = generateAllTrainingDecks(
      { ...catalog, roles: [...catalog.roles, handAuthored] },
      { "role.team_captain": { intro: "## Captain's welcome\nYou run the roster now." } },
    );
    expect(all["role.team_captain"]).toContain("Captain&#39;s welcome");
    expect(all["role.team_captain"]).toContain("You run the roster now.");
  });
});

describe("renderTrainingDeck — role purpose slide", () => {
  // Splitting on the section-open tag isolates each slide's body (including
  // its own trailing `</section>`), independent of exact whitespace — same
  // technique used implicitly elsewhere via toContain, but here we need
  // positional ("immediately after the title slide") not just presence
  // assertions.
  function slideBodies(html: string): string[] {
    return html.split('<section class="slide"');
  }

  it("renders the role purpose slide as a locker-room poster immediately after the title slide, with the exact reviewed statement, for the coach role", () => {
    const html = renderTrainingDeck(buildInlineCatalog(), fixtureIds.roles.coach);
    const slides = slideBodies(html);
    // slides[0] is pre-slide shell markup, slides[1] the title slide, slides[2] the purpose slide.
    expect(slides[2]).toContain('data-kind="poster"');
    expect(slides[2]).toContain('<p class="poster-role-label">Coach</p>');
    expect(slides[2]).toContain('<span class="poster-quote" aria-hidden="true">&#8220;</span>');
    expect(slides[2]).toContain(
      "You develop people. Every practice is a chance to help a child get better at the game and more confident in themselves — development over winning, always.",
    );
  });

  it("renders the exact reviewed statement for the venue manager role", () => {
    const html = renderTrainingDeck(buildInlineCatalog(), fixtureIds.roles.venueManager);
    const slides = slideBodies(html);
    expect(slides[2]).toContain('data-kind="poster"');
    expect(slides[2]).toContain('<p class="poster-role-label">Venue Manager</p>');
    // escapeHtml turns the statement's apostrophe into &#39; — same convention
    // already used elsewhere in this file (see "You&#39;re part of this").
    expect(slides[2]).toContain(
      "You make the whole day work. From unlock to lock-up, every family&#39;s experience runs through the venue you run — smooth, safe, end to end.",
    );
  });

  it("skips the purpose slide gracefully for a role with no ROLE_PURPOSE entry, without breaking the rest of the deck", () => {
    const html = renderTrainingDeck(buildInlineCatalog(), fixtureIds.roles.parent);
    // DECK_CSS itself references `[data-kind="poster"]` as a selector (present
    // in every deck regardless of content), so assert on the actual <section>
    // attribute usage, not the bare substring.
    expect(html).not.toMatch(/<section class="slide" data-index="\d+" data-kind="poster"/);
    // Philosophy section (always present) becomes the very next slide instead.
    const slides = slideBodies(html);
    expect(slides[2]).toContain("<h2>What we believe</h2>");
  });
});

describe("renderTrainingDeck — company philosophy section", () => {
  function slideBodies(html: string): string[] {
    return html.split('<section class="slide"');
  }

  it("renders 3 'What we believe' slides right after the role-summary slide, ending with a line connecting back to the role", () => {
    const html = renderTrainingDeck(buildInlineCatalog(), fixtureIds.roles.coach);
    const slides = slideBodies(html);
    // slides[1] = title, slides[2] = purpose, slides[3] = "Your job" role
    // summary, slides[4..6] = philosophy section.
    expect(slides[3]).toContain("<h2>Your job</h2>");
    expect(slides[4]).toContain("<h2>What we believe</h2>");
    expect(slides[4]).toContain("Development Over Winning");
    expect(slides[4]).toContain("Every Child Can Improve");
    expect(slides[5]).toContain("Long-Term Athlete Development");
    expect(slides[5]).toContain("Holistic Growth");
    expect(slides[6]).toContain("Whatever your role, this is what families should feel from us.");
    // Natural language, not framework jargon.
    expect(html).not.toContain("ELM framework");
    expect(html).not.toContain("Double-Goal Coach");
  });

  it("is byte-identical across two different roles' decks", () => {
    const coachHtml = renderTrainingDeck(buildInlineCatalog(), fixtureIds.roles.coach);
    const venueHtml = renderTrainingDeck(buildInlineCatalog(), fixtureIds.roles.venueManager);
    const coachSlides = slideBodies(coachHtml);
    const venueSlides = slideBodies(venueHtml);
    // Both roles have a purpose slide AND a role-summary slide (whose
    // content legitimately differs per role — slides[3] is skipped below),
    // so the philosophy section lands at the same slide indices (4, 5, 6)
    // for both. Each slide's touchline footer (see renderTouchlineFooter) is
    // deliberately position-dependent — its "NN / total" counter and tick
    // offset are baked from (index, total slide count), which can
    // legitimately differ between two role decks with a different number of
    // matched activities. Strip the footer before comparing so this
    // assertion is about the philosophy content itself, not a coincidence of
    // the two fixture roles currently having equal slide counts.
    const withoutFooter = (slide: string) => slide.slice(0, slide.indexOf('<footer class="touchline"'));
    expect(withoutFooter(coachSlides[4])).toBe(withoutFooter(venueSlides[4]));
    expect(withoutFooter(coachSlides[5])).toBe(withoutFooter(venueSlides[5]));
    expect(withoutFooter(coachSlides[6])).toBe(withoutFooter(venueSlides[6]));
  });
});

describe("renderTrainingDeck — walkthrough appendix slide", () => {
  it("omits the appendix slide entirely when presentNarrationWorkflows is not passed", () => {
    const html = renderTrainingDeck(buildInlineCatalog(), fixtureIds.roles.coach);
    expect(html).not.toContain("Watch the walkthroughs");
  });

  it("lists only the workflows relevant to this role, ignoring workflows mapped to other roles", () => {
    const html = renderTrainingDeck(buildInlineCatalog(), fixtureIds.roles.coach, {
      presentNarrationWorkflows: ["coach-core", "coach-practices", "admin-hire-compliance"],
    });
    expect(html).toContain("Watch the walkthroughs");
    expect(html).toContain("training/narration/coach-core.md");
    expect(html).toContain("training/narration/coach-practices.md");
    // admin-hire-compliance maps to role.director, not role.coach.
    expect(html).not.toContain("admin-hire-compliance");
  });

  it("lists a venue-manager-relevant workflow on the venue manager deck", () => {
    const html = renderTrainingDeck(buildInlineCatalog(), fixtureIds.roles.venueManager, {
      presentNarrationWorkflows: ["venue-manager"],
    });
    expect(html).toContain("Watch the walkthroughs");
    expect(html).toContain("training/narration/venue-manager.md");
  });

  it("omits a workflow from the appendix when it is mapped but not yet present on disk", () => {
    const html = renderTrainingDeck(buildInlineCatalog(), fixtureIds.roles.coach, {
      presentNarrationWorkflows: ["admin-hire-compliance"],
    });
    expect(html).not.toContain("Watch the walkthroughs");
    expect(html).not.toContain("training/narration/coach-core.md");
  });

  it("is byte-stable for a worker role with no mapped workflows, regardless of presentNarrationWorkflows", () => {
    const catalog = buildInlineCatalog();
    const teamCaptain: Role = {
      id: "role.team_captain",
      name: "Team Captain",
      tier: "field_side",
      kind: "worker",
      description: "Worker role with no mapped training walkthrough.",
      manual_target: "hand_authored",
    };
    const withCatalog = { ...catalog, roles: [...catalog.roles, teamCaptain] };

    const withoutFlag = renderTrainingDeck(withCatalog, "role.team_captain");
    const withAllWorkflows = renderTrainingDeck(withCatalog, "role.team_captain", {
      presentNarrationWorkflows: [
        "coach-core",
        "coach-practices",
        "admin-hire-compliance",
        "admin-sequencing",
        "referee-gameday",
        "venue-manager",
      ],
    });

    expect(withoutFlag).toBe(withAllWorkflows);
    expect(withoutFlag).not.toContain("Watch the walkthroughs");
  });
});

describe("renderTrainingDeck — meta-chip anatomy (round 2)", () => {
  function activitySlideHtml(html: string, heading: string): string {
    const start = html.indexOf(`<h2>${heading}</h2>`);
    expect(start, `slide "${heading}" should exist`).toBeGreaterThan(-1);
    const end = html.indexOf("<section", start + 1);
    return html.slice(start, end);
  }

  it("renders a WHEN + ownership + checklist meta-chip row directly under the title, replacing the old kicker/filler-sentence anatomy", () => {
    const html = renderTrainingDeck(buildInlineCatalog(), fixtureIds.roles.venueManager);
    const slide = activitySlideHtml(html, "Field setup");

    // Chip row lands immediately after the h2, before the rest of the slide
    // body (field_setup's fixture sop_body is a single unnumbered sentence,
    // so it renders as a <p>, not <ol class="steps"> — see the "moves
    // escalation to a footnote" test below for the <ol> ordering case).
    const chipRowIdx = slide.indexOf('<div class="meta-chip-row">');
    const h2Idx = slide.indexOf("<h2>");
    expect(chipRowIdx).toBeGreaterThan(h2Idx);

    expect(slide).toContain('<span class="meta-chip meta-chip--when">When: 60 minutes before first kickoff</span>');
    // venue_manager is Accountable (not Responsible) on field_setup -> owns it.
    expect(slide).toContain('<span class="meta-chip meta-chip--owner">You own this</span>');
    expect(slide).toContain('<span class="meta-chip meta-chip--checklist">Checklist: Field setup</span>');

    // The old filler sentence and floating italic kicker line are gone.
    expect(html).not.toContain("There's a checklist for this");
    expect(slide).not.toContain('class="slide-kicker"');
  });

  it("labels a Responsible-only involvement as 'You assist' in the chip, distinct from the narrative 'You're part of this' sentence used elsewhere", () => {
    const html = renderTrainingDeck(buildInlineCatalog(), fixtureIds.roles.coach);
    const slide = activitySlideHtml(html, "Field setup");
    expect(slide).toContain('<span class="meta-chip meta-chip--owner">You assist</span>');
  });

  it("omits the checklist chip for activities tracked another way", () => {
    const html = renderTrainingDeck(buildInlineCatalog(), fixtureIds.roles.venueManager);
    const slide = activitySlideHtml(html, "Rainout decision");
    expect(slide).not.toContain("meta-chip--checklist");
  });

  it("moves escalation to a visually distinct footnote block at the bottom of the slide, after the steps and screenshot slot", () => {
    const html = renderTrainingDeck(buildInlineCatalog(), fixtureIds.roles.venueManager);
    const slide = activitySlideHtml(html, "Rainout decision");

    const stepsIdx = slide.indexOf('<ol class="steps">');
    const screenshotIdx = slide.indexOf('<div class="screenshot-frame">');
    const footnoteIdx = slide.indexOf('<div class="escalation-footnote">');

    expect(stepsIdx).toBeGreaterThan(-1);
    expect(footnoteIdx).toBeGreaterThan(screenshotIdx);
    expect(footnoteIdx).toBeGreaterThan(stepsIdx);
    expect(slide).toContain(
      '<div class="escalation-footnote"><strong>If something goes wrong:</strong> If Venue Manager unreachable, on-call Director makes call.</div>',
    );
  });
});

describe("renderTrainingDeck — flow chapters: agenda, phase dividers, checklist appendix (round 2)", () => {
  function slideBodies(html: string): string[] {
    return html.split('<section class="slide"');
  }

  it("renders an agenda slide ('Your day at a glance') listing each phase with its activity count, right after the role-summary slide", () => {
    const html = renderTrainingDeck(buildInlineCatalog(), fixtureIds.roles.venueManager);
    const slides = slideBodies(html);
    // slides[1]=title, [2]=purpose, [3]=your job, [4..6]=philosophy, [7]=agenda.
    expect(slides[7]).toContain("<h2>Your day at a glance</h2>");
    expect(slides[7]).toContain(
      '<li><span class="agenda-phase">Day setup</span><span class="agenda-count">1 activity</span></li>',
    );
    expect(slides[7]).toContain(
      '<li><span class="agenda-phase">Pre game</span><span class="agenda-count">1 activity</span></li>',
    );
  });

  it("renders a phase-divider slide (kind=divider, big chapter name, activity list) immediately before each phase's activity slides", () => {
    const html = renderTrainingDeck(buildInlineCatalog(), fixtureIds.roles.venueManager);
    const slides = slideBodies(html);
    // slides[8] = day_setup divider (first phase in PHASE_ORDER with entries).
    expect(slides[8]).toContain('data-kind="divider"');
    expect(slides[8]).toContain("Phase 1 of 2");
    expect(slides[8]).toContain('<p class="divider-title">Day setup</p>');
    expect(slides[8]).toContain("Field setup");
    // The activity slide follows immediately.
    expect(slides[9]).toContain("<h2>Field setup</h2>");
  });

  it("renders a checklist-appendix divider before the checklist slides, titled 'Checklists' with derived (not raw-id) names", () => {
    const html = renderTrainingDeck(buildInlineCatalog(), fixtureIds.roles.venueManager);
    const dividerIdx = html.indexOf('<p class="slide-kicker">Appendix</p>');
    expect(dividerIdx).toBeGreaterThan(-1);
    const checklistCardIdx = html.indexOf('<div class="clipboard-card">');
    expect(checklistCardIdx).toBeGreaterThan(dividerIdx);

    const dividerSectionEnd = html.indexOf("<section", dividerIdx);
    const dividerSlide = html.slice(html.lastIndexOf("<section", dividerIdx), dividerSectionEnd);
    expect(dividerSlide).toContain('<p class="divider-title">Checklists</p>');
    expect(dividerSlide).toContain("Field setup");
    expect(dividerSlide).not.toContain("chk.field_setup");
  });
});

describe("renderTrainingDeck — hero logo scale (round 2)", () => {
  it("gives the title slide a hero-scale logo lockup, distinct from (and bigger than) the footer wordmark", () => {
    const html = renderTrainingDeck(buildInlineCatalog(), fixtureIds.roles.venueManager);
    const slides = html.split('<section class="slide"');
    expect(slides[1]).toContain('<div class="hero-logo" role="img" aria-label="Aspire Sports"></div>');

    const heroRuleMatch = html.match(/\.hero-logo\s*\{[^}]*\}/);
    expect(heroRuleMatch).not.toBeNull();
    expect(heroRuleMatch![0]).toContain("width: 260px");
    expect(heroRuleMatch![0]).toContain("height: 72px");

    const footerRuleMatch = html.match(/\.touchline-logo\s*\{[^}]*\}/);
    expect(footerRuleMatch).not.toBeNull();
    // Modestly larger than the pre-round-2 16x36, not hero-scale.
    expect(footerRuleMatch![0]).toContain("height: 20px");
    expect(footerRuleMatch![0]).toContain("width: 45px");
  });

  it("keeps the poster (purpose) slide's existing treatment — no logo added there", () => {
    const html = renderTrainingDeck(buildInlineCatalog(), fixtureIds.roles.venueManager);
    const slides = html.split('<section class="slide"');
    // Search only actual <section> fragments (index > 0) for the attribute
    // shape, not the bare substring — DECK_CSS's own [data-kind="poster"]
    // selector text lives in slides[0] (inside <style>, before the first
    // <section>) and would otherwise false-match .find on slides[0].
    const posterSlide = slides.find(
      (s, i) => i > 0 && /^ data-index="\d+" data-kind="poster"/.test(s),
    );
    expect(posterSlide).toBeDefined();
    expect(posterSlide).not.toContain("hero-logo");
  });
});

describe("renderTrainingDeck — 'Your job' role-summary slide (round 2)", () => {
  function slideBodies(html: string): string[] {
    return html.split('<section class="slide"');
  }

  it("renders immediately after the purpose poster and before the philosophy section, with the role's real-catalog-derived content", () => {
    const html = renderTrainingDeck(buildInlineCatalog(), fixtureIds.roles.venueManager);
    const slides = slideBodies(html);
    // slides[1]=title, [2]=purpose(poster), [3]="Your job".
    expect(slides[3]).toContain("<h2>Your job</h2>");
    expect(slides[3]).toContain("You run the venue from unlock to lock-up.");
    expect(slides[3]).toContain(
      '<p class="role-summary-flow"><strong>How the day flows for you:</strong> day setup and pre game.</p>',
    );
    expect(slides[3]).toContain("<h3>What you're responsible for</h3>");
    // Owned (Accountable) cluster: field_setup (day_setup). rainout_decision
    // (pre_game) is also Accountable|Responsible for venue_manager, so both
    // phases should show a cluster line.
    expect(slides[3]).toContain("<strong>Day setup:</strong> field setup");
    expect(slides[3]).toContain("<strong>Pre game:</strong> rainout decision");
    // Next slide is the first philosophy slide.
    expect(slides[4]).toContain("<h2>What we believe</h2>");
  });

  it("renders different per-role content for a different role (not shared/copy-pasted text)", () => {
    const html = renderTrainingDeck(buildInlineCatalog(), fixtureIds.roles.coach);
    const slides = slideBodies(html);
    expect(slides[3]).toContain("<h2>Your job</h2>");
    // Coach fixture involvement: Responsible-only on field_setup (day_setup),
    // Accountable on post_game_report (post_game) -> only the latter shows
    // up as an owned cluster.
    expect(slides[3]).toContain("You run one team&#39;s sessions from open to close.");
    expect(slides[3]).toContain(
      '<p class="role-summary-flow"><strong>How the day flows for you:</strong> day setup and post game.</p>',
    );
    expect(slides[3]).toContain("<strong>Post game:</strong> post-game report");
    expect(slides[3]).not.toContain("Day setup:");
    expect(slides[3]).not.toContain("You run the venue from unlock to lock-up.");
  });

  it("skips the slide gracefully for a role with no ROLE_SUMMARY_PARAGRAPH entry (mirrors the purpose-poster gate)", () => {
    const html = renderTrainingDeck(buildInlineCatalog(), fixtureIds.roles.parent);
    expect(html).not.toContain("<h2>Your job</h2>");
  });

  it("degrades gracefully to a 'not in the catalog yet' note when the role has a summary paragraph but zero matched activities", () => {
    const catalog = buildInlineCatalog();
    const teamCaptain: Role = {
      id: "role.team_captain",
      name: "Team Captain",
      tier: "field_side",
      kind: "worker",
      description: "Worker role with no matched activities in this fixture.",
      manual_target: "hand_authored",
    };
    const html = renderTrainingDeck(
      { ...catalog, roles: [...catalog.roles, teamCaptain] },
      "role.team_captain",
    );
    const slides = slideBodies(html);
    // No purpose-poster entry for team_captain in this fixture's ROLE_PURPOSE
    // usage (poster is keyed off the same map used elsewhere in this file),
    // so "Your job" is the first slide after the title in this case; find it
    // by heading instead of a fixed index to stay robust either way.
    const summarySlide = slides.find((s) => s.includes("<h2>Your job</h2>"));
    expect(summarySlide).toBeDefined();
    expect(summarySlide).toContain('<p class="empty-note">');
    expect(summarySlide).toContain("aren't in the catalog yet");
    expect(summarySlide).not.toContain("role-summary-flow");
    expect(summarySlide).not.toContain("role-summary-clusters");
  });

  it("never leaks a raw activity id or RACI jargon in the summary slide", () => {
    const html = renderTrainingDeck(buildInlineCatalog(), fixtureIds.roles.venueManager);
    const slides = slideBodies(html);
    expect(slides[3]).not.toMatch(/\bact\.[a-z0-9_]+\b/);
    expect(slides[3]).not.toContain("Accountable");
    expect(slides[3]).not.toContain("Responsible");
  });
});
