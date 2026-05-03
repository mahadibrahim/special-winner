/**
 * Aspire Sports — Strategy Document Renderer
 *
 * Renders three categories of source documents to branded PDFs:
 *   1. Internal markdown (.md) → Editorial portrait template
 *   2. P&L CSV → Editorial landscape template (wide tables)
 *   3. Authored HTML decks (in presentations/) → Landscape presentation
 *
 * Design system: Newsreader serif + IBM Plex Sans/Mono, cream/ink/navy/primary palette.
 * See docs/design-system.md.
 */

import { chromium, type Page } from "@playwright/test";
import { marked } from "marked";
import { readdir, readFile, mkdir } from "node:fs/promises";
import { resolve, basename, extname, join } from "node:path";

const STRATEGY_DIR = resolve(process.cwd(), "docs/strategy");
const PRESENTATIONS_DIR = resolve(process.cwd(), "docs/strategy/presentations");
const OUT_DIR = resolve(process.cwd(), "pdfs/strategy");

marked.setOptions({ gfm: true, breaks: false });

// ---------- Font + brand tokens ----------
const FONT_LINKS = `
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;0,6..72,600;0,6..72,700;1,6..72,400;1,6..72,500;1,6..72,600&family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet">
`;

const BRAND_TOKENS = `
  --cream: oklch(0.972 0.008 80);
  --cream-2: oklch(0.955 0.012 78);
  --cream-3: oklch(0.935 0.018 76);
  --paper: oklch(0.99 0.003 80);
  --ink: oklch(0.18 0.008 260);
  --ink-2: oklch(0.26 0.012 260);
  --ink-muted: oklch(0.42 0.01 260);
  --ink-faint: oklch(0.50 0.008 260);
  --navy: oklch(0.24 0.06 260);
  --navy-deep: oklch(0.18 0.07 262);
  --primary: oklch(0.58 0.19 35);
  --primary-bright: oklch(0.66 0.21 35);
  --primary-soft: oklch(0.92 0.035 50);
  --ochre: oklch(0.75 0.12 75);
  --sage: oklch(0.52 0.08 155);
  --rule: oklch(0.85 0.012 78);
  --rule-soft: oklch(0.90 0.010 78);
`;

