import { render } from "@react-email/components";
import type { ReactElement } from "react";

/**
 * Render an email template once into both an HTML body and a plain-text
 * alternative part. Every transactional email ships both — the plain-text
 * part materially improves deliverability and spam scoring.
 */
export async function renderEmail(
  element: ReactElement,
): Promise<{ html: string; text: string }> {
  const [html, text] = await Promise.all([
    render(element),
    render(element, { plainText: true }),
  ]);
  return { html, text };
}
