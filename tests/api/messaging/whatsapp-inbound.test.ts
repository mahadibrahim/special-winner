import { describe, it, expect } from "vitest"
import { getDb } from "@/lib/db"
import { users } from "@/lib/db/schema/users"
import { phoneOptIns } from "@/lib/db/schema/phone-verifications"
import { conversationMessages } from "@/lib/db/schema/conversations"
import { eq } from "drizzle-orm"
import { handleInboundWhatsApp } from "@/lib/messaging/inbound-whatsapp"
import { createAdminOrgGameContext } from "../../utils/admin-org-game-context"

/** A 10-digit US phone unlikely to collide with seeded/other-test data. */
function uniquePhone(): string {
  return "9" + String(Date.now()).slice(-6) + String(Math.floor(Math.random() * 1000)).padStart(3, "0")
}

async function seedUser(phone: string | null): Promise<string> {
  const db = getDb()
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e9)}`
  const [user] = await db
    .insert(users)
    .values({ email: `wa-in-${stamp}@test.aspiresports.com`, phone })
    .returning()
  return user.id
}

async function seedOptIn(userId: string, organizationId: string, phone: string): Promise<void> {
  const db = getDb()
  await db.insert(phoneOptIns).values({
    organizationId,
    userId,
    phone,
    status: "opted_in",
    optedInAt: new Date(),
  })
}

describe("handleInboundWhatsApp", () => {
  it("records an inbound whatsapp message and routes it for a known sender", async () => {
    const ctx = await createAdminOrgGameContext()
    const phone = uniquePhone()
    const userId = await seedUser(phone)
    await seedOptIn(userId, ctx.organizationId, phone)

    const result = await handleInboundWhatsApp({
      senderPhone: `+1${phone}`,
      body: "Is practice still on tonight?",
      externalMessageId: "wamid.TEST-1",
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.parentUserId).toBe(userId)

    const db = getDb()
    const [msg] = await db
      .select()
      .from(conversationMessages)
      .where(eq(conversationMessages.externalMessageId, "wamid.TEST-1"))
      .limit(1)
    expect(msg).toBeDefined()
    expect(msg.channel).toBe("whatsapp")
    expect(msg.direction).toBe("inbound")
    expect(msg.senderType).toBe("parent")
    expect(msg.senderUserId).toBe(userId)
    expect(msg.body).toBe("Is practice still on tonight?")
    expect(msg.conversationId).toBe(result.conversationId)
  })

  it("returns unknown_sender when no user has that phone", async () => {
    const result = await handleInboundWhatsApp({
      senderPhone: `+1${uniquePhone()}`,
      body: "hello",
      externalMessageId: "wamid.NOBODY",
    })
    expect(result).toEqual({ ok: false, reason: "unknown_sender" })
  })

  it("returns no_org_context when the sender has no opt-in record", async () => {
    const phone = uniquePhone()
    await seedUser(phone)

    const result = await handleInboundWhatsApp({
      senderPhone: `+1${phone}`,
      body: "hello",
      externalMessageId: "wamid.NOORG",
    })
    expect(result).toEqual({ ok: false, reason: "no_org_context" })
  })
})
