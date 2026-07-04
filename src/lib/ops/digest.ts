import { and, eq, gte, lt } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { opsPings, organizations, type OrganizationSettings } from "@/lib/db/schema";
import { formatBrandTag, OPS_PING_KIND_LABELS } from "./format";
import { isOpsWhatsAppReady, postToOpsGroup } from "./whatsapp";
import { sendOpsPingFallbackEmail } from "@/lib/email/send";
import type { BrandId } from "@/lib/branding/themes";

export type DigestCounts = {
  signupsByBrand: Record<string, number>;
  moneyByKind: Record<string, { count: number; totalCents: number }>;
  suppressed: number;
};

export function composeDigestMessage(counts: DigestCounts, dateLabel: string): string {
  const lines: string[] = [`📊 Daily ops digest — ${dateLabel}`];

  const signupTotal = Object.values(counts.signupsByBrand).reduce((a, b) => a + b, 0);
  if (signupTotal > 0) {
    const parts = Object.entries(counts.signupsByBrand)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([brand, n]) => `${formatBrandTag(brand).slice(1, -1)} ${n}`);
    lines.push(`👤 New users: ${signupTotal} (${parts.join(", ")})`);
  }

  for (const [kind, { count, totalCents }] of Object.entries(counts.moneyByKind).sort(
    ([a], [b]) => a.localeCompare(b),
  )) {
    const label = OPS_PING_KIND_LABELS[kind as keyof typeof OPS_PING_KIND_LABELS] ?? kind;
    // Non-money kinds (job_application) carry no trailing amount in their
    // messages — render a plain count instead of a misleading "$0.00".
    if (kind === "job_application") {
      lines.push(`📝 ${label}s: ${count}`);
    } else {
      lines.push(`💰 ${label}: ${count} — $${(totalCents / 100).toFixed(2)}`);
    }
  }

  if (counts.suppressed > 0) {
    lines.push(`…plus ${counts.suppressed} pings not delivered instantly yesterday.`);
  }

  if (lines.length === 1) lines.push("Quiet day — no new activity.");
  return lines.join("\n");
}

/**
 * Pick the digest's email-fallback brand from per-brand activity row counts
 * (signups + money rows): the brand with the most activity wins; ties and
 * empty days default to "aspire". Only brands with a real email identity
 * (BrandId) can win — anything else falls back to "aspire".
 */
export function pickDigestBrand(rowsByBrand: Record<string, number>): BrandId {
  let winner: string | null = null;
  let max = 0;
  let tied = false;
  for (const [brand, n] of Object.entries(rowsByBrand)) {
    if (n > max) {
      winner = brand;
      max = n;
      tied = false;
    } else if (n === max && n > 0 && brand !== winner) {
      tied = true;
    }
  }
  if (tied || winner === null) return "aspire";
  return winner === "soccerone" ? "soccerone" : "aspire";
}

/**
 * Yesterday's counts per org (orgs with opsPings.enabled), one message each.
 * Money totals are parsed from the stored message's trailing "$X.YZ" — the
 * rows deliberately don't duplicate amount columns; the digest is a recap,
 * not an accounting report.
 */
export async function sendOpsDigest(now: Date = new Date()): Promise<{ orgs: number; sent: number }> {
  const db = getDb();
  // Anchor the window's end to 12:00 UTC (8am ET) on `now`'s UTC calendar
  // date — the scheduler firing a few minutes past noon still recaps the
  // same 24h slice, so jitter self-corrects instead of shifting the window.
  const dayEnd = new Date(now); dayEnd.setUTCHours(12, 0, 0, 0);
  const dayStart = new Date(dayEnd.getTime() - 24 * 60 * 60 * 1000);

  const orgs = await db
    .select({ id: organizations.id, settings: organizations.settings })
    .from(organizations);

  let sent = 0;
  let considered = 0;
  for (const org of orgs) {
    const settings = (org.settings ?? {}) as OrganizationSettings;
    if (settings.opsPings?.enabled !== true) continue;
    considered += 1;

    // Last-resort isolator: one org's failure must never abort the loop.
    try {
      const rows = await db
        .select()
        .from(opsPings)
        .where(
          and(
            eq(opsPings.organizationId, org.id),
            gte(opsPings.createdAt, dayStart),
            lt(opsPings.createdAt, dayEnd),
          ),
        );

      const counts: DigestCounts = { signupsByBrand: {}, moneyByKind: {}, suppressed: 0 };
      const rowsByBrand: Record<string, number> = {};
      for (const row of rows) {
        if (row.kind === "user_signup") {
          // Signups are digest-only by design (never sent through the
          // instant rate-cap ladder), so their stored channel is always
          // "suppressed" — that's not a rate-cap collapse and must not
          // inflate the suppressed count below.
          counts.signupsByBrand[row.brand] = (counts.signupsByBrand[row.brand] ?? 0) + 1;
          rowsByBrand[row.brand] = (rowsByBrand[row.brand] ?? 0) + 1;
        } else if (row.kind !== "test") {
          const amountMatch = row.message.match(/\$([0-9]+\.[0-9]{2})$/);
          const cents = amountMatch ? Math.round(parseFloat(amountMatch[1]) * 100) : 0;
          const bucket = counts.moneyByKind[row.kind] ?? { count: 0, totalCents: 0 };
          bucket.count += 1;
          bucket.totalCents += cents;
          counts.moneyByKind[row.kind] = bucket;
          rowsByBrand[row.brand] = (rowsByBrand[row.brand] ?? 0) + 1;
          if (row.channel === "suppressed") counts.suppressed += 1;
        }
      }

      const dateLabel = dayStart.toLocaleDateString("en-US", {
        weekday: "short", month: "short", day: "numeric", timeZone: "America/New_York",
      });
      const message = composeDigestMessage(counts, dateLabel);

      // WhatsApp first; a throw here must fall through to the email
      // fallback (postToOpsGroup throws on failure by contract), mirroring
      // deliver() in ping.ts.
      if (isOpsWhatsAppReady(settings)) {
        try {
          await postToOpsGroup(settings, message);
          sent += 1;
          continue;
        } catch (err) {
          console.error(
            `[ops] digest WhatsApp send failed for org ${org.id}, trying email fallback:`,
            err,
          );
        }
      }
      const fallbackTo =
        settings.feedback?.detractorAlertEmail ?? settings.contact?.supportEmail;
      if (fallbackTo) {
        const res = await sendOpsPingFallbackEmail({
          to: fallbackTo,
          brand: pickDigestBrand(rowsByBrand),
          message,
        });
        if (res.success) sent += 1;
      }
    } catch (err) {
      console.error(`[ops] digest send failed for org ${org.id}:`, err);
    }
  }
  return { orgs: considered, sent };
}
