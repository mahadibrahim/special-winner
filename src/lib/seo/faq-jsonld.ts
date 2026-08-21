/**
 * FAQPage rich-result schema from a page's authored FAQ list.
 *
 * Several pages already build this object literal inline (adult league and
 * sport pages); this helper exists so new pages stop copying the shape.
 * Emit it in the page's head slot:
 *
 *   <script type="application/ld+json" is:inline set:html={JSON.stringify(faqPageJsonLd(faqs))} />
 *
 * Answers must be the plain-text truth already rendered on the page —
 * structured data that says more than the page does is a rich-result
 * penalty, not a win.
 */
export interface FaqJsonLdItem {
  question: string;
  answer: string;
}

export function faqPageJsonLd(items: readonly FaqJsonLdItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
  };
}
