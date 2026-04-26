import type {
  Organization,
  Location,
  OrganizationExternalStore,
} from "@/lib/db/schema";

/**
 * Reject obvious placeholder URLs (e.g. example.com / localhost) so seed defaults
 * don't show up as a real "Shop team gear" widget on the parent dashboard.
 */
function isUsableExternalStoreUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host === "localhost" || host === "127.0.0.1") return false;
    if (host === "example.com" || host.endsWith(".example.com")) return false;
    if (host === "example.org" || host.endsWith(".example.org")) return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolve the effective external-store config for a viewer. Location wins over
 * org when both are set; returns null when neither has a usable url.
 */
export function resolveExternalStore(
  location: Location | null | undefined,
  organization: Organization | null | undefined,
): OrganizationExternalStore | null {
  const locSettings = (location?.settings as { externalStore?: OrganizationExternalStore } | null) ?? null;
  if (locSettings?.externalStore?.url && isUsableExternalStoreUrl(locSettings.externalStore.url)) {
    return locSettings.externalStore;
  }
  const orgSettings =
    (organization?.settings as { externalStore?: OrganizationExternalStore } | null) ?? null;
  if (orgSettings?.externalStore?.url && isUsableExternalStoreUrl(orgSettings.externalStore.url)) {
    return orgSettings.externalStore;
  }
  return null;
}
