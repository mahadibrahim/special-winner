// tests/unit/consent-boxes-unchecked.test.tsx
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
import { ConsentBoxes } from "@/components/kiosk/ConsentBoxes";

describe("consent boxes", () => {
  it("render UNCHECKED with no selection", () => {
    // A pre-checked box got the 10DLC registration declined. This test is the
    // guard; if it ever fails, do not "fix" it by changing the assertion.
    const html = renderToStaticMarkup(
      React.createElement(ConsentBoxes, { selected: [], onChange: () => {} }),
    );
    expect(html).not.toContain('checked=""');
    expect(html).not.toContain("checked");
  });
});