// ---------- Editorial portrait template (internal docs) ----------
const EDITORIAL_CSS = `
  :root { ${BRAND_TOKENS} }
  @page {
    size: Letter;
    margin: 0.85in 0.75in 0.95in 0.75in;
  }
  * { box-sizing: border-box; }
  html, body {
    margin: 0;
    padding: 0;
    background: var(--cream);
    color: var(--ink);
    font-family: "IBM Plex Sans", -apple-system, sans-serif;
    font-size: 10pt;
    line-height: 1.55;
    font-feature-settings: "ss01", "ss02", "kern", "liga";
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  /* -------- Masthead (top of doc) -------- */
  .masthead {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    border-bottom: 1.5px solid var(--ink);
    padding-bottom: 6pt;
    margin-bottom: 22pt;
    font-family: "IBM Plex Mono", monospace;
    font-size: 8pt;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--ink);
  }
  .masthead .brand { font-weight: 600; color: var(--ink); }
  .masthead .brand .accent { color: var(--primary); }
  .masthead .meta { color: var(--ink-muted); font-weight: 500; }
  /* -------- Headings -------- */
  h1 {
    font-family: "Newsreader", Georgia, serif;
    font-weight: 500;
    font-style: italic;
    font-size: 36pt;
    line-height: 1.05;
    color: var(--navy);
    margin: 0 0 4pt 0;
    letter-spacing: -0.01em;
  }
  h1::after {
    content: "";
    display: block;
    width: 48pt;
    height: 3px;
    background: var(--primary);
    margin: 12pt 0 18pt 0;
  }
  h2 {
    font-family: "Newsreader", Georgia, serif;
    font-weight: 500;
    font-size: 19pt;
    line-height: 1.2;
    color: var(--ink);
    margin: 28pt 0 8pt 0;
    padding-top: 14pt;
    border-top: 1px solid var(--rule);
    page-break-after: avoid;
    letter-spacing: -0.005em;
  }
  h3 {
    font-family: "IBM Plex Sans", sans-serif;
    font-weight: 600;
    font-size: 9pt;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--primary);
    margin: 20pt 0 6pt 0;
    page-break-after: avoid;
  }
  h4 {
    font-family: "IBM Plex Sans", sans-serif;
    font-weight: 600;
    font-size: 11pt;
    color: var(--ink);
    margin: 14pt 0 4pt 0;
    page-break-after: avoid;
  }
  /* -------- Paragraphs + drop cap -------- */
  p {
    margin: 6pt 0;
    orphans: 2;
    widows: 2;
  }
  /* Drop cap on first paragraph after h1 */
  h1 + p::first-letter,
  h1 + .drop-cap-target::first-letter {
    font-family: "Newsreader", Georgia, serif;
    font-weight: 600;
    font-style: italic;
    font-size: 48pt;
    line-height: 0.85;
    color: var(--navy);
    float: left;
    padding: 4pt 8pt 0 0;
  }
  /* -------- Lists -------- */
  ul, ol {
    padding-left: 18pt;
    margin: 6pt 0;
  }
  li { margin: 3pt 0; }
  ul li::marker { color: var(--primary); }
  /* -------- Inline -------- */
  strong { font-weight: 600; color: var(--ink); }
  em { font-style: italic; color: var(--ink-2); }
  a { color: var(--navy); text-decoration: none; border-bottom: 1px solid var(--ochre); }
  /* -------- Rules -------- */
  hr {
    border: none;
    height: 0;
    border-top: 1px solid var(--rule);
    margin: 22pt 0;
    position: relative;
  }
  hr::after {
    content: "§";
    font-family: "Newsreader", Georgia, serif;
    font-style: italic;
    font-size: 14pt;
    color: var(--primary);
    background: var(--cream);
    position: absolute;
    left: 50%;
    top: -10pt;
    transform: translateX(-50%);
    padding: 0 10pt;
  }
  /* -------- Blockquote (pull-quote) -------- */
  blockquote {
    margin: 18pt 0;
    padding: 8pt 0 8pt 18pt;
    border-left: 3px solid var(--primary);
    font-family: "Newsreader", Georgia, serif;
    font-style: italic;
    font-size: 14pt;
    line-height: 1.4;
    color: var(--navy);
  }
  blockquote p { margin: 0; }
  /* -------- Tables -------- */
  table {
    border-collapse: collapse;
    width: 100%;
    margin: 10pt 0 14pt 0;
    font-family: "IBM Plex Sans", sans-serif;
    font-size: 9pt;
    page-break-inside: avoid;
    font-variant-numeric: tabular-nums;
  }
  thead {
    background: var(--navy);
  }
  th {
    padding: 7pt 9pt;
    text-align: left;
    color: var(--cream);
    font-family: "IBM Plex Mono", monospace;
    font-size: 8pt;
    font-weight: 500;
    letter-spacing: 0.10em;
    text-transform: uppercase;
    border: none;
    vertical-align: bottom;
  }
  tbody tr {
    border-bottom: 1px solid var(--rule-soft);
  }
  tbody tr:nth-child(even) {
    background: var(--cream-2);
  }
  td {
    padding: 6pt 9pt;
    color: var(--ink);
    vertical-align: top;
  }
  /* Right-align numeric-looking cells: any cell starting with $ or containing % */
  td.num, th.num { text-align: right; font-family: "IBM Plex Mono", monospace; font-size: 9pt; font-weight: 500; }
  /* -------- Code / pre -------- */
  code {
    font-family: "IBM Plex Mono", monospace;
    font-size: 9pt;
    background: var(--cream-2);
    color: var(--ink-2);
    padding: 1px 5px;
    border-radius: 3px;
  }
  pre {
    background: var(--cream-2);
    border: 1px solid var(--rule);
    border-left: 3px solid var(--navy);
    padding: 10pt 12pt;
    border-radius: 2px;
    font-family: "IBM Plex Mono", monospace;
    font-size: 7pt;
    line-height: 1.4;
    overflow: hidden;
    page-break-inside: avoid;
    white-space: pre;
    color: var(--ink-2);
  }
  pre code {
    background: none;
    padding: 0;
    font-size: inherit;
    color: inherit;
  }
  /* -------- Page break controls -------- */
  h1, h2, h3, h4 { break-after: avoid-page; }
  table, pre, blockquote { break-inside: avoid; }
  /* First H1 should NOT have a page break before; subsequent ones should */
  body > h1:first-of-type { page-break-before: auto; }
`;

