import { describe, it, expect } from "vitest";
import { breadcrumbJsonLd } from "@/lib/seo/breadcrumbs";

describe("breadcrumbJsonLd", () => {
  it("builds a positioned BreadcrumbList", () => {
    const ld = breadcrumbJsonLd([
      { name: "Home", url: "https://aspiresportsohio.com/" },
      { name: "Sports", url: "https://aspiresportsohio.com/sports" },
      { name: "Soccer", url: "https://aspiresportsohio.com/sports/soccer" },
    ]);
    expect(ld).toEqual({
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: "https://aspiresportsohio.com/" },
        { "@type": "ListItem", position: 2, name: "Sports", item: "https://aspiresportsohio.com/sports" },
        { "@type": "ListItem", position: 3, name: "Soccer", item: "https://aspiresportsohio.com/sports/soccer" },
      ],
    });
  });
});
