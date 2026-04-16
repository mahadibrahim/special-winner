/**
 * Phase 1 demo seed data.
 *
 * Populates the messaging layer with realistic fake conversations,
 * messages, and bot actions so the staff inbox and admin dashboard
 * look populated during demos, without requiring real SMS/phone numbers.
 *
 * Run with: npx tsx src/lib/db/seeds/seed-phase1-demo.ts
 *
 * Assumes the E2E seed has already run (it creates the test parent
 * account we attach conversations to). If the test parent isn't found,
 * this script exits with a friendly error message.
 *
 * Idempotent: safe to run multiple times. Re-running will add NEW
 * conversations on top of whatever exists — it doesn't wipe.
 */

import "dotenv/config";

import { and, eq } from "drizzle-orm";
import { getDb } from "../index";
import {
  users,
  organizations,
  conversations,
  conversationMessages,
  botActionsLog,
  phoneOptIns,
} from "../schema";

interface SampleMessage {
  direction: "inbound" | "outbound";
  channel: "sms" | "email" | "telegram";
  senderType: "parent" | "bot" | "coach" | "admin";
  body: string;
  hoursAgo: number;
  intent?: {
    intent: string;
    confidence: number;
    action: string;
    reasoning: string;
  };
}

interface SampleConversation {
  parentFirstName: string;
  parentLastName: string;
  parentEmail: string;
  parentPhone: string;
  assignmentRole: "bot" | "coach" | "admin";
  messages: SampleMessage[];
  botActions?: Array<{
    actionType: string;
    success: boolean;
    reversible: boolean;
    hoursAgo: number;
  }>;
}