// ---------- Landscape P&L template ----------
const LANDSCAPE_CSS = `
  :root { ${BRAND_TOKENS} }
  @page {
    size: Letter landscape;
    margin: 0.55in 0.65in 0.7in 0.65in;
  }
  * { box-sizing: border-box; }
  html, body {
    margin: 0;
    padding: 0;
    background: var(--cream);
    color: var(--ink);
    font-family: "IBM Plex Sans", sans-serif;
    font-size: 9pt;
    line-height: 1.4;
    font-variant-numeric: tabular-nums;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .masthead {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    border-bottom: 1.5px solid var(--ink);
    padding-bottom: 6pt;
    margin-bottom: 18pt;
    font-family: "IBM Plex Mono", monospace;
    font-size: 7.5pt;
    letter-spacing: 0.18em;
    text-transform: uppercase;
  }
  .masthead .brand { font-weight: 600; color: var(--ink); }
  .masthead .brand .accent { color: var(--primary); }
  .masthead .meta { color: var(--ink-muted); }
  h1 {
    font-family: "Newsreader", Georgia, serif;
    font-weight: 500;
    font-style: italic;
    font-size: 30pt;
    line-height: 1.05;
    color: var(--navy);
    margin: 0 0 8pt 0;
    letter-spacing: -0.01em;
  }
  h1::after {
    content: "";
    display: block;
    width: 40pt;
    height: 2.5px;
    background: var(--primary);
    margin: 8pt 0 14pt 0;
  }
  h2 {
    font-family: "IBM Plex Sans", sans-serif;
    font-weight: 600;
    font-size: 9pt;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--primary);
    margin: 18pt 0 6pt 0;
    border-top: 1px solid var(--rule);
    padding-top: 10pt;
    page-break-after: avoid;
  }
  p {
    margin: 4pt 0;
    color: var(--ink-2);
    font-size: 8.5pt;
  }
  table {
    border-collapse: collapse;
    width: 100%;
    margin: 6pt 0 10pt 0;
    font-size: 8.5pt;
    page-break-inside: avoid;
  }
  thead { background: var(--navy); }
  th {
    padding: 5pt 8pt;
    text-align: left;
    color: var(--cream);
    font-family: "IBM Plex Mono", monospace;
    font-size: 7pt;
    font-weight: 500;
    letter-spacing: 0.10em;
    text-transform: uppercase;
  }
  tbody tr { border-bottom: 1px solid var(--rule-soft); }
  tbody tr:nth-child(even) { background: var(--cream-2); }
  td {
    padding: 4pt 8pt;
    color: var(--ink);
  }
  td.num, th.num { text-align: right; font-family: "IBM Plex Mono", monospace; font-weight: 500; }
  td.label { color: var(--ink-2); }
  td.section-total { font-weight: 600; color: var(--navy); border-top: 1.5px solid var(--ink); }
  hr {
    border: none;
    border-top: 1px solid var(--rule);
    margin: 14pt 0;
  }
`;

// ---------- Helpers ----------
function escape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function isNumericCell(cell: string): boolean {
  const t = cell.trim();
  if (!t) return false;
  return /^[\$\-]?[\d,.]+%?$/.test(t) || /^[\d,]+$/.test(t);
}

