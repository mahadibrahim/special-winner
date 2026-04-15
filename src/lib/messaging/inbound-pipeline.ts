import { and, eq, gte, lte, inArray, asc, desc, or } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema/users";
import { organizations } from "@/lib/db/schema/organizations";
import { familyMembers, registrations } from "@/lib/db/schema/registrations";
import { rosters, games, teams, venues } from "@/lib/db/schema/teams";
import {
  conversations,
  conversationMessages,
  botActionsLog,
} from "@/lib/db/schema/conversations";
import {
  classifyMessage,
  EXECUTE_THRESHOLD,
  CONFIRM_THRESHOLD,
  type ClassifiedIntent,
  type ClassifierContext,
} from "@/lib/llm/classifier";
import { getAction } from "@/lib/bot/actions/registry";
import { sendToParent } from "./gateway";

/**
 * Inbound pipeline — the glue between webhooks and bot/routing logic.
 *
 * Called by SMS and email inbound webhooks after they've already recorded
 * the raw inbound message. This pipeline:
 *  1. Builds a classifier context (kids, teams, upcoming events, recent conversation)
 *  2. Invokes the classifier to get an intent decision
 *  3. Updates the inbound conversation_messages row with the classification
 *  4. Dispatches based on the classifier action:
 *     - bot_respond: generate response from suggested text, send via gateway
 *     - bot_execute: validate action, check confidence, maybe confirm, execute
 *     - route_to_coach / route_to_admin: assign conversation, notify staff
 *
 * All errors are caught and logged — a failed classification never loses the
 * parent's message. Worst case: the conversation lands in admin inbox with a
 * "classification failed" note.
 */

export interface InboundPipelineInput {
  conversationId: string;
  organizationId: string;
  parentUserId: string;
  messageId: string;
  messageBody: string;
  channel: "sms" | "email" | "telegram" | "web";
}

export async function routeInboundMessage(
  input: InboundPipelineInput,
): Promise<void> {
  try {
    const context = await buildClassifierContext(input);
    const result = await classifyMessage({
      message: input.messageBody,
      context,
    });

    await updateInboundMessageClassification(input.messageId, result);

    await dispatchByAction(input, result);
  } catch (err) {
    console.error("Inbound pipeline fatal error:", err);
    await escalateOnFailure(input, err);
  }
}

// ------------------------------------------------------------
// Classifier context builder
// ------------------------------------------------------------

