# Books

One spec file per KDP book: `<slug>.md`, matching the manuscript page at
`src/pages/books/<slug>.astro`. A spec covers the book's audience, trim
size, chapter list, and how each chapter's content is pulled from the
content registry (`CURRICULUM_CONTENT`) — see
`soccer-fundamentals-6-8.md` (the pilot) as the exemplar for structure. Its
`## Iteration notes` section is the live to-do/changelog for the book: each
dated entry records what a `/curriculum-refinery products --book <slug>`
render fixed or changed, and any unaddressed note at the bottom is what the
next `products` run for that slug is expected to implement. The spec is the
durable artifact; the rendered PDF (`pdfs/books/<slug>-interior.pdf`) is
disposable and gitignored — regenerate it, don't hunt for it in git
history.
