// Generates the SoccerOne email wordmark PNG from the brand kit's Anton face.
//
//   node scripts/gen-soccerone-wordmark.mjs
//
// Why a PNG and not live text: Gmail/Outlook/most webmail strip @font-face and
// <link> web fonts, so a text wordmark falls back to a generic sans and loses
// the Anton lockup. An image renders identically in every client — the same
// reason the Aspire email uses /images/logo-black.png. Output is transparent
// so it composites on the dark email header (#0e0e10).
//
// Faithful to brand/data/soccerone-kit/wordmark.html: Anton, white SOCCER +
// lime ONE, tight letter-spacing (-.5px at 56px ≈ -0.009em, scale-independent).
//
// Re-run only when the wordmark spec changes; the output is committed.

import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ANTON_WOFF2 =
  "/Volumes/MahadData/Aspire-Sports/aspire-sports-ops/brand/data/soccerone-kit/fonts/anton-400.woff2";
const OUT = resolve(
  import.meta.dirname,
  "../public/images/soccerone-wordmark.png",
);

const LIME = "#a3e635";
const FONT_PX = 96; // large render; downscaled in the email for crispness
const DSF = 3;

const antonB64 = readFileSync(ANTON_WOFF2).toString("base64");

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  @font-face{font-family:'Anton';font-style:normal;font-weight:400;
    src:url(data:font/woff2;base64,${antonB64}) format('woff2');}
  html,body{margin:0;padding:0;background:transparent;}
  /* inline-block + padding so glyph overshoots aren't clipped at the bbox */
  .wm{display:inline-block;font-family:'Anton',sans-serif;font-weight:400;
    font-size:${FONT_PX}px;line-height:1;letter-spacing:-0.009em;
    text-transform:uppercase;color:#ffffff;padding:8px 10px;white-space:nowrap;}
  .one{color:${LIME};}
</style></head><body>
  <span class="wm" id="wm">SOCCER<span class="one">ONE</span></span>
  <script>
    (async()=>{ await document.fonts.load("400 ${FONT_PX}px Anton");
      await document.fonts.ready; window.__ready=true; })();
  </script>
</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: DSF });
await page.setContent(html, { waitUntil: "networkidle" });
await page.waitForFunction(() => window.__ready === true, { timeout: 10000 });
const el = page.locator("#wm");
await el.screenshot({ path: OUT, omitBackground: true });
const box = await el.boundingBox();
await browser.close();

console.log(`wrote ${OUT}`);
console.log(`element box (css px): ${Math.round(box.width)} x ${Math.round(box.height)}`);
console.log(`png pixels (≈ box * dsf ${DSF}): ${Math.round(box.width * DSF)} x ${Math.round(box.height * DSF)}`);
// Suggest email display dims for a ~30px tall mark:
const targetH = 30;
console.log(`suggested email <img>: height=${targetH} width=${Math.round((box.width / box.height) * targetH)}`);
