/**
 * Transactional commit of a recurring rental block.
 *
 * A block is a parent row whose children are ordinary field_rentals rows
 * carrying block_id, so every existing rental mechanism (conflict checks, the
 * field-time ledger, waivers, check-in, refunds) keeps working unchanged.
 *
 * Commit is ALL-OR-NOTHING. Block plus every session are written in one
 * transaction; each session is re-checked inside it with both
 * assertNoRentalConflict (the same check the public path uses) and
 * assertNoBlockConflict (the ledger check, which is what respects the
 * field-resource hierarchy and internal reserves). Sessions are locked in a
 * deterministic order (venue id, then field number, then start) so two admins
 * building overlapping blocks serialize instead of deadlocking. If anything
 * got taken between Generate and Send, nothing commits and the conflicting
 * sessions are named.
 */
import { and, eq, inArray, isNull, asc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { fieldRentals } from "@/lib/db/schema/field-rentals";
import { fieldRentalBlocks } from "@/lib/db/schema/field-rental-blocks";
import { venueResources } from "@/lib/db/schema/scheduling";
import { assertNoRentalConflict } from "@/lib/rentals/conflicts";
import { assertNoBlockConflict, BlockConflictError } from "@/lib/scheduling/blocks";
import { resolveTopLevelResourceId, syncRentalBlock } from "@/lib/scheduling/sync";
import {
  generateBlockSessions,
  localMinuteToUtc,
  type BlockPattern,
  type GeneratedSession,
} from "./generate";
import {
  quoteBlock,
  balanceDueAt as deriveBalanceDueAt,
  type BlockDiscount,
  type BlockPricingContext,
} from "./pricing";
import { replaceQuoteMarkers, clearQuoteMarkers, type MarkerSlot } from "./quote-markers";

export type BlockCommitMode = "draft" | "send_deposit" | "paid_offline";

export interface CreateBlockInput {
  organizationId: string;
  locationId: string;
  brand: "soccerone" | "aspire";
  label: string;
  renterUserId: string | null;
  renterName: string;
  renterEmail: string | null;
  renterPhone: string | null;
  partySize: number;
  purpose: string | null;
  notes: string | null;
  pattern: BlockPattern;
  excludedKeys: string[];
  sessionOverrides: Record<
    string,
    { startMinute?: number; durationMinutes?: number; venueId?: string }
  >;
  extraSessions: GeneratedSession[];
  discount: BlockDiscount;
  depositPct: number;
  rateCard: {
    balanceDueLeadDays: number;
    blockHoldHours: number;
    quoteMarkerTtlDays: number;
  };
  pricingContext: BlockPricingContext;
  mode: BlockCommitMode;
  offlinePaymentMethod: "cash" | "comp" | null;
  createdByUserId: string;
}

export type CreateBlockResult =
  | { ok: true; blockId: string; sessionIds: string[] }
  | { ok: false; error: string; conflicts: Array<{ key: string; reason: string }> };

/** Thrown only to roll the commit transaction back; never escapes this module. */
class BlockCommitAbort extends Error {
  constructor() {
    super("block commit aborted");
    this.name = "BlockCommitAbort";
  }
}

/**
 * Pure: pattern → the session list the admin actually asked for. Generate,
 * drop the unchecked rows, apply per-row edits, append one-offs, re-sort.
 * Returns [] rather than throwing on an empty result — createRentalBlock is
 * the one that rejects, so the endpoint can map results instead of catching.
 */
export type SessionListInput = Pick<
  CreateBlockInput,
  "pattern" | "excludedKeys" | "sessionOverrides" | "extraSessions"
>;

export function resolveSessionList(input: SessionListInput): GeneratedSession[] {
  const excluded = new Set(input.excludedKeys ?? []);
  const overrides = input.sessionOverrides ?? {};

  const generated = generateBlockSessions(input.pattern)
    .filter((s) => !excluded.has(s.key))
    .map((s) => {
      const edit = overrides[s.key];
      if (!edit) return s;
      const startMinute = edit.startMinute ?? s.startMinute;
      const durationMinutes = edit.durationMinutes ?? s.durationMinutes;
      const venueId = edit.venueId ?? s.venueId;
      // Keep the original key: it addresses the ROW, and the admin's edits
      // stay attached to it across a regenerate.
      return {
        ...s,
        venueId,
        startMinute,
        durationMinutes,
        startsAt: localMinuteToUtc(s.date, startMinute, input.pattern.timeZone),
        endsAt: localMinuteToUtc(
          s.date,
          startMinute + durationMinutes,
          input.pattern.timeZone,
        ),
      };
    });

  return [...generated, ...(input.extraSessions ?? [])].sort(
    (a, b) => a.startsAt.getTime() - b.startsAt.getTime(),
  );
}

/**
 * venueId → the field number a block session books. Top-level resource rows
 * only; a venue with no resource rows falls back to 1, matching the
 * availability path's bare-field enumeration.
 */
export async function resolveVenueFieldNumbers(
  venueIds: string[],
): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  const unique = [...new Set(venueIds)];
  for (const id of unique) out[id] = 1;
  if (unique.length === 0) return out;

  const rows = await getDb()
    .select({
      venueId: venueResources.venueId,
      fieldNumber: venueResources.fieldNumber,
    })
    .from(venueResources)
    .where(
      and(
        inArray(venueResources.venueId, unique),
        isNull(venueResources.parentResourceId),
        eq(venueResources.active, true),
      ),
    )
    .orderBy(asc(venueResources.venueId), asc(venueResources.fieldNumber));

  // Ordered ascending, so the first row per venue is its lowest field number.
  const assigned = new Set<string>();
  for (const row of rows) {
    if (assigned.has(row.venueId)) continue;
    out[row.venueId] = row.fieldNumber;
    assigned.add(row.venueId);
  }
  return out;
}

