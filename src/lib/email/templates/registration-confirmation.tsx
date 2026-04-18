import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";

interface RegistrationConfirmationEmailProps {
  parentName: string;
  childName: string;
  programName: string;
  seasonName: string;
  startDate: string;
  endDate: string;
  scheduleNotes?: string;
  locationName: string;
  locationAddress?: string;
  amountDue: string;
  paymentStatus: string;
  registrationStatus: string;
  dashboardUrl: string;
  hasLinkedTelegram?: boolean;
}

export function RegistrationConfirmationEmail({
  parentName,
  childName,
  programName,
  seasonName,
  startDate,
  endDate,
  scheduleNotes,
  locationName,
  locationAddress,
  amountDue,
  paymentStatus,
  registrationStatus,
  dashboardUrl,
  hasLinkedTelegram = false,
}: RegistrationConfirmationEmailProps) {
  const previewText = `Registration confirmed for ${childName} in ${programName}`;
  const isWaitlisted = registrationStatus === "waitlisted";
  const isPendingPayment = paymentStatus === "unpaid";

  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={main}>
        <Container style={container}>
          {/* Header */}
          <Section style={header}>
            <Heading style={logo}>Aspire Sports</Heading>
          </Section>

          {/* Main Content */}
          <Section style={content}>
            <Heading style={heading}>
              {isWaitlisted ? "You're on the Waitlist!" : "Registration Confirmed!"}
            </Heading>

            <Text style={paragraph}>Hi {parentName},</Text>

            {isWaitlisted ? (
              <Text style={paragraph}>
                <strong>{childName}</strong> has been added to the waitlist for{" "}
                <strong>{programName} - {seasonName}</strong>. We'll notify you as soon as a spot opens up.
              </Text>
            ) : (
              <Text style={paragraph}>
                Great news! <strong>{childName}</strong> has been successfully registered for{" "}
                <strong>{programName} - {seasonName}</strong>.
              </Text>
            )}

            {/* Registration Details */}
            <Section style={detailsBox}>
              <Heading as="h3" style={detailsHeading}>Registration Details</Heading>

              <Text style={detailRow}>
                <strong>Player:</strong> {childName}
              </Text>
              <Text style={detailRow}>
                <strong>Program:</strong> {programName}
              </Text>
              <Text style={detailRow}>
                <strong>Season:</strong> {seasonName}
              </Text>
              <Text style={detailRow}>
                <strong>Dates:</strong> {startDate} - {endDate}
              </Text>
              {scheduleNotes && (
                <Text style={detailRow}>
                  <strong>Schedule:</strong> {scheduleNotes}
                </Text>
              )}
              <Text style={detailRow}>
                <strong>Location:</strong> {locationName}
                {locationAddress && <><br />{locationAddress}</>}
              </Text>
            </Section>

            {/* Payment Info */}
            {!isWaitlisted && (
              <Section style={paymentBox}>
                <Heading as="h3" style={detailsHeading}>Payment Information</Heading>
                <Text style={detailRow}>
                  <strong>Amount Due:</strong> {amountDue}
                </Text>
                <Text style={detailRow}>
                  <strong>Status:</strong>{" "}
                  <span style={isPendingPayment ? statusPending : statusPaid}>
                    {isPendingPayment ? "Payment Required" : "Paid"}
                  </span>
                </Text>
                {isPendingPayment && (
                  <Text style={paragraph}>
                    Please complete your payment to secure your spot.
                  </Text>
                )}
              </Section>
            )}

            {/* CTA Button */}
            <Section style={buttonContainer}>
              <Link href={dashboardUrl} style={button}>
                {isPendingPayment ? "Complete Payment" : "View Dashboard"}
              </Link>
            </Section>

            {/* Next Steps */}
            <Section>
              <Heading as="h3" style={subheading}>What's Next?</Heading>
              <Text style={paragraph}>
                {isWaitlisted ? (
                  <>
                    We'll email you immediately when a spot becomes available.
                    You'll have 48 hours to complete registration before we move to the next person on the waitlist.
                  </>
                ) : isPendingPayment ? (
                  <>
                    Complete your payment to secure {childName}'s spot.
                    Once paid, you'll receive team assignments and schedule updates as they become available.
                  </>
                ) : (
                  <>
                    You're all set! We'll send you team assignments and schedule updates
                    as they become available. Check your dashboard for the latest information.
                  </>
                )}
              </Text>
            </Section>
          </Section>

          {/* Telegram CTA — shown only when the parent hasn't linked Telegram yet */}
          {!hasLinkedTelegram && (
            <Section style={telegramCta}>
              <Text style={telegramCtaHeading}>Prefer quick updates?</Text>
              <Text style={telegramCtaBody}>
                Connect Telegram to get real-time reminders and schedule changes from your team.
              </Text>
              <Link href={`${dashboardUrl}?connect=telegram`} style={telegramCtaLink}>
                Connect Telegram →
              </Link>
            </Section>
          )}

          <Hr style={hr} />

          {/* Footer */}
          <Section style={footer}>
            <Text style={footerText}>
              Aspire Sports - Building character through athletics
            </Text>
            <Text style={footerText}>
              Questions? Reply to this email or contact us at support@aspiresports.com
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

// Styles
const main = {
  backgroundColor: "#f6f9fc",
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Ubuntu, sans-serif',
};

const container = {
  backgroundColor: "#ffffff",
  margin: "0 auto",
  padding: "20px 0 48px",
  marginBottom: "64px",
  maxWidth: "600px",
};

const header = {
  backgroundColor: "#0a0a0f",
  padding: "24px",
  textAlign: "center" as const,
};

const logo = {
  color: "#ffffff",
  fontSize: "24px",
  fontWeight: "bold",
  margin: "0",
};

const content = {
  padding: "24px 32px",
};

const heading = {
  color: "#1a1a1a",
  fontSize: "28px",
  fontWeight: "bold",
  margin: "0 0 24px",
};

const subheading = {
  color: "#1a1a1a",
  fontSize: "18px",
  fontWeight: "600",
  margin: "24px 0 12px",
};

const paragraph = {
  color: "#525f7f",
  fontSize: "16px",
  lineHeight: "24px",
  margin: "0 0 16px",
};

const detailsBox = {
  backgroundColor: "#f8fafc",
  borderRadius: "8px",
  padding: "20px",
  margin: "24px 0",
};

const paymentBox = {
  backgroundColor: "#fef9c3",
  borderRadius: "8px",
  padding: "20px",
  margin: "24px 0",
};

const detailsHeading = {
  color: "#1a1a1a",
  fontSize: "16px",
  fontWeight: "600",
  margin: "0 0 16px",
};

const detailRow = {
  color: "#525f7f",
  fontSize: "14px",
  lineHeight: "20px",
  margin: "0 0 8px",
};

const statusPending = {
  color: "#d97706",
  fontWeight: "600",
};

const statusPaid = {
  color: "#059669",
  fontWeight: "600",
};

const buttonContainer = {
  textAlign: "center" as const,
  margin: "32px 0",
};

const button = {
  backgroundColor: "#cc442c",
  borderRadius: "8px",
  color: "#ffffff",
  display: "inline-block",
  fontSize: "16px",
  fontWeight: "600",
  padding: "12px 32px",
  textDecoration: "none",
};

const hr = {
  borderColor: "#e6ebf1",
  margin: "32px 0",
};

const footer = {
  padding: "0 32px",
};

const footerText = {
  color: "#8898aa",
  fontSize: "12px",
  lineHeight: "16px",
  textAlign: "center" as const,
  margin: "0 0 8px",
};

const telegramCta = {
  margin: "24px 32px",
  padding: "16px",
  backgroundColor: "#f0f9ff",
  borderRadius: "8px",
};

const telegramCtaHeading = {
  fontSize: "14px",
  margin: "0",
  fontWeight: 600,
  color: "#1a1a1a",
};

const telegramCtaBody = {
  fontSize: "13px",
  margin: "4px 0 8px",
  color: "#525f7f",
};

const telegramCtaLink = {
  fontSize: "13px",
  color: "#2563eb",
};

export default RegistrationConfirmationEmail;
