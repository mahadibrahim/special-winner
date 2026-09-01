/**
 * What the front-desk walk-up panel shows when
 * POST /api/admin/dropin/sessions/:id/walk-up refuses.
 *
 * The panel used to toast a blanket "Walk-up failed — see console" for every
 * 4xx, which hid the one thing the person at the desk could act on. Two
 * response shapes are in play: this endpoint's plain `{ error: "…" }` strings
 * and the coded `{ error: { code, message } }` shape the class guard returns
 * (src/lib/classes/class-walkup.ts). Rendering the latter naively would put an
 * OBJECT into a toast — React throws on that — so the extraction lives here as
 * a pure, tested function rather than inline in the component.
 */
export const WALK_UP_ERROR_FALLBACK = "Walk-up failed — see console";

export function walkUpErrorMessage(body: unknown): string {
  if (!body || typeof body !== "object") return WALK_UP_ERROR_FALLBACK;
  const err = (body as { error?: unknown }).error;
  if (typeof err === "string") return err;
  if (err && typeof err === "object") {
    const message = (err as { message?: unknown }).message;
    if (typeof message === "string") return message;
    const code = (err as { code?: unknown }).code;
    if (typeof code === "string") return code;
  }
  const topLevelMessage = (body as { message?: unknown }).message;
  if (typeof topLevelMessage === "string") return topLevelMessage;
  return WALK_UP_ERROR_FALLBACK;
}
