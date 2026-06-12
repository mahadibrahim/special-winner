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
import {
  ASPIRE_EMAIL_THEME,
  EmailThemeProvider,
  emailThemeFor,
  useEmailTheme,
  type EmailTheme,
} from "./email-theme";

/**
 * @deprecated Aspire-only constants — kept for templates that haven't
 * been made brand-aware. Brand-aware code uses useEmailTheme().
 */
export const tokens = ASPIRE_EMAIL_THEME.tokens;

/**
 * @deprecated Aspire-only constants — kept for templates that haven't
 * been made brand-aware. Brand-aware code uses useEmailTheme().
 */
export const fonts = ASPIRE_EMAIL_THEME.fonts;

interface EmailLayoutProps {
  preview: string;
  appUrl?: string;
  brand?: "aspire" | "soccerone";
  children: ReactNode;
}

export function EmailLayout({
  preview,
  appUrl,
  brand = "aspire",
  children,
}: EmailLayoutProps) {
  const t = emailThemeFor(brand);
  const resolvedAppUrl =
    appUrl ??
    (brand === "soccerone"
      ? "https://www.gosoccerone.com"
      : "https://aspiresportsohio.com");
  return (
    <EmailThemeProvider value={t}>
      <Html>
        <Head>
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link
            rel="preconnect"
            href="https://fonts.gstatic.com"
            crossOrigin="anonymous"
          />
          <link href={t.fontsHref} rel="stylesheet" />
        </Head>
        <Preview>{preview}</Preview>
        <Body style={bodyStyle(t)}>
          <Container style={containerStyle(t)}>
            <div style={accentStripeStyle(t)} />

            <Section style={logoSectionStyle(t)}>
              {t.logo.kind === "img" ? (
                <Img
                  src={`${resolvedAppUrl}${t.logo.path}`}
                  alt={t.logo.alt}
                  width="140"
                  height="34"
                  style={logoImgStyle}
                />
              ) : (
                <Text style={wordmarkStyle(t)}>
                  SOCCER<span style={{ color: t.tokens.primary }}>ONE</span>
                </Text>
              )}
            </Section>

            {children}

            <Hr style={ruleStyle(t)} />

            <Section style={footerSectionStyle}>
              <Text style={footerBrandStyle(t)}>{t.brandName}</Text>
              <Text style={footerAddressStyle(t)}>{t.footerAddress}</Text>
              <Text style={footerContactStyle(t)}>
                Questions? Just reply to this email — a real person reads it.
              </Text>
            </Section>
          </Container>
        </Body>
      </Html>
    </EmailThemeProvider>
  );
}

export function Content({ children }: { children: ReactNode }) {
  return <Section style={contentSectionStyle}>{children}</Section>;
}

export function H1({ children }: { children: ReactNode }) {
  const t = useEmailTheme();
  return <Text style={h1Style(t)}>{children}</Text>;
}

export function H2({ children }: { children: ReactNode }) {
  const t = useEmailTheme();
  return <Text style={h2Style(t)}>{children}</Text>;
}

export function P({ children }: { children: ReactNode }) {
  const t = useEmailTheme();
  return <Text style={pStyle(t)}>{children}</Text>;
}

export function PMuted({ children }: { children: ReactNode }) {
  const t = useEmailTheme();
  return <Text style={{ ...pStyle(t), color: t.tokens.inkMuted }}>{children}</Text>;
}