export async function createRentalBlock(
  input: CreateBlockInput,
): Promise<CreateBlockResult> {
  const sessions = resolveSessionList(input);
  if (sessions.length === 0) {
    return { ok: false, error: "A block needs at least one session", conflicts: [] };
  }

  const fieldNumbers = await resolveVenueFieldNumbers(sessions.map((s) => s.venueId));
  const quote = quoteBlock(sessions, input.pricingContext, {
    discount: input.discount,
    depositPct: input.depositPct,
  });

  const markerSlots: MarkerSlot[] = quote.sessions.map((s) => ({
    venueId: s.venueId,
    fieldNumber: fieldNumbers[s.venueId] ?? 1,
    startsAt: s.startsAt,
    endsAt: s.endsAt,
  }));

  const db = getDb();
  const now = new Date();
  const discountKind = input.discount?.kind ?? null;
  const discountValue = input.discount?.value ?? null;

  const blockValues = {
    organizationId: input.organizationId,
    locationId: input.locationId,
    brand: input.brand,
    label: input.label,
    renterUserId: input.renterUserId,
    renterName: input.renterName,
    renterEmail: input.renterEmail,
    renterPhone: input.renterPhone,
    partySize: input.partySize,
    purpose: input.purpose,
    notes: input.notes,
    subtotalCents: quote.subtotalCents,
    discountKind,
    discountValue,
    totalCents: quote.totalCents,
    depositPctSnapshot: input.depositPct,
    depositDueCents: quote.depositDueCents,
    balanceDueCents: quote.balanceDueCents,
    createdByUserId: input.createdByUserId,
  };

  // Drafts hold nothing firm: block row + expiring quote markers, no sessions.
  // The generator input plus the admin's per-row edits are stored so the draft
  // can be reopened and re-checked against current availability.
  if (input.mode === "draft") {
    const [block] = await db
      .insert(fieldRentalBlocks)
      .values({
        ...blockValues,
        status: "draft",
        pattern: {
          pattern: input.pattern,
          excludedKeys: input.excludedKeys ?? [],
          sessionOverrides: input.sessionOverrides ?? {},
          extraSessions: (input.extraSessions ?? []).map((s) => ({
            ...s,
            startsAt: s.startsAt.toISOString(),
            endsAt: s.endsAt.toISOString(),
          })),
        },
      })
      .returning();
    await replaceQuoteMarkers(block.id, markerSlots, input.rateCard.quoteMarkerTtlDays);
    return { ok: true, blockId: block.id, sessionIds: [] };
  }

  const depositExpiresAt =
    input.mode === "send_deposit"
      ? new Date(now.getTime() + input.rateCard.blockHoldHours * 3_600_000)
      : null;
  const balanceDueAt = deriveBalanceDueAt(
    quote.sessions[0].startsAt,
    input.rateCard.balanceDueLeadDays,
  );

  // Deterministic lock order: venue, then field number, then start time. Two
  // admins committing overlapping blocks take the same advisory locks in the
  // same sequence and cannot deadlock.
  const ordered = [...quote.sessions].sort((a, b) => {
    if (a.venueId !== b.venueId) return a.venueId < b.venueId ? -1 : 1;
    const fa = fieldNumbers[a.venueId] ?? 1;
    const fb = fieldNumbers[b.venueId] ?? 1;
    if (fa !== fb) return fa - fb;
    return a.startsAt.getTime() - b.startsAt.getTime();
  });

  // Resource ids are resolved BEFORE the transaction. assertNoBlockConflict
  // runs on the caller's tx, but resolveTopLevelResourceId goes through the
  // pool — issuing pool queries while holding a transaction is what the
  // ledger module warns against.
  const resourceIds = new Map<string, string | null>();
  for (const s of ordered) {
    const fieldNumber = fieldNumbers[s.venueId] ?? 1;
    const cacheKey = `${s.venueId}|${fieldNumber}`;
    if (!resourceIds.has(cacheKey)) {
      resourceIds.set(cacheKey, await resolveTopLevelResourceId(s.venueId, fieldNumber));
    }
  }

  const conflicts: Array<{ key: string; reason: string }> = [];
  let committed: { blockId: string; sessionIds: string[] } | null = null;

  try {
    committed = await db.transaction(async (tx) => {
      const [block] = await tx
        .insert(fieldRentalBlocks)
        .values({
          ...blockValues,
          status: input.mode === "send_deposit" ? "awaiting_deposit" : "active",
          offlinePaymentMethod:
            input.mode === "paid_offline" ? input.offlinePaymentMethod : null,
          depositExpiresAt,
          depositPaidAt: input.mode === "paid_offline" ? now : null,
          balancePaidAt: input.mode === "paid_offline" ? now : null,
          balanceDueAt,
          pattern: {
            pattern: input.pattern,
            excludedKeys: input.excludedKeys ?? [],
            sessionOverrides: input.sessionOverrides ?? {},
            extraSessions: (input.extraSessions ?? []).map((s) => ({
              ...s,
              startsAt: s.startsAt.toISOString(),
              endsAt: s.endsAt.toISOString(),
            })),
          },
        })
        .returning();

      for (const s of ordered) {
        const fieldNumber = fieldNumbers[s.venueId] ?? 1;
        const rentalConflict = await assertNoRentalConflict(tx, {
          venueId: s.venueId,
          fieldNumber,
          startsAt: s.startsAt,
          endsAt: s.endsAt,
        });
        if (rentalConflict) {
          conflicts.push({ key: s.key, reason: rentalConflict });
          continue;
        }

        const resourceId = resourceIds.get(`${s.venueId}|${fieldNumber}`) ?? null;
        if (!resourceId) continue; // Not inventory-tracked; the ledger has nothing to say.
        try {
          await assertNoBlockConflict(tx, {
            resourceId,
            startsAt: s.startsAt,
            endsAt: s.endsAt,
          });
        } catch (err) {
          if (err instanceof BlockConflictError) {
            conflicts.push({ key: s.key, reason: err.message });
            continue;
          }
          throw err;
        }
      }

      if (conflicts.length > 0) throw new BlockCommitAbort();

      const sessionIds: string[] = [];
      for (const s of ordered) {
        const fieldNumber = fieldNumbers[s.venueId] ?? 1;
        const [rental] = await tx
          .insert(fieldRentals)
          .values({
            blockId: block.id,
            organizationId: input.organizationId,
            venueId: s.venueId,
            fieldNumber,
            startsAt: s.startsAt,
            endsAt: s.endsAt,
            source: "admin_created",
            brand: input.brand,
            renterUserId: input.renterUserId,
            renterName: input.renterName,
            renterEmail: input.renterEmail,
            renterPhone: input.renterPhone,
            partySize: input.partySize,
            purpose: input.purpose,
            notes: input.notes,
            amountDueCents: s.allocatedCents,
            createdByUserId: input.createdByUserId,
            ...(input.mode === "send_deposit"
              ? {
                  status: "pending_payment" as const,
                  paymentMethod: "card_online" as const,
                  paymentStatus: "unpaid" as const,
                  amountPaidCents: 0,
                  paymentExpiresAt: depositExpiresAt,
                }
              : {
                  status: "confirmed" as const,
                  paymentMethod: (input.offlinePaymentMethod ?? "cash") as "cash" | "comp",
                  paymentStatus: "paid" as const,
                  amountPaidCents: s.allocatedCents,
                  paymentExpiresAt: null,
                }),
          })
          .returning({ id: fieldRentals.id });
        sessionIds.push(rental.id);
      }

      return { blockId: block.id, sessionIds };
    });
  } catch (err) {
    if (err instanceof BlockCommitAbort) {
      return {
        ok: false,
        error: `${conflicts.length} session${conflicts.length === 1 ? "" : "s"} conflict with existing bookings`,
        conflicts,
      };
    }
    throw err;
  }

  // Ledger sync runs after the commit: upsertSourceBlock opens its own
  // transaction, so it cannot run inside ours. Sequential, because each upsert
  // takes the family-root advisory lock and a parallel wave would just queue
  // on it anyway. A ledger conflict compensates the whole block, mirroring
  // withLedgerSync in booking.ts.
  try {
    for (const sessionId of committed.sessionIds) {
      await syncRentalBlock(sessionId);
    }
  } catch (err) {
    if (err instanceof BlockConflictError) {
      await cancelCommittedBlock(committed.blockId, committed.sessionIds);
      return {
        ok: false,
        error: `Ledger conflict: ${err.message}`,
        conflicts: [{ key: "", reason: err.message }],
      };
    }
    throw err;
  }

  // Committing supersedes any soft hold this block was carrying as a draft.
  await clearQuoteMarkers(committed.blockId);
  return { ok: true, blockId: committed.blockId, sessionIds: committed.sessionIds };
}

/** Compensation for a ledger conflict discovered after the commit. */
async function cancelCommittedBlock(blockId: string, sessionIds: string[]): Promise<void> {
  const db = getDb();
  const now = new Date();
  if (sessionIds.length > 0) {
    await db
      .update(fieldRentals)
      .set({
        status: "cancelled",
        cancelledAt: now,
        cancellationReason: "venue_unavailable",
        updatedAt: now,
      })
      .where(inArray(fieldRentals.id, sessionIds));
  }
  await db
    .update(fieldRentalBlocks)
    .set({ status: "cancelled", cancelledAt: now, updatedAt: now })
    .where(eq(fieldRentalBlocks.id, blockId));
}