function buildEditorialHtml(title: string, htmlBody: string, fileLabel: string): string {
  const today = new Date().toISOString().slice(0, 10);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${escape(title)}</title>
  ${FONT_LINKS}
  <style>${EDITORIAL_CSS}</style>
</head>
<body>
  <div class="masthead">
    <span class="brand">Aspire Sports <span class="accent">//</span> Internal Strategy</span>
    <span class="meta">${escape(fileLabel)} · ${today}</span>
  </div>
  ${htmlBody}
</body>
</html>`;
}

function buildLandscapeHtml(title: string, htmlBody: string, fileLabel: string): string {
  const today = new Date().toISOString().slice(0, 10);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${escape(title)}</title>
  ${FONT_LINKS}
  <style>${LANDSCAPE_CSS}</style>
</head>
<body>
  <div class="masthead">
    <span class="brand">Aspire Sports <span class="accent">//</span> Internal Strategy</span>
    <span class="meta">${escape(fileLabel)} · ${today}</span>
  </div>
  ${htmlBody}
</body>
</html>`;
}

function applyTableNumericClasses(html: string): string {
  // Right-align cells that look numeric. Walks the string at parse-light level.
  return html.replace(/<td>([^<]*)<\/td>/g, (_, body) => {
    const trimmed = body.trim();
    if (!trimmed) return `<td>${body}</td>`;
    if (isNumericCell(trimmed) || /^\$[\d,]/.test(trimmed) || /\d+%$/.test(trimmed)) {
      return `<td class="num">${body}</td>`;
    }
    return `<td>${body}</td>`;
  });
}

function csvToHtmlTables(csv: string): string {
  const lines = csv.split(/\r?\n/);
  const rows: string[][] = [];
  for (const line of lines) {
    if (line.trim() === "") {
      rows.push([]);
      continue;
    }
    const cells: string[] = [];
    let cur = "";
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (inQuote && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuote = !inQuote;
        }
      } else if (c === "," && !inQuote) {
        cells.push(cur);
        cur = "";
      } else {
        cur += c;
      }
    }
    cells.push(cur);
    rows.push(cells);
  }

  let html = `<h1>Indoor Soccer Partnership <br>P&amp;L Sensitivity Model</h1>`;
  html += `<p>Three scenarios across all programming categories, with year-1 and year-2 roll-ups. Open the source CSV in Excel or Sheets to flex inputs live.</p>`;
  let buffer: string[][] = [];

  const flush = () => {
    if (buffer.length === 0) return;
    html += `<table><thead><tr>`;
    const header = buffer[0];
    header.forEach((cell, i) => {
      const cls = i === 0 ? "" : ' class="num"';
      html += `<th${cls}>${escape(cell.trim())}</th>`;
    });
    html += `</tr></thead><tbody>`;
    for (let r = 1; r < buffer.length; r++) {
      const row = buffer[r];
      html += `<tr>`;
      row.forEach((cell, i) => {
        const trimmed = cell.trim();
        let cls = "";
        if (i === 0) cls = ' class="label"';
        else if (i === 1) cls = ""; // unit column
        else cls = ' class="num"';
        html += `<td${cls}>${escape(trimmed)}</td>`;
      });
      html += `</tr>`;
    }
    html += `</tbody></table>`;
    buffer = [];
  };

  for (const row of rows) {
    if (row.length === 0) {
      flush();
      continue;
    }
    const first = row[0]?.trim() ?? "";
    if (first.startsWith("===") && first.endsWith("===")) {
      flush();
      const sectionName = first.replace(/=/g, "").trim();
      html += `<h2>${escape(sectionName)}</h2>`;
      continue;
    }
    if (row.length === 1 || row.slice(1).every((c) => c.trim() === "")) {
      flush();
      html += `<p>${escape(first)}</p>`;
      continue;
    }
    buffer.push(row);
  }
  flush();
  return html;
}

// ---------- Render ----------

