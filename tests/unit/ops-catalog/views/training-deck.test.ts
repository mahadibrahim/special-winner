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

    // Phase overview headings (day_setup comes before pre_game in PHASE_ORDER).
    expect(html).toMatch(/Your day: day setup.*Your day: pre game/s);
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

  it("drops the field-name 'Tracking:' label, but mentions the checklist in natural language when one exists", () => {
    const html = renderTrainingDeck(buildInlineCatalog(), fixtureIds.roles.venueManager);
    // field_setup (day_setup phase) is tracking_method "checklist".
    expect(html).not.toContain("Tracking:");
    expect(html).toContain("checklist for this");
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
});

describe("renderTrainingDeck — checklist slides", () => {
  it("renders a checklist slide for each distinct checklist template the role's matched activities reference", () => {
    const html = renderTrainingDeck(buildInlineCatalog(), fixtureIds.roles.venueManager);
    // Field setup (day_setup) is tracking_method "checklist" -> chk.field_setup.
    expect(html).toContain("Checklist: chk.field_setup");
    expect(html).toContain("Cones placed");
  });

  it("does not render a checklist slide for activities tracked another way", () => {
    // Rainout decision is tracking_method "form", not "checklist" — the venue
    // manager's only checklist reference is field_setup, so there is exactly
    // one checklist slide, not one per matched activity.
    const html = renderTrainingDeck(buildInlineCatalog(), fixtureIds.roles.venueManager);
    const occurrences = html.split("Checklist: chk.field_setup").length - 1;
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

    expect(html).toMatch(/Welcome to the crew.*What today looks like.*Your day: day setup/s);
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

  it("renders the role purpose slide immediately after the title slide, with the exact reviewed statement, for the coach role", () => {
    const html = renderTrainingDeck(buildInlineCatalog(), fixtureIds.roles.coach);
    const slides = slideBodies(html);
    // slides[0] is pre-slide shell markup, slides[1] the title slide, slides[2] the purpose slide.
    expect(slides[2]).toContain("<h2>Why this role matters</h2>");
    expect(slides[2]).toContain(
      "You develop people. Every practice is a chance to help a child get better at the game and more confident in themselves — development over winning, always.",
    );
  });

  it("renders the exact reviewed statement for the venue manager role", () => {
    const html = renderTrainingDeck(buildInlineCatalog(), fixtureIds.roles.venueManager);
    const slides = slideBodies(html);
    expect(slides[2]).toContain("<h2>Why this role matters</h2>");
    // escapeHtml turns the statement's apostrophe into &#39; — same convention
    // already used elsewhere in this file (see "You&#39;re part of this").
    expect(slides[2]).toContain(
      "You make the whole day work. From unlock to lock-up, every family&#39;s experience runs through the venue you run — smooth, safe, end to end.",
    );
  });

  it("skips the purpose slide gracefully for a role with no ROLE_PURPOSE entry, without breaking the rest of the deck", () => {
    const html = renderTrainingDeck(buildInlineCatalog(), fixtureIds.roles.parent);
    expect(html).not.toContain("Why this role matters");
    // Philosophy section (always present) becomes the very next slide instead.
    const slides = slideBodies(html);
    expect(slides[2]).toContain("<h2>What we believe</h2>");
  });
});

describe("renderTrainingDeck — company philosophy section", () => {
  function slideBodies(html: string): string[] {
    return html.split('<section class="slide"');
  }

  it("renders 3 'What we believe' slides right after the purpose slide, ending with a line connecting back to the role", () => {
    const html = renderTrainingDeck(buildInlineCatalog(), fixtureIds.roles.coach);
    const slides = slideBodies(html);
    // slides[1] = title, slides[2] = purpose, slides[3..5] = philosophy section.
    expect(slides[3]).toContain("<h2>What we believe</h2>");
    expect(slides[3]).toContain("Development Over Winning");
    expect(slides[3]).toContain("Every Child Can Improve");
    expect(slides[4]).toContain("Long-Term Athlete Development");
    expect(slides[4]).toContain("Holistic Growth");
    expect(slides[5]).toContain("Whatever your role, this is what families should feel from us.");
    // Natural language, not framework jargon.
    expect(html).not.toContain("ELM framework");
    expect(html).not.toContain("Double-Goal Coach");
  });

  it("is byte-identical across two different roles' decks", () => {
    const coachHtml = renderTrainingDeck(buildInlineCatalog(), fixtureIds.roles.coach);
    const venueHtml = renderTrainingDeck(buildInlineCatalog(), fixtureIds.roles.venueManager);
    const coachSlides = slideBodies(coachHtml);
    const venueSlides = slideBodies(venueHtml);
    // Both roles have a purpose slide, so the philosophy section lands at the
    // same slide indices (3, 4, 5) for both.
    expect(coachSlides[3]).toBe(venueSlides[3]);
    expect(coachSlides[4]).toBe(venueSlides[4]);
    expect(coachSlides[5]).toBe(venueSlides[5]);
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
