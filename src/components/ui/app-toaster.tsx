import { Toaster } from "sonner";

/**
 * App-wide toast host. Mounted once in BaseLayout so every `toast.*` call
 * (58+ call sites) actually renders instead of being a silent no-op.
 *
 * Props match the mounts previously duplicated across the 5 standalone
 * SoccerOne pages (pickup/leagues/memberships/sponsors/rent), which have
 * since been deduped now that BaseLayout provides one shared instance.
 */
export function AppToaster() {
  return <Toaster richColors position="bottom-right" />;
}
