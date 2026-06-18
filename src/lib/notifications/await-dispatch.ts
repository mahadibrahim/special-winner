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
