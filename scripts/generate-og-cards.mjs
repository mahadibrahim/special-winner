// Generates the per-brand social share cards (Open Graph / iMessage / WhatsApp
// preview images) as committed static PNGs under public/og/.
//
// Deterministic, sharp-only compositing — no browser/screenshot dependency.
// Re-run only when a card design or its source photo changes:
//   node scripts/generate-og-cards.mjs
//
// Output (committed to git; prod serves them as plain static files):
//   public/og/aspire-share.jpg     1200x630
//   public/og/soccerone-share.jpg  1200x630
// JPEG (not PNG) keeps each card ~100-150KB — link scrapers (esp. WhatsApp)
// fetch small images far more reliably than a 1.5MB photo-PNG.
import sharp from "sharp";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const p = (rel) => resolve(ROOT, rel);

const W = 1200;
const H = 630;

// XML-escape user-facing copy before it goes into an SVG <text> node.
const esc = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Recolor an Adobe-exported brand SVG to a solid white knockout. */
async function whiteKnockout(svgPath, targetWidth) {
  let svg = await readFile(svgPath, "utf8");
  // Adobe exports fills as hex literals inside a <style> block (.st0{fill:#...})
  // and/or inline fill="#...". Force every fill to white for max contrast on
  // the darkened photo. (stroke is unused in these marks.)
  svg = svg
    .replace(/fill:\s*#[0-9a-fA-F]{3,6}/g, "fill:#FFFFFF")
    .replace(/fill="#[0-9a-fA-F]{3,6}"/g, 'fill="#FFFFFF"');
  return sharp(Buffer.from(svg)).resize({ width: targetWidth }).png().toBuffer();
}

/** Cover-crop a photo to exactly WxH (center gravity). */
async function coverPhoto(photoPath) {
  return sharp(p(photoPath))
    .resize(W, H, { fit: "cover", position: "attention" })
    .toBuffer();
}

/**
 * Gradient + two-line text overlay as a rasterized SVG.
 * A bottom-anchored dark gradient guarantees legibility regardless of the photo.
 */
function overlaySvg({ line1, line2, line2Color }) {
  return Buffer.from(`
<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"  stop-color="#000000" stop-opacity="0"/>
      <stop offset="55%" stop-color="#000000" stop-opacity="0.35"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0.88"/>
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="${W}" height="${H}" fill="url(#g)"/>
  <text x="72" y="548" font-family="Helvetica, Arial, sans-serif" font-size="46"
        font-weight="700" fill="#FFFFFF" letter-spacing="-0.5">${esc(line1)}</text>
  <text x="72" y="596" font-family="Helvetica, Arial, sans-serif" font-size="30"
        font-weight="400" fill="${line2Color}">${esc(line2)}</text>
</svg>`);
}

async function buildCard({ out, photo, logoBuffer, logoLeft, logoTop, text }) {
  const base = await coverPhoto(photo);
  const overlay = overlaySvg(text);
  const jpg = await sharp(base)
    .composite([
      { input: overlay, top: 0, left: 0 },
      { input: logoBuffer, top: logoTop, left: logoLeft },
    ])
    .jpeg({ quality: 85, mozjpeg: true })
    .toBuffer();
  await writeFile(p(out), jpg);
  const meta = await sharp(jpg).metadata();
  console.log(`✓ ${out}  ${meta.width}x${meta.height}  ${(jpg.length / 1024).toFixed(0)}KB`);
}

async function main() {
  await mkdir(p("public/og"), { recursive: true });

  // ── Aspire ── full-color mark goes low-contrast on the dark gradient, so
  // render it as a white knockout (standard for photo OG cards).
  const aspireLogoW = 360;
  const aspireLogo = await whiteKnockout(p("public/images/logo.svg"), aspireLogoW);
  const aspireLogoH = Math.round((aspireLogoW * 180.8) / 400);
  await buildCard({
    out: "public/og/aspire-share.jpg",
    photo: "public/images/coaching-hero.jpg",
    logoBuffer: aspireLogo,
    logoLeft: 72,
    logoTop: 500 - aspireLogoH,
    text: {
      line1: "Evidence-based youth & adult sports",
      line2: "Central Ohio",
      line2Color: "rgba(255,255,255,0.82)",
    },
  });

  // ── SoccerOne ── wordmark PNG is already a light knockout; use as-is.
  const soLogoW = 440;
  const soLogoH = Math.round((soLogoW * 336) / 1242);
  const soLogo = await sharp(p("public/images/soccerone-wordmark.png"))
    .resize({ width: soLogoW })
    .png()
    .toBuffer();
  await buildCard({
    out: "public/og/soccerone-share.jpg",
    photo: "public/media/soccerone/still-action.jpg",
    logoBuffer: soLogo,
    logoLeft: 72,
    logoTop: 500 - soLogoH,
    text: {
      line1: "Indoor soccer in Columbus",
      line2: "Leagues · Pickup · Field rentals",
      line2Color: "#a3e635", // --so-lime
    },
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