const SAMPLE_CONVERSATIONS: SampleConversation[] = [
  {
    parentFirstName: "Sarah",
    parentLastName: "Chen",
    parentEmail: "sarah.chen@demo.aspire.local",
    parentPhone: "+16145550101",
    assignmentRole: "bot",
    messages: [
      {
        direction: "inbound",
        channel: "sms",
        senderType: "parent",
        body: "when is Maya's next practice?",
        hoursAgo: 3,
        intent: {
          intent: "schedule_query",
          confidence: 0.94,
          action: "bot_respond",
          reasoning: "Clear schedule query with named kid",
        },
      },
      {
        direction: "outbound",
        channel: "sms",
        senderType: "bot",
        body: "Maya's next practice: Tue Apr 21 at 5:00 PM, Powell Main (field 2).",
        hoursAgo: 3,
      },
      {
        direction: "inbound",
        channel: "sms",
        senderType: "parent",
        body: "thanks!",
        hoursAgo: 2.9,
        intent: {
          intent: "general_chitchat",
          confidence: 0.88,
          action: "bot_respond",
          reasoning: "Gratitude, no action needed",
        },
      },
    ],
  },
  {
    parentFirstName: "Marcus",
    parentLastName: "Johnson",
    parentEmail: "marcus.johnson@demo.aspire.local",
    parentPhone: "+16145550102",
    assignmentRole: "bot",
    messages: [
      {
        direction: "inbound",
        channel: "sms",
        senderType: "parent",
        body: "Tyler is sick today, he's going to miss practice tonight",
        hoursAgo: 1.2,
        intent: {
          intent: "rsvp_absent",
          confidence: 0.92,
          action: "bot_execute",
          reasoning: "Clear absence notification for named kid + time",
        },
      },
      {
        direction: "outbound",
        channel: "sms",
        senderType: "bot",
        body: "Got it — marked Tyler out for tonight's practice. Coach will be notified. Feel better, Tyler!",
        hoursAgo: 1.2,
      },
    ],
    botActions: [
      {
        actionType: "rsvp_absent",
        success: true,
        reversible: true,
        hoursAgo: 1.2,
      },
    ],
  },
  {
    parentFirstName: "Priya",
    parentLastName: "Patel",
    parentEmail: "priya.patel@demo.aspire.local",
    parentPhone: "+16145550103",
    assignmentRole: "admin",
    messages: [
      {
        direction: "inbound",
        channel: "email",
        senderType: "parent",
        body:
          "Hi, I noticed I was charged twice for Aanya's spring registration. Can you look into this and refund the duplicate charge? Both charges show $120 on my Visa ending in 8822. The registration should be for Powell Spring Soccer U10. Let me know, thanks!",
        hoursAgo: 5,
        intent: {
          intent: "payment_question",
          confidence: 0.97,
          action: "route_to_admin",
          reasoning: "Double-charge claim, needs admin investigation",
        },
      },
      {
        direction: "outbound",
        channel: "email",
        senderType: "bot",
        body: "Thanks — an Aspire admin will follow up shortly.",
        hoursAgo: 5,
      },
    ],
  },
  {
    parentFirstName: "James",
    parentLastName: "O'Brien",
    parentEmail: "james.obrien@demo.aspire.local",
    parentPhone: "+16145550104",
    assignmentRole: "coach",
    messages: [
      {
        direction: "inbound",
        channel: "sms",
        senderType: "parent",
        body:
          "Liam took a hard hit in practice yesterday and his ankle is pretty swollen. Is it ok to come to the game Saturday or should he sit out?",
        hoursAgo: 8,
        intent: {
          intent: "coach_question",
          confidence: 0.91,
          action: "route_to_coach",
          reasoning: "Injury judgment call — coach needs to make the call",
        },
      },
      {
        direction: "outbound",
        channel: "sms",
        senderType: "bot",
        body: "Thanks — I'm passing this to your coach. They'll get back to you soon.",
        hoursAgo: 8,
      },
      {
        direction: "outbound",
        channel: "sms",
        senderType: "coach",
        body:
          "Hi James — Coach Dan here. Let's rest Liam through the weekend — better to miss one game than push through a sprain. Ice it, elevate it, and we'll reassess Monday before the next practice. Hope he feels better soon.",
        hoursAgo: 7,
      },
      {
        direction: "inbound",
        channel: "sms",
        senderType: "parent",
        body: "Thanks Coach Dan, appreciate it. We'll keep him home Saturday.",
        hoursAgo: 7,
      },
    ],
  },
  {
    parentFirstName: "Elena",
    parentLastName: "Rodriguez",
    parentEmail: "elena.rodriguez@demo.aspire.local",
    parentPhone: "+16145550105",
    assignmentRole: "bot",
    messages: [
      {
        direction: "inbound",
        channel: "telegram",
        senderType: "parent",
        body: "who's Sofia's coach this season?",
        hoursAgo: 22,
        intent: {
          intent: "schedule_query",
          confidence: 0.89,
          action: "bot_respond",
          reasoning: "Coach lookup for named kid",
        },
      },
      {
        direction: "outbound",
        channel: "telegram",
        senderType: "bot",
        body: "Sofia is on Powell U8 Thunder — Coach Rachel Martinez. Division: U8 Recreational.",
        hoursAgo: 22,
      },
    ],
  },
  {
    parentFirstName: "Ben",
    parentLastName: "Kim",
    parentEmail: "ben.kim@demo.aspire.local",
    parentPhone: "+16145550106",
    assignmentRole: "admin",
    messages: [
      {
        direction: "inbound",
        channel: "sms",
        senderType: "parent",
        body: "can I switch Jake to the Tuesday/Thursday practice group instead of Monday/Wednesday?",
        hoursAgo: 48,
        intent: {
          intent: "admin_question",
          confidence: 0.95,
          action: "route_to_admin",
          reasoning: "Roster change request, admin-only",
        },
      },
      {
        direction: "outbound",
        channel: "sms",
        senderType: "bot",
        body: "Thanks — an Aspire admin will follow up shortly.",
        hoursAgo: 48,
      },
      {
        direction: "outbound",
        channel: "sms",
        senderType: "admin",
        body:
          "Hey Ben — checked and the Tues/Thurs group has room. I'll move Jake starting next week and send a confirmation email with the new schedule. Sound good?",
        hoursAgo: 47,
      },
      {
        direction: "inbound",
        channel: "sms",
        senderType: "parent",
        body: "perfect, thank you!",
        hoursAgo: 47,
      },
    ],
  },
];

