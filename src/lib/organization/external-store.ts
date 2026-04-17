import type {
  Organization,
  Location,
  OrganizationExternalStore,
} from "@/lib/db/schema";

/**
 * Resolve the effective external-store config for a viewer. Location wins over
 * org when both are set; returns null when neither has a usable url.
 */
export function resolveExternalStore(
  location: Location | null | undefined,
  organization: Organization | null | undefined,
): OrganizationExternalStore | null {
  const locSettings = (location?.settings as { externalStore?: OrganizationExternalStore } | null) ?? null;
  if (locSettings?.externalStore?.url) {
    return locSettings.externalStore;
  }
  const orgSettings =
    (organization?.settings as { externalStore?: OrganizationExternalStore } | null) ?? null;
  if (orgSettings?.externalStore?.url) {
    return orgSettings.externalStore;
  }
  return null;
}
