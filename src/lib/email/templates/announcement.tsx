import { Hr, Section, Text } from "@react-email/components";
import {
  Button,
  Content,
  EmailLayout,
  H1,
  P,
  PMuted,
} from "@/lib/email/components/email-layout";
import { emailThemeFor } from "@/lib/email/components/email-theme";
import type { BrandId } from "@/lib/branding/themes";

interface AnnouncementEmailProps {
  recipientName: string;
  announcementTitle: string;
  announcementContent: string;
  authorName: string;
  publishedAt: string;
  organizationName: string;
  dashboardUrl: string;
  brand?: BrandId;
}

export function AnnouncementEmail({
  recipientName,
  announcementTitle,
  announcementContent,
  authorName,
  publishedAt,
  organizationName,
  dashboardUrl,
  brand = "aspire",
}: AnnouncementEmailProps) {
  const t = emailThemeFor(brand);
  const fromName = organizationName || t.brandName;
  return (
    <EmailLayout preview={`New announcement: ${announcementTitle}`} brand={brand}>
      <Content>
        <H1>{announcementTitle}</H1>
        <PMuted>
          From {authorName} · {fromName} · {publishedAt}
        </PMuted>

        <Hr style={{ borderColor: t.tokens.border, margin: "16px 0 24px" }} />

        <P>Hi {recipientName || "there"},</P>

        <Section
          style={{
            backgroundColor: t.tokens.cream2,
            borderLeft: `3px solid ${t.tokens.primary}`,
            padding: "16px 20px",
            margin: "20px 0",
          }}
        >
          <Text
            style={{
              fontFamily: t.fonts.body,
              fontSize: "15px",
              lineHeight: "1.6",
              color: t.tokens.ink,
              margin: 0,
              whiteSpace: "pre-wrap",
            }}
          >
            {announcementContent}
          </Text>
        </Section>

        <Button href={dashboardUrl}>View in dashboard →</Button>

        <PMuted>
          You're receiving this because you're subscribed to announcements from{" "}
          {fromName}. You can update your notification preferences in your
          dashboard settings.
        </PMuted>
      </Content>
    </EmailLayout>
  );
}

export default AnnouncementEmail;
