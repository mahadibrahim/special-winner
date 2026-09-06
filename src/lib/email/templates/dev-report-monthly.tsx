import {
  Button,
  Content,
  Detail,
  EmailLayout,
  H1,
  InfoCard,
  P,
  PMuted,
} from "@/lib/email/components/email-layout";
import type { BrandId } from "@/lib/branding/themes";

export type DevReportTrend = "improving" | "stable" | "declining" | "new";

export interface DevReportMonthlyDomain {
  domainName: string;
  averageLevel: number | null;
  trend: DevReportTrend;
}

interface DevReportMonthlyEmailProps {
  parentFirstName: string;
  childFirstName: string;
  /** Human label for the closed month, e.g. "August 2026". */
  periodLabel: string;
  domains: DevReportMonthlyDomain[];
  glowCount: number;
  ctaUrl: string;
  appUrl?: string;
  brand?: BrandId;
}

function trendArrow(trend: DevReportTrend): string {
  switch (trend) {
    case "improving":
      return "↑";
    case "declining":
      return "↓";
    case "stable":
      return "→";
    default:
      return "";
  }
}

/**
 * Monthly subset development report — cloned from first-game-recap.tsx's
 * structure/brand handling. Deliberately a SUBSET (per-domain level + trend
 * for the month, glow count, one CTA) — the quarterly report
 * (dev-report-quarterly.tsx) is the full picture with counts and
 * achievements. Sent by src/lib/email/send.ts's sendDevReportMonthly, fired
 * from the monthly cron (src/pages/api/cron/send-development-reports.ts)
 * for every month that ISN'T the close of a quarter.
 */
export function DevReportMonthlyEmail({
  parentFirstName,
  childFirstName,
  periodLabel,
  domains,
  glowCount,
  ctaUrl,
  appUrl,
  brand,
}: DevReportMonthlyEmailProps) {
  return (
    <EmailLayout
      preview={`${childFirstName}'s ${periodLabel} development update`}
      appUrl={appUrl}
      brand={brand}
    >
      <Content>
        <H1>
          {childFirstName}&apos;s {periodLabel} update
        </H1>
        <P>Hi {parentFirstName},</P>
        <P>
          Here&apos;s how {childFirstName} progressed across each development
          area this month.
        </P>

        {domains.length > 0 ? (
          domains.map((d) => (
            <Detail key={d.domainName} label={d.domainName}>
              {d.averageLevel != null
                ? `Level ${d.averageLevel.toFixed(1)} ${trendArrow(d.trend)}`.trim()
                : "Not yet assessed"}
            </Detail>
          ))
        ) : (
          <P>No new coach assessments this month.</P>
        )}

        {glowCount > 0 && (
          <InfoCard variant="success" label="Coach shoutouts">
            <P>
              {glowCount} glow{glowCount === 1 ? "" : "s"} logged by{" "}
              {childFirstName}&apos;s coaches this month.
            </P>
          </InfoCard>
        )}

        <Button href={ctaUrl}>
          View {childFirstName}&apos;s full development page →
        </Button>

        <PMuted>
          This is a monthly snapshot — the full picture (every assessment,
          achievement, and note) is always on the development page.
        </PMuted>
      </Content>
    </EmailLayout>
  );
}

export default DevReportMonthlyEmail;
