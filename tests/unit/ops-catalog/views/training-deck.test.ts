import { describe, it, expect } from "vitest";
import {
  renderTrainingDeck,
  generateAllTrainingDecks,
} from "../../../../src/lib/ops-catalog/views/training-deck";
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
    expect(html).toContain("Accountable | Responsible");
    expect(html).toContain("Weather/field condition within 2h of kickoff suggests cancellation");
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
