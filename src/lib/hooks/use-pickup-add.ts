"use client";

/**
 * usePickupAdd — thin fetch wrapper for the rapid roll-call add endpoint.
 *
 * POST /api/admin/pickup/[sessionId]/add
 * Body: { firstName, lastName, phone }
 * Response: { bookingId, personName, userId, linkResult: { sent, channel?, recipientMasked? } }
 *
 * Returns:
 *   add(input)  — call with { firstName, lastName, phone }; resolves to
 *                 { ok: true, linkSent: boolean } or { ok: false, error: string }
 *   isAdding    — true while the fetch is in-flight
 */

import { useState } from "react";

export interface PickupAddInput {
  firstName: string;
  lastName: string;
  phone: string;
}

export type PickupAddResult =
  | { ok: true; bookingId: string; personName: string; linkSent: boolean }
  | { ok: false; error: string };

export interface UsePickupAdd {
  add(input: PickupAddInput): Promise<PickupAddResult>;
  isAdding: boolean;
}

export function usePickupAdd(sessionId: string): UsePickupAdd {
  const [isAdding, setIsAdding] = useState(false);

  const add = async (input: PickupAddInput): Promise<PickupAddResult> => {
    setIsAdding(true);
    try {
      const res = await fetch(`/api/admin/pickup/${sessionId}/add`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: input.firstName.trim(),
          lastName: input.lastName.trim(),
          phone: input.phone.trim(),
        }),
      });

      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        return {
          ok: false,
          error: (body as { error?: string }).error ?? `Request failed (${res.status})`,
        };
      }

      const data = body as {
        bookingId: string;
        personName: string;
        linkResult: { sent: boolean };
      };

      return {
        ok: true,
        bookingId: data.bookingId,
        personName: data.personName,
        linkSent: data.linkResult?.sent ?? false,
      };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "Network error",
      };
    } finally {
      setIsAdding(false);
    }
  };

  return { add, isAdding };
}
