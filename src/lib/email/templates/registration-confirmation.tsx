import { Link, Section, Text } from "@react-email/components";
import {
  Button,
  Content,
  Detail,
  DetailPanel,
  EmailLayout,
  H1,
  H2,
  P,
  StatusPill,
  fonts,
  tokens,
} from "@/lib/email/components/email-layout";
import { StatusBanner } from "@/lib/email/components/status-banner";

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
  paymentUrl?: string;
  waitlistClaimHours?: number;
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
  paymentUrl,
  waitlistClaimHours,
}: RegistrationConfirmationEmailProps) {
  const isWaitlisted = registrationStatus === "waitlisted";
  const isPendingPayment = paymentStatus === "unpaid";
  const isDepositPaid = paymentStatus === "deposit_paid";
  const resolvedPaymentUrl = paymentUrl ?? dashboardUrl;
  const resolvedClaimHours = waitlistClaimHours ?? 48;

  const preview = isWaitlisted
    ? `${childName} is on the waitlist for ${programName}`
    : isPendingPayment
      ? `Almost there — complete payment to secure ${childName}'s spot`
      : `${childName} is confirmed for ${programName}`;

  const bannerMood = isWaitlisted || isPendingPayment ? "warning" : "success";
  const bannerText = isWaitlisted
    ? "On the waitlist"
    : isPendingPayment
      ? "Spot held — payment required"
      : "Spot confirmed";

  const headline = isWaitlisted
    ? `${childName}'s on the waitlist.`
    : isPendingPayment
      ? "Almost there — one step left."
      : `${childName}'s in for ${programName}.`;

  return (
    <EmailLayout preview={preview}>
      <StatusBanner mood={bannerMood}>{bannerText}</StatusBanner>
      <Content>
        <H1>{headline}</H1>

        <P>Hi {parentName},</P>

        {isWaitlisted ? (
          <P>
            <strong>{childName}</strong> has been added to the waitlist for{" "}
            <strong>
              {programName} — {seasonName}
            </strong>
            . We'll be in touch the moment a spot opens up.
          </P>
        ) : isPendingPayment ? (
          <P>
            <strong>{childName}</strong>'s spot in{" "}
            <strong>
              {programName} — {seasonName}
            </strong>{" "}
            is being held. Complete your payment to confirm it.
          </P>
        ) : isDepositPaid ? (
          <P>
            <strong>{childName}</strong>'s spot in{" "}
            <strong>
              {programName} — {seasonName}
            </strong>{" "}
            is confirmed. Your deposit is paid — the remaining balance will be
            due before the season starts.
          </P>
        ) : (
          <P>
            <strong>{childName}</strong> is officially in for{" "}
            <strong>
              {programName} — {seasonName}
            </strong>
            . Here's what's on the schedule.
          </P>
        )}

        <DetailPanel>
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
          {!isWaitlisted && (
            <>
              <Detail label="Amount">{amountDue}</Detail>
              <Detail label="Status">
                <StatusPill
                  variant={isPendingPayment ? "pending" : "paid"}
                >
                  {isPendingPayment
                    ? "Payment required"
                    : isDepositPaid
                      ? "Deposit paid"
                      : "Paid in full"}
                </StatusPill>
              </Detail>
            </>
          )}
        </DetailPanel>

        {isPendingPayment ? (
          <Button href={resolvedPaymentUrl}>Complete payment →</Button>
        ) : (
          <Button href={dashboardUrl}>View your dashboard →</Button>
        )}

        <H2>What's next</H2>
        <P>
          {isWaitlisted ? (
            <>
              We'll email you immediately when a spot becomes available. You'll
              have {resolvedClaimHours} hours to complete registration before we
              move to the next player on the waitlist.
            </>
          ) : isPendingPayment ? (
            <>
              Complete your payment to secure {childName}'s spot. Once paid,
              you'll receive team assignments and schedule updates as they're
              posted.
            </>
          ) : isDepositPaid ? (
            <>
              Your deposit is in — {childName}'s spot is secured. We'll send
              team assignments and schedule updates as they're posted. The
              remaining balance will be collected before the season starts.
            </>
          ) : (
            <>
              You're all set. We'll send team assignments and schedule updates
              as they're posted. Your dashboard always has the latest.
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
              Quick Updates
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
              Connect Telegram to get real-time reminders and schedule changes
              from your team.
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
      </Content>
    </EmailLayout>
  );
}

export default RegistrationConfirmationEmail;