async function buildClassifierContext(
  input: InboundPipelineInput,
): Promise<ClassifierContext> {
  const db = getDb();

  const [parent] = await db
    .select({
      id: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
    })
    .from(users)
    .where(eq(users.id, input.parentUserId))
    .limit(1);

  const [org] = await db
    .select({ id: organizations.id, name: organizations.name })
    .from(organizations)
    .where(eq(organizations.id, input.organizationId))
    .limit(1);

  // Kids linked to this parent (via the direct FK on family_members)
  const kids = await db
    .select({
      id: familyMembers.id,
      firstName: familyMembers.firstName,
      birthDate: familyMembers.birthDate,
    })
    .from(familyMembers)
    .where(eq(familyMembers.parentUserId, input.parentUserId));

  // For each kid, find their teams via registrations → rosters
  const kidContexts = await Promise.all(
    kids.map(async (kid) => {
      const teamList = await db
        .select({
          id: teams.id,
          name: teams.name,
        })
        .from(rosters)
        .innerJoin(registrations, eq(registrations.id, rosters.registrationId))
        .innerJoin(teams, eq(teams.id, rosters.teamId))
        .where(eq(registrations.familyMemberId, kid.id));

      const age = kid.birthDate
        ? Math.floor(
            (Date.now() - new Date(kid.birthDate).getTime()) /
              (365.25 * 24 * 60 * 60 * 1000),
          )
        : null;

      return {
        id: kid.id,
        firstName: kid.firstName,
        age,
        teams: teamList.map((t) => ({
          id: t.id,
          name: t.name,
          coachName: null as string | null,
          sport: null as string | null,
        })),
      };
    }),
  );

  // Upcoming events for the kids' teams (next 14 days)
  const allTeamIds = kidContexts.flatMap((k) => k.teams.map((t) => t.id));
  const now = new Date();
  const fortnight = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

  const upcomingEvents =
    allTeamIds.length > 0
      ? await db
          .select({
            id: games.id,
            scheduledAt: games.scheduledAt,
            venueName: venues.name,
            homeTeamName: teams.name,
          })
          .from(games)
          .leftJoin(teams, eq(teams.id, games.homeTeamId))
          .leftJoin(venues, eq(venues.id, games.venueId))
          .where(
            and(
              or(
                inArray(games.homeTeamId, allTeamIds),
                inArray(games.awayTeamId, allTeamIds),
              ),
              gte(games.scheduledAt, now),
              lte(games.scheduledAt, fortnight),
            ),
          )
          .orderBy(asc(games.scheduledAt))
          .limit(10)
      : [];

  const filteredEvents = upcomingEvents.map((e) => ({
    id: e.id,
    type: "game" as const,
    scheduledAt: e.scheduledAt!.toISOString(),
    location: e.venueName,
    teamName: e.homeTeamName,
  }));

  // Recent conversation (last 5 messages, excluding the current one)
  const recent = await db
    .select({
      direction: conversationMessages.direction,
      senderType: conversationMessages.senderType,
      body: conversationMessages.body,
    })
    .from(conversationMessages)
    .where(eq(conversationMessages.conversationId, input.conversationId))
    .orderBy(desc(conversationMessages.createdAt))
    .limit(6);

  const recentConversation = recent
    .slice(1) // drop the just-arrived message
    .reverse()
    .map((m) => ({
      direction: m.direction as "inbound" | "outbound",
      sender: m.senderType,
      body: m.body,
    }));

  // Pending confirmation
  const [currentConversation] = await db
    .select({ pendingConfirmation: conversations.pendingConfirmation })
    .from(conversations)
    .where(eq(conversations.id, input.conversationId))
    .limit(1);

  const pendingConfirmation = currentConversation?.pendingConfirmation as
    | {
        actionName: string;
        params: Record<string, unknown>;
        confirmationBody: string;
      }
    | null
    | undefined;

  return {
    parentName: `${parent?.firstName ?? ""} ${parent?.lastName ?? ""}`.trim() || "Parent",
    parentUserId: input.parentUserId,
    organizationId: input.organizationId,
    organizationName: org?.name ?? "Aspire Sports",
    kids: kidContexts,
    upcomingEvents: filteredEvents,
    recentConversation,
    pendingConfirmation: pendingConfirmation ?? null,
  };
}

// ------------------------------------------------------------
// Classification persistence
// ------------------------------------------------------------

async function updateInboundMessageClassification(
  messageId: string,
  result: ClassifiedIntent,
): Promise<void> {
  const db = getDb();
  await db
    .update(conversationMessages)
    .set({
      intentClassification: {
        intent: result.intent,
        confidence: result.confidence,
        action: result.action,
        reasoning: result.reasoning,
        routingReason: result.routingReason,
      },
    })
    .where(eq(conversationMessages.id, messageId));
}

// ------------------------------------------------------------
// Action dispatch
// ------------------------------------------------------------

async function dispatchByAction(
  input: InboundPipelineInput,
  result: ClassifiedIntent,
): Promise<void> {
  // If the parent is responding to a pending confirmation, handle that specially.
  const db = getDb();
  const [conv] = await db
    .select({ pendingConfirmation: conversations.pendingConfirmation })
    .from(conversations)
    .where(eq(conversations.id, input.conversationId))
    .limit(1);

  const pending = conv?.pendingConfirmation as
    | {
        actionName: string;
        params: Record<string, unknown>;
        confirmationBody: string;
      }
    | null
    | undefined;

  if (pending && isConfirmationResponse(input.messageBody)) {
    await handlePendingConfirmation(input, pending, input.messageBody);
    return;
  }

  // Normal dispatch flow
  if (result.action === "bot_respond") {
    await handleBotRespond(input, result);
    return;
  }

  if (result.action === "bot_execute") {
    await handleBotExecute(input, result);
    return;
  }

  if (result.action === "route_to_coach" || result.action === "route_to_admin") {
    await handleRouteToHuman(input, result);
    return;
  }
}

