import { and, eq, gte, lt } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { opsPings, organizations, type OrganizationSettings } from "@/lib/db/schema";
import { formatBrandTag } from "./format";
import { isOpsWhatsAppReady, postToOpsGroup } from "./whatsapp";
import { sendOpsPingFallbackEmail } from "@/lib/email/send";

export type DigestCounts = {
  signupsByBrand: Record<string, number>;
  moneyByKind: Record<string, { count: number; totalCents: number }>;
  suppressed: number;
};

const KIND_LABELS: Record<string, string> = {
  registration_paid: "Registration",
  dropin_booked: "Drop-in",
  rental_confirmed: "Rental",
  membership_started: "Membership",
  payment_succeeded: "Payment",
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

  for (const [kind, { count, totalCents }] of Object.entries(counts.moneyByKind).sort()) {
    lines.push(
      `💰 ${KIND_LABELS[kind] ?? kind}: ${count} — $${(totalCents / 100).toFixed(2)}`,
    );
  }

  if (counts.suppressed > 0) {
    lines.push(`…plus ${counts.suppressed} pings collapsed by rate cap yesterday.`);
  }

  if (lines.length === 1) lines.push("Quiet day — no new activity.");
  return lines.join("\n");
}

/**
 * Yesterday's counts per org (orgs with opsPings.enabled), one message each.
 * Money totals are parsed from the stored message's trailing "$X.YZ" — the
 * rows deliberately don't duplicate amount columns; the digest is a recap,
 * not an accounting report.
 */
export async function sendOpsDigest(now: Date = new Date()): Promise<{ orgs: number; sent: number }> {
  const db = getDb();
  const dayEnd = new Date(now); dayEnd.setUTCHours(12, 0, 0, 0); // 8am ET boundary
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
      for (const row of rows) {
        if (row.kind === "user_signup") {
          // Signups are digest-only by design (never sent through the
          // instant rate-cap ladder), so their stored channel is always
          // "suppressed" — that's not a rate-cap collapse and must not
          // inflate the suppressed count below.
          counts.signupsByBrand[row.brand] = (counts.signupsByBrand[row.brand] ?? 0) + 1;
        } else if (row.kind !== "test") {
          const amountMatch = row.message.match(/\$([0-9]+\.[0-9]{2})$/);
          const cents = amountMatch ? Math.round(parseFloat(amountMatch[1]) * 100) : 0;
          const bucket = counts.moneyByKind[row.kind] ?? { count: 0, totalCents: 0 };
          bucket.count += 1;
          bucket.totalCents += cents;
          counts.moneyByKind[row.kind] = bucket;
          if (row.channel === "suppressed") counts.suppressed += 1;
        }
      }

      const dateLabel = dayStart.toLocaleDateString("en-US", {
        weekday: "short", month: "short", day: "numeric", timeZone: "America/New_York",
      });
      const message = composeDigestMessage(counts, dateLabel);

      if (isOpsWhatsAppReady(settings)) {
        await postToOpsGroup(settings, message);
        sent += 1;
        continue;
      }
      const fallbackTo =
        settings.feedback?.detractorAlertEmail ?? settings.contact?.supportEmail;
      if (fallbackTo) {
        const res = await sendOpsPingFallbackEmail({ to: fallbackTo, brand: "aspire", message });
        if (res.success) sent += 1;
      }
    } catch (err) {
      console.error(`[ops] digest send failed for org ${org.id}:`, err);
    }
  }
  return { orgs: considered, sent };
}