export function SectionLabel({
  children,
  style,
}: {
  children: ReactNode;
  style?: CSSProperties;
}) {
  const t = useEmailTheme();
  return <Text style={{ ...sectionLabelStyle(t), ...style }}>{children}</Text>;
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
  const t = useEmailTheme();
  const palette =
    variant === "warning"
      ? { bg: t.tokens.ochreSoft, border: t.tokens.ochre }
      : variant === "success"
        ? { bg: t.tokens.sageSoft, border: t.tokens.sage }
        : variant === "primary"
          ? { bg: t.tokens.primarySoft, border: t.tokens.primary }
          : { bg: t.tokens.cream2, border: t.tokens.border };

  return (
    <Section
      style={{
        ...infoCardStyle(t),
        backgroundColor: palette.bg,
        borderColor: palette.border,
      }}
    >
      {label && <Text style={infoCardLabelStyle(t)}>{label}</Text>}
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
  const t = useEmailTheme();
  return (
    <table
      width="100%"
      cellPadding="0"
      cellSpacing="0"
      style={detailRowTableStyle}
    >
      <tr>
        <td style={detailLabelCellStyle(t)}>{label}</td>
        <td style={detailValueCellStyle(t)}>{children}</td>
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
  const t = useEmailTheme();
  const tdStyle: CSSProperties =
    variant === "outline" ? buttonOutlineTdStyle(t) : buttonPrimaryTdStyle(t);
  const linkStyle: CSSProperties =
    variant === "outline" ? buttonOutlineLinkStyle(t) : buttonPrimaryLinkStyle(t);
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
  const t = useEmailTheme();
  return <Section style={detailPanelStyle(t)}>{children}</Section>;
}

export function StatusPill({
  variant,
  children,
}: {
  variant: "paid" | "pending" | "waitlisted" | "confirmed" | "denied";
  children: ReactNode;
}) {
  const t = useEmailTheme();
  const palette =
    variant === "paid" || variant === "confirmed"
      ? { bg: t.tokens.sageSoft, fg: t.tokens.sage }
      : variant === "pending" || variant === "waitlisted"
        ? { bg: t.tokens.ochreSoft, fg: "#8A6A2E" }
        : { bg: "#F4D8D2", fg: t.tokens.primary };

  return (
    <span
      style={{
        ...statusPillStyle(t),
        backgroundColor: palette.bg,
        color: palette.fg,
      }}
    >
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Style functions (take theme, return CSSProperties)
// ---------------------------------------------------------------------------

const accentStripeStyle = (t: EmailTheme): CSSProperties => ({
  height: "4px",
  backgroundColor: t.tokens.primary,
  fontSize: "1px",
  lineHeight: "4px",
});

const bodyStyle = (t: EmailTheme): CSSProperties => ({
  backgroundColor: t.tokens.cream,
  fontFamily: t.fonts.body,
  margin: 0,
  padding: "32px 16px",
  WebkitFontSmoothing: "antialiased",
  MozOsxFontSmoothing: "grayscale",
});

const containerStyle = (t: EmailTheme): CSSProperties => ({
  backgroundColor: t.tokens.paper,
  margin: "0 auto",
  maxWidth: "600px",
  border: `1px solid ${t.tokens.border}`,
  borderRadius: "4px",
  overflow: "hidden",
});

const logoSectionStyle = (t: EmailTheme): CSSProperties => ({
  padding: "32px 40px 24px",
  textAlign: "center",
  borderBottom: `1px solid ${t.tokens.border}`,
});

const logoImgStyle: CSSProperties = {
  display: "block",
  margin: "0 auto",
  height: "34px",
  width: "auto",
};

const wordmarkStyle = (t: EmailTheme): CSSProperties => ({
  fontFamily: t.fonts.display,
  fontSize: "26px",
  fontWeight: 400,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: t.tokens.ink,
  margin: 0,
});

const ruleStyle = (t: EmailTheme): CSSProperties => ({
  borderColor: t.tokens.border,
  borderWidth: "1px 0 0 0",
  borderStyle: "solid",
  margin: "0 40px",
  width: "auto",
});

const contentSectionStyle: CSSProperties = {
  padding: "32px 40px",
};

const h1Style = (t: EmailTheme): CSSProperties => ({
  fontFamily: t.fonts.display,
  fontSize: "32px",
  fontWeight: 500,
  lineHeight: "1.15",
  letterSpacing: "-0.01em",
  color: t.tokens.ink,
  margin: "0 0 24px",
});

const h2Style = (t: EmailTheme): CSSProperties => ({
  fontFamily: t.fonts.display,
  fontSize: "22px",
  fontWeight: 500,
  lineHeight: "1.2",
  letterSpacing: "-0.005em",
  color: t.tokens.ink,
  margin: "32px 0 12px",
});

const pStyle = (t: EmailTheme): CSSProperties => ({
  fontFamily: t.fonts.body,
  fontSize: "15px",
  lineHeight: "1.6",
  color: t.tokens.ink2,
  margin: "0 0 16px",
});

const sectionLabelStyle = (t: EmailTheme): CSSProperties => ({
  fontFamily: t.fonts.body,
  fontSize: "11px",
  fontWeight: 600,
  letterSpacing: "0.15em",
  textTransform: "uppercase",
  color: t.tokens.inkMuted,
  margin: "0 0 12px",
});

const infoCardStyle = (t: EmailTheme): CSSProperties => ({
  backgroundColor: t.tokens.cream2,
  border: `1px solid ${t.tokens.border}`,
  borderRadius: "4px",
  padding: "20px 24px",
  margin: "20px 0",
});

const infoCardLabelStyle = (t: EmailTheme): CSSProperties => ({
  fontFamily: t.fonts.body,
  fontSize: "11px",
  fontWeight: 600,
  letterSpacing: "0.15em",
  textTransform: "uppercase",
  color: t.tokens.inkMuted,
  margin: "0 0 12px",
});

const detailRowTableStyle: CSSProperties = {
  borderCollapse: "collapse",
  margin: "0 0 8px",
  width: "100%",
};

const detailLabelCellStyle = (t: EmailTheme): CSSProperties => ({
  fontFamily: t.fonts.body,
  fontSize: "12px",
  fontWeight: 500,
  letterSpacing: "0.05em",
  textTransform: "uppercase",
  color: t.tokens.inkMuted,
  padding: "4px 16px 4px 0",
  verticalAlign: "top",
  width: "30%",
  whiteSpace: "nowrap",
});

const detailValueCellStyle = (t: EmailTheme): CSSProperties => ({
  fontFamily: t.fonts.body,
  fontSize: "14px",
  lineHeight: "1.5",
  color: t.tokens.ink,
  padding: "4px 0",
  verticalAlign: "top",
});

const detailPanelStyle = (t: EmailTheme): CSSProperties => ({
  backgroundColor: t.tokens.cream2,
  border: `1px solid ${t.tokens.border}`,
  borderRadius: "6px",
  padding: "12px 20px",
  margin: "20px 0",
});

const buttonPrimaryTdStyle = (t: EmailTheme): CSSProperties => ({
  backgroundColor: t.tokens.primary,
  borderRadius: "6px",
  textAlign: "center",
});

const buttonPrimaryLinkStyle = (t: EmailTheme): CSSProperties => ({
  color: t.tokens.paper,
  display: "block",
  fontFamily: t.fonts.body,
  fontSize: "15px",
  fontWeight: 600,
  letterSpacing: "0.01em",
  padding: "15px 24px",
  textDecoration: "none",
});

const buttonOutlineTdStyle = (t: EmailTheme): CSSProperties => ({
  backgroundColor: "transparent",
  border: `1px solid ${t.tokens.ink}`,
  borderRadius: "6px",
  textAlign: "center",
});

const buttonOutlineLinkStyle = (t: EmailTheme): CSSProperties => ({
  color: t.tokens.ink,
  display: "block",
  fontFamily: t.fonts.body,
  fontSize: "15px",
  fontWeight: 600,
  letterSpacing: "0.01em",
  padding: "15px 24px",
  textDecoration: "none",
});

const statusPillStyle = (t: EmailTheme): CSSProperties => ({
  display: "inline-block",
  fontFamily: t.fonts.body,
  fontSize: "11px",
  fontWeight: 600,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  padding: "4px 10px",
  borderRadius: "2px",
});

const footerSectionStyle: CSSProperties = {
  padding: "24px 40px 32px",
  textAlign: "center",
};

const footerBrandStyle = (t: EmailTheme): CSSProperties => ({
  fontFamily: t.fonts.display,
  fontSize: "14px",
  fontWeight: 500,
  fontStyle: "italic",
  color: t.tokens.ink,
  margin: "0 0 4px",
});

const footerAddressStyle = (t: EmailTheme): CSSProperties => ({
  fontFamily: t.fonts.body,
  fontSize: "11px",
  letterSpacing: "0.05em",
  color: t.tokens.inkMuted,
  margin: "0 0 12px",
});

const footerContactStyle = (t: EmailTheme): CSSProperties => ({
  fontFamily: t.fonts.body,
  fontSize: "12px",
  lineHeight: "1.5",
  color: t.tokens.inkMuted,
  margin: 0,
});
