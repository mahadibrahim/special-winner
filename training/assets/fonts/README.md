# Embedded training-deck fonts

Latin-subset static WOFF2 builds for the two brand type families, used to
embed real brand fonts as base64 data-URI `@font-face` rules in
`src/lib/ops-catalog/views/training-deck.ts` — training decks are
self-contained HTML files with no CDN/network dependency, so the fonts ship
as committed bytes rather than `<link>` tags to fonts.googleapis.com.

Files (11 total, ~256 KB):

- `newsreader-normal-{400,500,600}.woff2`
- `newsreader-italic-{400,500,600}.woff2`
- `ibmplexsans-{400,500,600}.woff2`
- `ibmplexmono-{400,500}.woff2`

Downloaded from Google Fonts' static hosting (`fonts.gstatic.com`) via the
`css2` API, requesting exactly these family/weight/style combinations with a
legacy-Chrome user agent so Google serves discrete static per-weight files
instead of a single variable-font blob. Re-running the same request against
the same Google Fonts version reproduces byte-identical files.

**License**: both families are licensed under the SIL Open Font License 1.1.

- Newsreader — https://github.com/googlefonts/newsreader (OFL.txt in that repo)
- IBM Plex (Sans + Mono) — https://github.com/IBM/plex (LICENSE.txt in that repo)

Do not hand-edit these files. If a weight/style needs to change, regenerate
from Google Fonts and replace the file wholesale.
