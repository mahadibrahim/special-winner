import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ExitReasonChips } from "@/components/registration/exit-reason-chips";

describe("ExitReasonChips", () => {
  const html = renderToStaticMarkup(
    <ExitReasonChips seasonId="s1" flow="solo" variant="v2" onClose={() => {}} />,
  );
  it("renders the neutral prompt and all five reasons", () => {
    expect(html).toContain("Anything stop you on payment?");
    for (const label of [
      "Just browsing",
      "Checking with my team",
      "Price",
      "Had questions",
      "Something broke",
    ])
      expect(html).toContain(label);
  });
  it("renders a dismiss control and testid", () => {
    expect(html).toContain('data-testid="exit-reason-chips"');
    expect(html).toContain('aria-label="Dismiss"');
  });
});