async function seedPhase1Demo() {
  const db = getDb();

  console.log("→ Looking up test organization...");
  const [org] = await db.select().from(organizations).limit(1);

  if (!org) {
    console.error("✗ No organization found. Run `npm run db:seed` first.");
    process.exit(1);
  }

  console.log(`  Using organization: ${org.name} (${org.id})`);

  let conversationsCreated = 0;
  let messagesCreated = 0;
  let botActionsCreated = 0;
  let parentsCreated = 0;

  for (const sample of SAMPLE_CONVERSATIONS) {
    // Find or create the fake parent
    const [existingParent] = await db
      .select()
      .from(users)
      .where(eq(users.email, sample.parentEmail))
      .limit(1);

    let parentUserId: string;

    if (existingParent) {
      parentUserId = existingParent.id;
      console.log(`  Parent ${sample.parentEmail} already exists — reusing`);
    } else {
      const [newParent] = await db
        .insert(users)
        .values({
          email: sample.parentEmail,
          firstName: sample.parentFirstName,
          lastName: sample.parentLastName,
          phone: sample.parentPhone,
          phoneVerified: true,
          messagingPrimaryChannel:
            sample.messages[0]?.channel === "email" ? "email" : "sms",
          emailVerified: true,
        })
        .returning({ id: users.id });
      parentUserId = newParent.id;
      parentsCreated++;

      // Give them an opted-in phone record for this org
      await db
        .insert(phoneOptIns)
        .values({
          organizationId: org.id,
          userId: parentUserId,
          phone: sample.parentPhone,
          status: "opted_in",
          optedInAt: new Date(),
          optInSource: "registration_form",
        })
        .onConflictDoNothing();
    }

    // Create the conversation
    const [newConversation] = await db
      .insert(conversations)
      .values({
        organizationId: org.id,
        parentUserId,
        status: "active",
        assignmentRole: sample.assignmentRole,
        lastMessageAt: new Date(
          Date.now() -
            (sample.messages[sample.messages.length - 1]?.hoursAgo ?? 0) *
              60 *
              60 *
              1000,
        ),
      })
      .returning({ id: conversations.id });
    conversationsCreated++;

    // Insert messages
    for (const msg of sample.messages) {
      const createdAt = new Date(Date.now() - msg.hoursAgo * 60 * 60 * 1000);
      await db.insert(conversationMessages).values({
        conversationId: newConversation.id,
        organizationId: org.id,
        direction: msg.direction,
        channel: msg.channel,
        senderType: msg.senderType,
        senderUserId: msg.senderType === "parent" ? parentUserId : null,
        body: msg.body,
        intentClassification: msg.intent ?? null,
        deliveredAt: createdAt,
        createdAt,
      });
      messagesCreated++;
    }

    // Update conversation lastInboundAt / lastOutboundAt
    const lastInbound = sample.messages
      .filter((m) => m.direction === "inbound")
      .sort((a, b) => a.hoursAgo - b.hoursAgo)[0];
    const lastOutbound = sample.messages
      .filter((m) => m.direction === "outbound")
      .sort((a, b) => a.hoursAgo - b.hoursAgo)[0];

    await db
      .update(conversations)
      .set({
        lastInboundAt: lastInbound
          ? new Date(Date.now() - lastInbound.hoursAgo * 60 * 60 * 1000)
          : null,
        lastOutboundAt: lastOutbound
          ? new Date(Date.now() - lastOutbound.hoursAgo * 60 * 60 * 1000)
          : null,
      })
      .where(eq(conversations.id, newConversation.id));

    // Insert bot actions if any
    if (sample.botActions) {
      for (const action of sample.botActions) {
        await db.insert(botActionsLog).values({
          conversationId: newConversation.id,
          organizationId: org.id,
          actionType: action.actionType,
          success: action.success,
          reversible: action.reversible,
          createdAt: new Date(Date.now() - action.hoursAgo * 60 * 60 * 1000),
        });
        botActionsCreated++;
      }
    }

    console.log(
      `  ✓ ${sample.parentFirstName} ${sample.parentLastName} — ${sample.messages.length} messages, ${sample.assignmentRole}`,
    );
  }

  console.log("");
  console.log(`Done. Created:`);
  console.log(`  - ${parentsCreated} new parent users (existing ones reused)`);
  console.log(`  - ${conversationsCreated} conversations`);
  console.log(`  - ${messagesCreated} messages`);
  console.log(`  - ${botActionsCreated} bot action log entries`);
  console.log("");
  console.log("Visit /admin to see the Recent Conversations widget populated,");
  console.log("and /messages to browse the staff inbox.");
}

seedPhase1Demo()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  });
