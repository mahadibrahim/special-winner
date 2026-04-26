import { Link, Section, Text } from "@react-email/components";
import {
  Button,
  Detail,
  EmailLayout,
  H1,
  H2,
  InfoCard,
  P,
  StatusPill,
  fonts,
  tokens,
} from "@/lib/email/components/email-layout";

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
  const isWaitlisted = registrationStatus === "waitlisted";
  const isPendingPayment = paymentStatus === "unpaid";

  const preview = isWaitlisted
    ? `${childName} is on the waitlist for ${programName}`
    : `${childName} is confirmed for ${programName}`;

  const sectionLabel = isWaitlisted ? "Waitlist" : "Registration";
  const sectionMeta = `${seasonName.toUpperCase()}`;

  return (
    <EmailLayout
      preview={preview}
      sectionLabel={sectionLabel}
      sectionMeta={sectionMeta}
    >
      <H1>
        {isWaitlisted ? (
          <>
            You're on
            <br />
            <em style={{ color: tokens.primary }}>the waitlist.</em>
          </>
        ) : (
          <>
            Registration
            <br />
            <em style={{ color: tokens.primary }}>confirmed.</em>
          </>
        )}
      </H1>

      <P>Hi {parentName},</P>

      {isWaitlisted ? (
        <P>
          <strong>{childName}</strong> has been added to the waitlist for{" "}
          <strong>
            {programName} — {seasonName}
          </strong>
          . We'll be in touch the moment a spot opens up.
        </P>
      ) : (
        <P>
          Great news — <strong>{childName}</strong> is officially in for{" "}
          <strong>
            {programName} — {seasonName}
          </strong>
          . Here's what's on the schedule.
        </P>
      )}

      <InfoCard label="Registration Details">
        <Detail label="Player">{childName}</Detail>
        <Detail label="Program">{programName}</Detail>
        <Detail label="Season">{seasonName}</Detail>
        <Detail label="Dates">
          {startDate} – {endDate}
        </Detail>
        {scheduleNotes && <Detail label="Schedule">{scheduleNotes}</Detail>}
        <Detail label="Location">
          {locationName}
          {locationAddress && (
            <>
              <br />
              <span style={{ color: tokens.inkMuted, fontSize: "13px" }}>
                {locationAddress}
              </span>
            </>
          )}
        </Detail>
      </InfoCard>

      {!isWaitlisted && (
        <InfoCard
          label="Payment"
          variant={isPendingPayment ? "warning" : "default"}
        >
          <Detail label="Amount Due">{amountDue}</Detail>
          <Detail label="Status">
            <StatusPill variant={isPendingPayment ? "pending" : "paid"}>
              {isPendingPayment ? "Payment Required" : "Paid"}
            </StatusPill>
          </Detail>
          {isPendingPayment && (
            <Text
              style={{
                fontFamily: fonts.body,
                fontSize: "13px",
                color: tokens.inkMuted,
                lineHeight: "1.5",
                margin: "12px 0 0",
              }}
            >
              Please complete your payment to secure your spot.
            </Text>
          )}
        </InfoCard>
      )}

      <Button href={dashboardUrl}>
        {isPendingPayment ? "Complete Payment" : "View Dashboard"}
      </Button>

      <H2>What's next</H2>
      <P>
        {isWaitlisted ? (
          <>
            We'll email you immediately when a spot becomes available. You'll
            have 48 hours to complete registration before we move to the next
            player on the waitlist.
          </>
        ) : isPendingPayment ? (
          <>
            Complete your payment to secure {childName}'s spot. Once paid, you'll
            receive team assignments and schedule updates as they're posted.
          </>
        ) : (
          <>
            You're all set. We'll send team assignments and schedule updates as
            they're posted. Your dashboard always has the latest.
          </>
        )}
      </P>

      {!hasLinkedTelegram && (
        <Section
          style={{
            backgroundColor: tokens.cream2,
            border: `1px solid ${tokens.border}`,
            borderRadius: "4px",
            padding: "20px 24px",
            margin: "32px 0 0",
          }}
        >
          <Text
            style={{
              fontFamily: fonts.body,
              fontSize: "11px",
              fontWeight: 600,
              letterSpacing: "0.15em",
              textTransform: "uppercase",
              color: tokens.inkMuted,
              margin: "0 0 8px",
            }}
          >
            § Quick Updates
          </Text>
          <Text
            style={{
              fontFamily: fonts.body,
              fontSize: "14px",
              lineHeight: "1.5",
              color: tokens.ink2,
              margin: "0 0 12px",
            }}
          >
            Connect Telegram to get real-time reminders and schedule changes from
            your team.
          </Text>
          <Link
            href={`${dashboardUrl}?connect=telegram`}
            style={{
              fontFamily: fonts.body,
              fontSize: "13px",
              fontWeight: 500,
              color: tokens.primary,
              textDecoration: "none",
            }}
          >
            Connect Telegram →
          </Link>
        </Section>
      )}
    </EmailLayout>
  );
}

export default RegistrationConfirmationEmail;
