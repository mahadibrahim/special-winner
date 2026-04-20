/**
 * Media workflow notification helpers.
 *
 * Thin wrappers around `sendEmail` that cover the four notification surfaces
 * in the media pipeline:
 *   - Assignment: tell a photographer they have a new shoot
 *   - Unconfirmed reminder: 48h and 24h nudges to confirm
 *   - Admin escalation: 24h-out unconfirmed shoots surfaced to the assigning admin
 *   - Upload complete: tell the admin a shoot's assets have landed
 *
 * Each function looks up the recipient's email from the database, builds a
 * plain-text + minimal-HTML body, and fires via Resend.  No template
 * rendering is used here to keep the surface area small for Phase 1; a
 * react-email template can replace the inline HTML later.
 *
 * `@/lib/notifications` does not exist in this codebase — these helpers
 * are the canonical notification entry-point for the media module.
 */

import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema/users";
import { sendEmail } from "@/lib/email";
import type { ShootSession } from "@/lib/db/schema/media";

const APP_URL = import.meta.env.PUBLIC_APP_URL || "http://localhost:4321";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function lookupEmail(userId: string): Promise<string | null> {
  const db = getDb();
  const [row] = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return row?.email ?? null;
}

function simpleHtml(subject: string, body: string, link: string): string {
  return `<p>${body}</p><p><a href="${APP_URL}${link}">View details</a></p>`;
}

// ---------------------------------------------------------------------------
// Public notification functions
// ---------------------------------------------------------------------------

/**
 * Notify a photographer that they have been assigned to a shoot.
 * Called immediately after the assignment is persisted.
 */
export async function notifyAssignment(
  session: ShootSession,
  photographerUserId: string,
): Promise<void> {
  const email = await lookupEmail(photographerUserId);
  if (!email) {
    console.warn(`[media/notifications] notifyAssignment: user ${photographerUserId} not found`);
    return;
  }

  const subject = "You're assigned to a shoot";
  const body = `You've been assigned to shoot on ${session.scheduledStart.toISOString()}. Please confirm in your dashboard.`;
  const link = `/media/jobs/${session.id}`;

  await sendEmail({ to: email, subject, html: simpleHtml(subject, body, link), text: body });
}

/**
 * Remind a photographer that their shoot is still unconfirmed.
 * hoursOut is either 48 (first nudge) or 24 (final nudge before escalation).
 */
export async function notifyUnconfirmedReminder(
  session: ShootSession,
  photographerUserId: string,
  hoursOut: 48 | 24,
): Promise<void> {
  const email = await lookupEmail(photographerUserId);
  if (!email) {
    console.warn(
      `[media/notifications] notifyUnconfirmedReminder: user ${photographerUserId} not found`,
    );
    return;
  }

  const subject = `Reminder: confirm your shoot (${hoursOut}h)`;
  const body = `Your shoot at ${session.scheduledStart.toISOString()} is ${hoursOut}h away and still unconfirmed.`;
  const link = `/media/jobs/${session.id}`;

  await sendEmail({ to: email, subject, html: simpleHtml(subject, body, link), text: body });
}

/**
 * Escalate to the assigning admin when a shoot is 24 h out and still
 * unconfirmed.  The admin can then reach out to the photographer or
 * reassign.
 */
export async function notifyAdminUnconfirmedEscalation(
  session: ShootSession,
  adminUserId: string,
): Promise<void> {
  const email = await lookupEmail(adminUserId);
  if (!email) {
    console.warn(
      `[media/notifications] notifyAdminUnconfirmedEscalation: user ${adminUserId} not found`,
    );
    return;
  }

  const subject = "Unconfirmed shoot 24h out";
  const body = `Shoot ${session.id} is 24h out and the photographer has not confirmed.`;
  const link = `/admin/media/shoots/${session.id}`;

  await sendEmail({ to: email, subject, html: simpleHtml(subject, body, link), text: body });
}

/**
 * Notify an admin that a photographer has finished uploading assets for a
 * shoot.  Triggers the review/culling workflow.
 */
export async function notifyUploadComplete(
  session: ShootSession,
  assetCount: number,
  adminUserId: string,
): Promise<void> {
  const email = await lookupEmail(adminUserId);
  if (!email) {
    console.warn(
      `[media/notifications] notifyUploadComplete: user ${adminUserId} not found`,
    );
    return;
  }

  const subject = `Upload complete: ${assetCount} files`;
  const body = `Shoot ${session.id} has finished uploading ${assetCount} assets.`;
  const link = `/admin/media/shoots/${session.id}`;

  await sendEmail({ to: email, subject, html: simpleHtml(subject, body, link), text: body });
}
