/**
 * Await a notification dispatch and log a failure without throwing.
 *
 * Why this exists: the drop-in / rental notification dispatchers resolve
 * `{ ok: false, reason }` on a send failure rather than throwing, and were
 * previously kicked off via an un-awaited `queueMicrotask`. In the serverless
 * runtime the function freezes once it returns its HTTP response, so the
 * un-awaited send never completed its network call — the email never reached
 * the provider (no attempt was even recorded).
 *
 * Call this with `await` AFTER the DB transaction commits and BEFORE the
 * handler returns, so the send finishes while the function is still alive.
 * Keeping it outside the transaction preserves the original intent: a
 * messaging failure is logged but must never roll back (or block) the booking.
 */
export async function awaitDispatch(
  label: string,
  run: () => Promise<{ ok: boolean; reason?: string; error?: string }>,
  ctx: Record<string, unknown> = {},
): Promise<void> {
  try {
    const result = await run();
    if (!result.ok) {
      console.error(`[notify] ${label} not delivered`, {
        ...ctx,
        reason: result.reason,
        error: result.error,
      });
    }
  } catch (err) {
    console.error(`[notify] ${label} dispatch threw`, { ...ctx, err });
  }
}

/**
 * Same idea as awaitDispatch, for the transactional email senders in
 * `@/lib/email/send` (they resolve `{ success: boolean; error?: string }`
 * rather than throwing). Registration/receipt emails were previously fired
 * un-awaited (`.catch()` only), so in the serverless runtime the send was
 * abandoned when the handler returned. Call this with `await` after the DB
 * work and before the handler returns; failures are logged, never thrown.
 */
export async function awaitEmailSend(
  label: string,
  run: () => Promise<{ success: boolean; error?: string }>,
  ctx: Record<string, unknown> = {},
): Promise<void> {
  try {
    const result = await run();
    if (!result.success) {
      console.error(`[email] ${label} not sent`, { ...ctx, error: result.error });
    }
  } catch (err) {
    console.error(`[email] ${label} send threw`, { ...ctx, err });
  }
}
