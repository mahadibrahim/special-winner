import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import type { CSSProperties, ReactNode } from "react";

export const tokens = {
  cream: "#F5EFE3",
  cream2: "#EEE7D4",
  cream3: "#E5DDC4",
  paper: "#FAF7ED",
  ink: "#1B1D27",
  ink2: "#2D2F3C",
  inkMuted: "#4F5158",
  inkFaint: "#8C8C95",
  navy: "#1F2547",
  navyDeep: "#131737",
  primary: "#CC442C",
  primarySoft: "#F2DCC9",
  ochre: "#C29E58",
  ochreSoft: "#F2E5C5",
  sage: "#5A8169",
  sageSoft: "#DDE7DC",
  border: "#DBD5C5",
  borderStrong: "#C7BFA9",
} as const;

export const fonts = {
  display: '"Newsreader", Georgia, "Times New Roman", serif',
  body: '"IBM Plex Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, sans-serif',
  mono: '"IBM Plex Mono", "SF Mono", Menlo, Monaco, Consolas, monospace',
} as const;

const fontsHref =
  "https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;0,6..72,600;1,6..72,400;1,6..72,500&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400&display=swap";

interface EmailLayoutProps {
  preview: string;
  appUrl?: string;
  children: ReactNode;
}

export function EmailLayout({
  preview,
  appUrl = "https://aspiresportsohio.com",
  children,
}: EmailLayoutProps) {
  return (
    <Html>
      <Head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link href={fontsHref} rel="stylesheet" />
      </Head>
      <Preview>{preview}</Preview>
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          <div style={accentStripeStyle} />

          <Section style={logoSectionStyle}>
            <Img
              src={`${appUrl}/images/logo-black.png`}
              alt="Aspire Sports"
              width="140"
              height="34"
              style={logoImgStyle}
            />
          </Section>

          {children}

          <Hr style={ruleStyle} />

          <Section style={footerSectionStyle}>
            <Text style={footerBrandStyle}>Aspire Sports Ohio</Text>
            <Text style={footerAddressStyle}>
              3989 Presidential Pkwy &nbsp;·&nbsp; Powell, OH 43065
            </Text>
            <Text style={footerContactStyle}>
              Questions? Just reply to this email — a real person reads it.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export function Content({ children }: { children: ReactNode }) {
  return <Section style={contentSectionStyle}>{children}</Section>;
}

export function H1({ children }: { children: ReactNode }) {
  return <Text style={h1Style}>{children}</Text>;
}

export function H2({ children }: { children: ReactNode }) {
  return <Text style={h2Style}>{children}</Text>;
}

export function P({ children }: { children: ReactNode }) {
  return <Text style={pStyle}>{children}</Text>;
}

export function PMuted({ children }: { children: ReactNode }) {
  return <Text style={{ ...pStyle, color: tokens.inkMuted }}>{children}</Text>;
}

export function SectionLabel({
  children,
  style,
}: {
  children: ReactNode;
  style?: CSSProperties;
}) {
  return <Text style={{ ...sectionLabelStyle, ...style }}>{children}</Text>;
}

export function InfoCard({
  label,
  children,
  variant = "default",
}: {
  label?: string;
  children: ReactNode;
  variant?: "default" | "warning" | "success" | "primary";
}) {
  const palette =
    variant === "warning"
      ? { bg: tokens.ochreSoft, border: tokens.ochre }
      : variant === "success"
        ? { bg: tokens.sageSoft, border: tokens.sage }
        : variant === "primary"
          ? { bg: tokens.primarySoft, border: tokens.primary }
          : { bg: tokens.cream2, border: tokens.border };

  return (
    <Section
      style={{
        ...infoCardStyle,
        backgroundColor: palette.bg,
        borderColor: palette.border,
      }}
    >
      {label && <Text style={infoCardLabelStyle}>{label}</Text>}
      {children}
    </Section>
  );
}

export function Detail({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <table
      width="100%"
      cellPadding="0"
      cellSpacing="0"
      style={detailRowTableStyle}
    >
      <tr>
        <td style={detailLabelCellStyle}>{label}</td>
        <td style={detailValueCellStyle}>{children}</td>
      </tr>
    </table>
  );
}

export function Button({
  href,
  children,
  variant = "primary",
}: {
  href: string;
  children: ReactNode;
  variant?: "primary" | "outline";
}) {
  const tdStyle: CSSProperties =
    variant === "outline" ? buttonOutlineTdStyle : buttonPrimaryTdStyle;
  const linkStyle: CSSProperties =
    variant === "outline" ? buttonOutlineLinkStyle : buttonPrimaryLinkStyle;
  return (
    <Section style={{ margin: "24px 0 8px" }}>
      <table
        width="100%"
        cellPadding="0"
        cellSpacing="0"
        role="presentation"
        style={{ borderCollapse: "collapse" }}
      >
        <tbody>
          <tr>
            <td style={tdStyle}>
              <Link href={href} style={linkStyle}>
                {children}
              </Link>
            </td>
          </tr>
        </tbody>
      </table>
    </Section>
  );
}

export function DetailPanel({ children }: { children: ReactNode }) {
  return <Section style={detailPanelStyle}>{children}</Section>;
}

export function StatusPill({
  variant,
  children,
}: {
  variant: "paid" | "pending" | "waitlisted" | "confirmed" | "denied";
  children: ReactNode;
}) {
  const palette =
    variant === "paid" || variant === "confirmed"
      ? { bg: tokens.sageSoft, fg: tokens.sage }
      : variant === "pending" || variant === "waitlisted"
        ? { bg: tokens.ochreSoft, fg: "#8A6A2E" }
        : { bg: "#F4D8D2", fg: tokens.primary };

  return (
    <span
      style={{
        ...statusPillStyle,
        backgroundColor: palette.bg,
        color: palette.fg,
      }}
    >
      {children}
    </span>
  );
}

const accentStripeStyle: CSSProperties = {
  height: "4px",
  backgroundColor: tokens.primary,
  fontSize: "1px",
  lineHeight: "4px",
};

const bodyStyle: CSSProperties = {
  backgroundColor: tokens.cream,
  fontFamily: fonts.body,
  margin: 0,
  padding: "32px 16px",
  WebkitFontSmoothing: "antialiased",
  MozOsxFontSmoothing: "grayscale",
};

const containerStyle: CSSProperties = {
  backgroundColor: tokens.paper,
  margin: "0 auto",
  maxWidth: "600px",
  border: `1px solid ${tokens.border}`,
  borderRadius: "4px",
  overflow: "hidden",
};

const logoSectionStyle: CSSProperties = {
  padding: "32px 40px 24px",
  textAlign: "center",
  borderBottom: `1px solid ${tokens.border}`,
};

const logoImgStyle: CSSProperties = {
  display: "block",
  margin: "0 auto",
  height: "34px",
  width: "auto",
};

const ruleStyle: CSSProperties = {
  borderColor: tokens.border,
  borderWidth: "1px 0 0 0",
  borderStyle: "solid",
  margin: "0 40px",
  width: "auto",
};

const contentSectionStyle: CSSProperties = {
  padding: "32px 40px",
};

const h1Style: CSSProperties = {
  fontFamily: fonts.display,
  fontSize: "32px",
  fontWeight: 500,
  lineHeight: "1.15",
  letterSpacing: "-0.01em",
  color: tokens.ink,
  margin: "0 0 24px",
};

const h2Style: CSSProperties = {
  fontFamily: fonts.display,
  fontSize: "22px",
  fontWeight: 500,
  lineHeight: "1.2",
  letterSpacing: "-0.005em",
  color: tokens.ink,
  margin: "32px 0 12px",
};

const pStyle: CSSProperties = {
  fontFamily: fonts.body,
  fontSize: "15px",
  lineHeight: "1.6",
  color: tokens.ink2,
  margin: "0 0 16px",
};

const sectionLabelStyle: CSSProperties = {
  fontFamily: fonts.body,
  fontSize: "11px",
  fontWeight: 600,
  letterSpacing: "0.15em",
  textTransform: "uppercase",
  color: tokens.inkMuted,
  margin: "0 0 12px",
};

const infoCardStyle: CSSProperties = {
  backgroundColor: tokens.cream2,
  border: `1px solid ${tokens.border}`,
  borderRadius: "4px",
  padding: "20px 24px",
  margin: "20px 0",
};

const infoCardLabelStyle: CSSProperties = {
  fontFamily: fonts.body,
  fontSize: "11px",
  fontWeight: 600,
  letterSpacing: "0.15em",
  textTransform: "uppercase",
  color: tokens.inkMuted,
  margin: "0 0 12px",
};

const detailRowTableStyle: CSSProperties = {
  borderCollapse: "collapse",
  margin: "0 0 8px",
  width: "100%",
};

const detailLabelCellStyle: CSSProperties = {
  fontFamily: fonts.body,
  fontSize: "12px",
  fontWeight: 500,
  letterSpacing: "0.05em",
  textTransform: "uppercase",
  color: tokens.inkMuted,
  padding: "4px 16px 4px 0",
  verticalAlign: "top",
  width: "30%",
  whiteSpace: "nowrap",
};

const detailValueCellStyle: CSSProperties = {
  fontFamily: fonts.body,
  fontSize: "14px",
  lineHeight: "1.5",
  color: tokens.ink,
  padding: "4px 0",
  verticalAlign: "top",
};

const detailPanelStyle: CSSProperties = {
  backgroundColor: tokens.cream2,
  border: `1px solid ${tokens.border}`,
  borderRadius: "6px",
  padding: "12px 20px",
  margin: "20px 0",
};

const buttonPrimaryTdStyle: CSSProperties = {
  backgroundColor: tokens.primary,
  borderRadius: "6px",
  padding: "15px 24px",
  textAlign: "center",
};

const buttonPrimaryLinkStyle: CSSProperties = {
  color: tokens.paper,
  display: "block",
  fontFamily: fonts.body,
  fontSize: "15px",
  fontWeight: 600,
  letterSpacing: "0.01em",
  textDecoration: "none",
};

const buttonOutlineTdStyle: CSSProperties = {
  backgroundColor: "transparent",
  border: `1px solid ${tokens.ink}`,
  borderRadius: "6px",
  padding: "15px 24px",
  textAlign: "center",
};

const buttonOutlineLinkStyle: CSSProperties = {
  color: tokens.ink,
  display: "block",
  fontFamily: fonts.body,
  fontSize: "15px",
  fontWeight: 600,
  letterSpacing: "0.01em",
  textDecoration: "none",
};

const statusPillStyle: CSSProperties = {
  display: "inline-block",
  fontFamily: fonts.body,
  fontSize: "11px",
  fontWeight: 600,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  padding: "4px 10px",
  borderRadius: "2px",
};

const footerSectionStyle: CSSProperties = {
  padding: "24px 40px 32px",
  textAlign: "center",
};

const footerBrandStyle: CSSProperties = {
  fontFamily: fonts.display,
  fontSize: "14px",
  fontWeight: 500,
  fontStyle: "italic",
  color: tokens.ink,
  margin: "0 0 4px",
};

const footerAddressStyle: CSSProperties = {
  fontFamily: fonts.body,
  fontSize: "11px",
  letterSpacing: "0.05em",
  color: tokens.inkMuted,
  margin: "0 0 12px",
};

const footerContactStyle: CSSProperties = {
  fontFamily: fonts.body,
  fontSize: "12px",
  lineHeight: "1.5",
  color: tokens.inkMuted,
  margin: 0,
};
