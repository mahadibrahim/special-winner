import { Hr, Section, Text } from "@react-email/components";
import {
  Button,
  Content,
  EmailLayout,
  H1,
  P,
  PMuted,
  tokens,
  fonts,
} from "@/lib/email/components/email-layout";

interface AnnouncementEmailProps {
  recipientName: string;
  announcementTitle: string;
  announcementContent: string;
  authorName: string;
  publishedAt: string;
  organizationName: string;
  dashboardUrl: string;
}

export function AnnouncementEmail({
  recipientName,
  announcementTitle,
  announcementContent,
  authorName,
  publishedAt,
  organizationName,
  dashboardUrl,
}: AnnouncementEmailProps) {
  return (
    <EmailLayout preview={`New announcement: ${announcementTitle}`}>
      <Content>
        <H1>{announcementTitle}</H1>
        <PMuted>
          From {authorName} · {organizationName || "Aspire Sports"}
        </PMuted>

        <Hr style={{ borderColor: tokens.border, margin: "16px 0 24px" }} />

        <P>Hi {recipientName || "there"},</P>

        <Section style={quoteSectionStyle}>
          <Text style={quoteTextStyle}>{announcementContent}</Text>
        </Section>

        <Button href={dashboardUrl}>View in dashboard →</Button>

        <PMuted>
          You're receiving this because you're subscribed to announcements from{" "}
          {organizationName || "Aspire Sports"}. You can update your notification
          preferences in your dashboard settings.
        </PMuted>
      </Content>
    </EmailLayout>
  );
}

const quoteSectionStyle = {
  backgroundColor: tokens.cream2,
  borderLeft: `3px solid ${tokens.primary}`,
  padding: "16px 20px",
  margin: "20px 0",
};

const quoteTextStyle = {
  fontFamily: fonts.body,
  fontSize: "15px",
  lineHeight: "1.6",
  color: tokens.ink,
  margin: 0,
  whiteSpace: "pre-wrap" as const,
};

export default AnnouncementEmail;