async function handleBotRespond(
  input: InboundPipelineInput,
  result: ClassifiedIntent,
): Promise<void> {
  // If the suggested response from the classifier looks usable, send it.
  // Otherwise, fall back to a generic acknowledgment and route to admin.
  let body = result.suggestedResponse?.trim() || "";

  // For lookup-style intents, execute the action to get the real data
  if (result.intent === "schedule_query") {
    const lookupAction = getAction("lookup_schedule");
    if (lookupAction) {
      const actionResult = await lookupAction.handler(
        {},
        {
          parentUserId: input.parentUserId,
          organizationId: input.organizationId,
          conversationId: input.conversationId,
          triggeringMessageId: input.messageId,
        },
      );
      if (actionResult.ok) {
        body = actionResult.responseBody;
      }
    }
  }

  if (!body) {
    body = "Got it — an Aspire admin will follow up shortly.";
    await assignToAdmin(input.conversationId, "Empty bot response fallback");
  }

  await sendToParent({
    parentUserId: input.parentUserId,
    organizationId: input.organizationId,
    body,
    conversationId: input.conversationId,
    senderType: "bot",
  });
}

async function handleBotExecute(
  input: InboundPipelineInput,
  result: ClassifiedIntent,
): Promise<void> {
  if (!result.executableAction) {
    // Classifier said execute but didn't provide the action — route to admin
    await handleRouteToHuman(input, {
      ...result,
      action: "route_to_admin",
      routingReason: "Classifier returned bot_execute without an action",
    });
    return;
  }

  const action = getAction(result.executableAction.name);
  if (!action) {
    // Unknown action — route
    await handleRouteToHuman(input, {
      ...result,
      action: "route_to_admin",
      routingReason: `Unknown action: ${result.executableAction.name}`,
    });
    return;
  }

  // Low-confidence mutations go through confirmation
  const needsConfirmation =
    action.requiresConfirmation ||
    result.executableAction.requiresConfirmation ||
    (!action.readOnly && result.confidence < EXECUTE_THRESHOLD);

  if (needsConfirmation) {
    await promptConfirmation(input, result.executableAction, action);
    return;
  }

  // Execute directly
  const actionResult = await action.handler(result.executableAction.params, {
    parentUserId: input.parentUserId,
    organizationId: input.organizationId,
    conversationId: input.conversationId,
    triggeringMessageId: input.messageId,
  });

  await logBotAction(input, action, result.executableAction, actionResult);

  if (actionResult.ok) {
    await sendToParent({
      parentUserId: input.parentUserId,
      organizationId: input.organizationId,
      body: actionResult.responseBody,
      conversationId: input.conversationId,
      senderType: "bot",
    });
  } else {
    // Action failed — notify parent and optionally escalate
    await sendToParent({
      parentUserId: input.parentUserId,
      organizationId: input.organizationId,
      body: actionResult.responseBody,
      conversationId: input.conversationId,
      senderType: "bot",
    });
    if (actionResult.suggestEscalation) {
      await assignToAdmin(input.conversationId, actionResult.errorReason);
    }
  }
}

async function promptConfirmation(
  input: InboundPipelineInput,
  executable: NonNullable<ClassifiedIntent["executableAction"]>,
  _action: ReturnType<typeof getAction>,
): Promise<void> {
  const db = getDb();
  const confirmationBody = buildConfirmationPrompt(executable);

  await db
    .update(conversations)
    .set({
      pendingConfirmation: {
        actionName: executable.name,
        params: executable.params,
        confirmationBody,
      },
      updatedAt: new Date(),
    })
    .where(eq(conversations.id, input.conversationId));

  await sendToParent({
    parentUserId: input.parentUserId,
    organizationId: input.organizationId,
    body: `${confirmationBody} Reply YES to confirm, NO if that's not right.`,
    conversationId: input.conversationId,
    senderType: "bot",
  });
}

