/**
 * sessionStorage key a kiosk writes (in KioskLanding) so the self-serve
 * completion screen — a separate route the "Find my booking" flow navigates
 * the tab to — can return the device to that kiosk's landing page.
 *
 * Lives in its own module so both the kiosk and self-serve components can
 * share the key without dragging one component's bundle into the other.
 */
export const KIOSK_RETURN_SLUG_KEY = "aspire:kiosk-return-slug";
