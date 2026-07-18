import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { organizations, type OrganizationSettings } from "@/lib/db/schema/organizations";

/**
 * Email address that should receive operational notifications for an org
 * (e.g. "a new rental request needs review"). Reuses the same fallback
 * chain already established for ops-facing email elsewhere (ops/ping.ts,
 * ops/digest.ts, feedback/[token]/score.ts): a dedicated alert address if
 * set, then the general support inbox, then the org's top-level contact
 * email as a last resort. Returns null if none is set.
 */
export async function getAdminNotifyEmail(orgId: string): Promise<string | null> {
  const [org] = await getDb()
    .select({ email: organizations.email, settings: organizations.settings })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  if (!org) return null;
  const settings = (org.settings ?? {}) as OrganizationSettings;
  return (
    settings.feedback?.detractorAlertEmail ??
    settings.contact?.supportEmail ??
    org.email ??
    null
  );
}