function buildConfirmationPrompt(
  executable: NonNullable<ClassifiedIntent["executableAction"]>,
): string {
  // Simple per-action confirmation copy. Future work: per-action custom copy
  // inside each action definition.
  if (executable.name === "rsvp_absent") {
    return `Mark ${executable.params.kidName ?? "your kid"} absent for ${executable.params.eventName ?? "that event"}?`;
  }
  if (executable.name === "rsvp_present") {
    return `Undo the absent mark for ${executable.params.kidName ?? "your kid"}?`;
  }
  if (executable.name === "switch_primary_channel") {
    return `Switch your primary messaging channel to ${executable.params.channel}?`;
  }
  return `Confirm: run ${executable.name}?`;
}

async function handlePendingConfirmation(
  input: InboundPipelineInput,
  pending: {
    actionName: string;
    params: Record<string, unknown>;
    confirmationBody: string;
  },
  messageBody: string,
): Promise<void> {
  const db = getDb();
  const isYes = /^(yes|y|confirm|do it|ok|okay|yep|yeah|sure)\b/i.test(
    messageBody.trim(),
  );
  const isNo = /^(no|n|cancel|nope|stop|don'?t)\b/i.test(messageBody.trim());

  // Clear the pending confirmation regardless of outcome
  await db
    .update(conversations)
    .set({ pendingConfirmation: null, updatedAt: new Date() })
    .where(eq(conversations.id, input.conversationId));

  if (isNo) {
    await sendToParent({
      parentUserId: input.parentUserId,
      organizationId: input.organizationId,
      body: "No problem — I've cancelled that. Let me know if you need anything else.",
      conversationId: input.conversationId,
      senderType: "bot",
    });
    return;
  }

  if (!isYes) {
    // Ambiguous response — re-prompt or escalate
    await sendToParent({
      parentUserId: input.parentUserId,
      organizationId: input.organizationId,
      body: `I didn't quite catch that. ${pending.confirmationBody} Reply YES or NO.`,
      conversationId: input.conversationId,
      senderType: "bot",
    });
    // Re-apply the pending confirmation so the next reply is still recognized
    await db
      .update(conversations)
      .set({ pendingConfirmation: pending, updatedAt: new Date() })
      .where(eq(conversations.id, input.conversationId));
    return;
  }

  // YES — execute
  const action = getAction(pending.actionName);
  if (!action) {
    await sendToParent({
      parentUserId: input.parentUserId,
      organizationId: input.organizationId,
      body: "Something went wrong on my end. An admin will follow up shortly.",
      conversationId: input.conversationId,
      senderType: "bot",
    });
    await assignToAdmin(
      input.conversationId,
      `Confirmed action ${pending.actionName} not found in registry`,
    );
    return;
  }

  const actionResult = await action.handler(pending.params, {
    parentUserId: input.parentUserId,
    organizationId: input.organizationId,
    conversationId: input.conversationId,
    triggeringMessageId: input.messageId,
  });

  await logBotAction(
    input,
    action,
    {
      name: pending.actionName,
      params: pending.params,
    },
    actionResult,
  );

  await sendToParent({
    parentUserId: input.parentUserId,
    organizationId: input.organizationId,
    body: actionResult.responseBody,
    conversationId: input.conversationId,
    senderType: "bot",
  });

  if (!actionResult.ok && actionResult.suggestEscalation) {
    await assignToAdmin(input.conversationId, actionResult.errorReason);
  }
}

function isConfirmationResponse(body: string): boolean {
  const trimmed = body.trim();
  return (
    /^(yes|y|confirm|do it|ok|okay|yep|yeah|sure|no|n|cancel|nope|don'?t)\b/i.test(
      trimmed,
    ) && trimmed.length < 40
  );
}

async function handleRouteToHuman(
  input: InboundPipelineInput,
  result: ClassifiedIntent,
): Promise<void> {
  const assignmentRole =
    result.action === "route_to_coach" ? "coach" : "admin";

  // For coach routing, try to look up the coach for the first team the parent's kids are on.
  let assignedStaffId: string | null = null;
  if (assignmentRole === "coach") {
    assignedStaffId = await findCoachForParent(input.parentUserId);
  }

  const db = getDb();
  await db
    .update(conversations)
    .set({
      assignmentRole,
      assignedStaffId,
      updatedAt: new Date(),
    })
    .where(eq(conversations.id, input.conversationId));

  // Send a polite "a person will get back to you" reply
  const acknowledgment =
    assignmentRole === "coach"
      ? "Thanks — I'm passing this to your coach. They'll get back to you soon."
      : "Thanks — an Aspire admin will follow up shortly.";

  await sendToParent({
    parentUserId: input.parentUserId,
    organizationId: input.organizationId,
    body: acknowledgment,
    conversationId: input.conversationId,
    senderType: "bot",
  });

  // TODO: staff notification (dashboard badge + out-of-band alert) lands with
  // the staff inbox UI task. For now the routing is visible in the admin
  // messages list the moment staff loads it.
}

async function findCoachForParent(
  parentUserId: string,
): Promise<string | null> {
  const db = getDb();
  // Find the first kid → first team via family_members → registrations → rosters → teams → coach
  const rows = await db
    .select({ coachUserId: teams.coachUserId })
    .from(familyMembers)
    .innerJoin(
      registrations,
      eq(registrations.familyMemberId, familyMembers.id),
    )
    .innerJoin(rosters, eq(rosters.registrationId, registrations.id))
    .innerJoin(teams, eq(teams.id, rosters.teamId))
    .where(eq(familyMembers.parentUserId, parentUserId))
    .limit(1);

  return rows[0]?.coachUserId ?? null;
}

async function assignToAdmin(
  conversationId: string,
  reason: string,
): Promise<void> {
  const db = getDb();
  await db
    .update(conversations)
    .set({
      assignmentRole: "admin",
      updatedAt: new Date(),
    })
    .where(eq(conversations.id, conversationId));
  console.info(`Conversation ${conversationId} routed to admin: ${reason}`);
}

// ------------------------------------------------------------
// Audit logging for bot actions
// ------------------------------------------------------------

async function logBotAction(
  input: InboundPipelineInput,
  action: ReturnType<typeof getAction>,
  executable: { name: string; params: Record<string, unknown> },
  actionResult: Awaited<ReturnType<NonNullable<ReturnType<typeof getAction>>["handler"]>>,
): Promise<void> {
  if (!action) return;
  const db = getDb();
  await db.insert(botActionsLog).values({
    conversationId: input.conversationId,
    organizationId: input.organizationId,
    triggeredByMessageId: input.messageId,
    actionType: executable.name,
    actionParams: executable.params,
    success: actionResult.ok,
    errorMessage: actionResult.ok ? null : actionResult.errorReason,
    reversible: action.reversible,
  });
}

// ------------------------------------------------------------
// Error recovery
// ------------------------------------------------------------

async function escalateOnFailure(
  input: InboundPipelineInput,
  err: unknown,
): Promise<void> {
  const errorMessage = err instanceof Error ? err.message : String(err);
  console.error(
    `Escalating conversation ${input.conversationId} after pipeline error: ${errorMessage}`,
  );

  await assignToAdmin(
    input.conversationId,
    `Pipeline error: ${errorMessage.slice(0, 200)}`,
  );

  // Let the parent know a human is coming
  try {
    await sendToParent({
      parentUserId: input.parentUserId,
      organizationId: input.organizationId,
      body: "Got your message — a real person will follow up shortly.",
      conversationId: input.conversationId,
      senderType: "bot",
    });
  } catch (sendErr) {
    console.error("Failed to send escalation acknowledgment:", sendErr);
  }
}
