/**
 * Single source of truth for the SoccerOne contact email. Rendered in
 * the footer, the homepage contact bar, and both facility pages.
 *
 * Mailbox provisioning (founder, 2026-06-12): Migadu mailbox + MX
 * records in the Netlify-managed gosoccerone.com DNS zone, mirroring
 * aspiresportsohio.com (10 aspmx1.migadu.com / 20 aspmx2.migadu.com).
 * A scheduled routine verifies this on 2026-06-12 and opens an issue
 * if missing. Change the address here only.
 */
export const SOCCERONE_CONTACT_EMAIL = "hello@gosoccerone.com";
