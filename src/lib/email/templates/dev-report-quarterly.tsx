import {
  Button,
  Content,
  Detail,
  EmailLayout,
  H1,
  H2,
  InfoCard,
  P,
  PMuted,
} from "@/lib/email/components/email-layout";
import type { BrandId } from "@/lib/branding/themes";

export interface DevReportQuarterlyDomain {
  domainName: string;
  /** Quarter rollup average — no single trend arrow (it's already an
   *  average across 3 months), so callers pass "new" and the template
   *  renders a bare level with no arrow. */
  averageLevel: number | null;
}

export interface DevReportQuarterlyAchievement {
  title: string;
  description?: string | null;
}

interface DevReportQuarterlyEmailProps {
  parentFirstName: string;
  childFirstName: string;
  /** Human label for the closed quarter, e.g. "Q3 2026". */
  quarterLabel: string;
  domains: DevReportQuarterlyDomain[];
  assessmentCount: number;
  skillCount: number;
  achievements: DevReportQuarterlyAchievement[];
  ctaUrl: string;
  appUrl?: string;
  brand?: BrandId;
}

/**
 * Quarterly FULL development report — the complete picture (per-domain
 * quarter rollup, assessment/skill counts, achievements earned) versus the
 * monthly subset (dev-report-monthly.tsx). Cloned from first-game-recap.tsx's
 * structure/brand handling. Sent by src/lib/email/send.ts's
 * sendDevReportQuarterly, fired from the monthly cron
 * (src/pages/api/cron/send-development-reports.ts) on the four months that
 * close a quarter (Jan/Apr/Jul/Oct 1st) INSTEAD of that month's monthly
 * subset — decision 4 in the plan.
 */
export function DevReportQuarterlyEmail({
  parentFirstName,
  childFirstName,
  quarterLabel,
  domains,
  assessmentCount,
  skillCount,
  achievements,
  ctaUrl,
  appUrl,
  brand,
}: DevReportQuarterlyEmailProps) {
  return (
    <EmailLayout
      preview={`${childFirstName}'s ${quarterLabel} development report`}
      appUrl={appUrl}
      brand={brand}
    >
      <Content>
        <H1>
          {childFirstName}&apos;s {quarterLabel} development report
        </H1>
        <P>Hi {parentFirstName},</P>
        <P>
          Here&apos;s the full picture of {childFirstName}&apos;s development
          this quarter — {assessmentCount} coach assessment
          {assessmentCount === 1 ? "" : "s"} across {skillCount} skill
          {skillCount === 1 ? "" : "s"}.
        </P>

        <H2>By development area</H2>
        {domains.length > 0 ? (
          domains.map((d) => (
            <Detail key={d.domainName} label={d.domainName}>
              {d.averageLevel != null ? `Level ${d.averageLevel.toFixed(1)}` : "Not yet assessed"}
            </Detail>
          ))
        ) : (
          <P>No coach assessments recorded this quarter.</P>
        )}

        {achievements.length > 0 && (
          <InfoCard variant="primary" label="Achievements earned this quarter">
            {achievements.map((a, i) => (
              <P key={`${a.title}-${i}`}>
                🏅 <strong>{a.title}</strong>
                {a.description ? ` — ${a.description}` : ""}
              </P>
            ))}
          </InfoCard>
        )}

        <Button href={ctaUrl}>
          View {childFirstName}&apos;s full development page →
        </Button>

        <PMuted>
          Quarterly reports cover the complete picture. Look for a shorter
          monthly update in between quarters.
        </PMuted>
      </Content>
    </EmailLayout>
  );
}

export default DevReportQuarterlyEmail;