async function renderPdf(
  page: Page,
  html: string,
  outPath: string,
  opts: { landscape: boolean; sectionLabel: string; mode: "editorial" | "deck" }
) {
  await page.setContent(html, { waitUntil: "networkidle" });
  await page.emulateMedia({ media: "print" });
  // Wait for fonts
  await page.evaluate(() => (document as any).fonts?.ready);

  if (opts.mode === "deck") {
    // Presentation decks: in-document footers + page numbers, full-bleed slides.
    // Disable Chrome's printer footer and use 0 margins so @page { margin: 0 } wins.
    await page.pdf({
      path: outPath,
      format: "Letter",
      landscape: opts.landscape,
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
      displayHeaderFooter: false,
    });
    return;
  }

  // Editorial mode (markdown + CSV docs): use Chrome's printer footer for page numbers.
  const footerHtml = `
    <div style="font-family: 'IBM Plex Mono', monospace; font-size: 7pt; letter-spacing: 0.15em; text-transform: uppercase; color: oklch(0.42 0.01 260); width: 100%; padding: 0 0.65in 0.18in 0.65in; display: flex; justify-content: space-between; align-items: baseline;">
      <span>Aspire Sports — ${escape(opts.sectionLabel)}</span>
      <span><span class="pageNumber"></span> &nbsp;/&nbsp; <span class="totalPages"></span></span>
    </div>
  `;

  await page.pdf({
    path: outPath,
    format: "Letter",
    landscape: opts.landscape,
    printBackground: true,
    preferCSSPageSize: true,
    margin: opts.landscape
      ? { top: "0.55in", right: "0.65in", bottom: "0.7in", left: "0.65in" }
      : { top: "0.85in", right: "0.75in", bottom: "0.95in", left: "0.75in" },
    displayHeaderFooter: true,
    headerTemplate: `<div></div>`,
    footerTemplate: footerHtml,
  });
}

async function processStrategyDir(page: Page) {
  const entries = await readdir(STRATEGY_DIR);
  const files = entries
    .filter((f) => f.endsWith(".md") || f.endsWith(".csv"))
    .map((f) => join(STRATEGY_DIR, f));

  for (const file of files) {
    const name = basename(file, extname(file));
    const out = resolve(OUT_DIR, `${name}.pdf`);
    const fname = basename(file);
    process.stdout.write(`→ ${fname} ... `);

    const raw = await readFile(file, "utf8");
    let html: string;
    let landscape = false;
    let sectionLabel = name.replace(/-2026-04$/, "").replace(/-/g, " ");

    if (file.endsWith(".csv")) {
      const body = csvToHtmlTables(raw);
      html = buildLandscapeHtml("P&L Model", body, fname);
      landscape = true;
      sectionLabel = "P&L Model";
    } else {
      // Skip the prose facility-owner-proposal — it's superseded by the deck
      if (name.includes("facility-owner-proposal")) {
        process.stdout.write(`skipped (deck supersedes)\n`);
        continue;
      }
      const body = applyTableNumericClasses(await marked.parse(raw));
      const title = (raw.match(/^#\s+(.+)$/m)?.[1] ?? name).trim();
      html = buildEditorialHtml(title, body, fname);
      landscape = false;
      // Pretty section label from filename
      sectionLabel = title.split("—")[0]?.trim() ?? title;
    }

    await renderPdf(page, html, out, { landscape, sectionLabel, mode: "editorial" });
    process.stdout.write(`done\n`);
  }
}

async function processPresentationsDir(page: Page) {
  let entries: string[];
  try {
    entries = await readdir(PRESENTATIONS_DIR);
  } catch {
    return;
  }
  const files = entries.filter((f) => f.endsWith(".html")).map((f) => join(PRESENTATIONS_DIR, f));

  for (const file of files) {
    const name = basename(file, ".html");
    const out = resolve(OUT_DIR, `${name}.pdf`);
    const fname = basename(file);
    process.stdout.write(`→ ${fname} ... `);

    const html = await readFile(file, "utf8");
    await renderPdf(page, html, out, {
      landscape: true,
      sectionLabel: name.replace(/-/g, " "),
      mode: "deck",
    });

    process.stdout.write(`done\n`);
  }
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  console.log(`Aspire Sports — Strategy renderer`);
  console.log(`Sources: ${STRATEGY_DIR}`);
  console.log(`         ${PRESENTATIONS_DIR}`);
  console.log(`Output:  ${OUT_DIR}\n`);

  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 1600 } });
  const page = await context.newPage();

  await processStrategyDir(page);
  await processPresentationsDir(page);

  await browser.close();
  console.log(`\n✓ All PDFs rendered.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
