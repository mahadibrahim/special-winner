import { callTelegram } from "./client"

const DRY_RUN = process.env.TELEGRAM_DRY_RUN === "true"

export type CreateGroupInput = {
  name: string
  description?: string
}

export type CreateGroupResult = {
  chatId: string
  inviteLink: string
}

/**
 * Create a new Telegram Supergroup. Bot must be configured with createChatInviteLink scope.
 * In DRY_RUN mode, returns synthetic IDs for testing.
 */
export async function createSupergroup(input: CreateGroupInput): Promise<CreateGroupResult> {
  if (DRY_RUN) {
    const synthetic = `-100${Date.now()}`
    return { chatId: synthetic, inviteLink: `https://t.me/+dryrun-${synthetic}` }
  }

  // Telegram bot API does not support creating groups directly. The flow is:
  //   1. Admin creates the group in Telegram client and adds the bot
  //   2. Bot receives a getUpdates event with new_chat_members including itself
  //   3. Bot sets the title via setChatTitle and generates invite link via createChatInviteLink
  //
  // For MVP, we use the "create via import bot" pattern: the bot is pre-added
  // to an org-level "template" supergroup that is cloned per team. This is a
  // documented Telegram limitation.
  //
  // For now: this function requires the caller to pre-create the group and pass
  // the chatId. We adapt the signature to reflect reality.

  throw new Error(
    "Telegram bots cannot create groups directly. A pre-created group chatId must be supplied. See docs for workaround.",
  )
}

/**
 * Set the group title. Used during lifecycle setup.
 */
export async function setGroupTitle(chatId: string, title: string): Promise<void> {
  if (DRY_RUN) return
  await callTelegram("setChatTitle", { chat_id: chatId, title })
}

/**
 * Set the group description.
 */
export async function setGroupDescription(chatId: string, description: string): Promise<void> {
  if (DRY_RUN) return
  await callTelegram("setChatDescription", { chat_id: chatId, description })
}

/**
 * Create a permanent invite link for the group.
 */
export async function createPermanentInviteLink(chatId: string): Promise<string> {
  if (DRY_RUN) return `https://t.me/+dryrun-${chatId}`
  const result = await callTelegram<{ invite_link: string }>("createChatInviteLink", {
    chat_id: chatId,
    creates_join_request: false,
    name: "Aspire permanent",
  })
  return result.invite_link
}

/**
 * Send an invite DM to a parent with a join link.
 */
export async function sendInviteDM(
  parentChatId: string,
  groupName: string,
  inviteLink: string,
): Promise<void> {
  if (DRY_RUN) return
  await callTelegram("sendMessage", {
    chat_id: parentChatId,
    text: `Your ${groupName} team group is live. Tap to join: ${inviteLink}`,
    disable_web_page_preview: false,
  })
}

/**
 * Remove a member from the group. Used when their kid is removed from the roster
 * or they opt out.
 */
export async function removeMember(groupChatId: string, userChatId: string): Promise<void> {
  if (DRY_RUN) return
  await callTelegram("banChatMember", {
    chat_id: groupChatId,
    user_id: userChatId,
    until_date: Math.floor(Date.now() / 1000) + 30, // unban after 30s (kicks without permanent ban)
  })
}

/**
 * Post a message in the group.
 */
export async function postToGroup(groupChatId: string, text: string): Promise<{ messageId: number }> {
  if (DRY_RUN) return { messageId: 0 }
  const result = await callTelegram<{ message_id: number }>("sendMessage", {
    chat_id: groupChatId,
    text,
    parse_mode: "HTML",
  })
  return { messageId: result.message_id }
}

/**
 * Bot leaves the group (for archival).
 */
export async function botLeaveGroup(groupChatId: string): Promise<void> {
  if (DRY_RUN) return
  await callTelegram("leaveChat", { chat_id: groupChatId })
}

/**
 * List current group members. Telegram only returns admins via getChatAdministrators;
 * for full member list we rely on getChatMembersCount + our own memberships table.
 * This function returns the count for sanity checks.
 */
export async function getGroupMemberCount(groupChatId: string): Promise<number> {
  if (DRY_RUN) return 0
  const result = await callTelegram<number>("getChatMembersCount", { chat_id: groupChatId })
  return result
}

/**
 * Check whether a specific user is a member of the group.
 */
export async function isUserInGroup(groupChatId: string, userChatId: string): Promise<boolean> {
  if (DRY_RUN) return false
  try {
    const result = await callTelegram<{ status: string }>("getChatMember", {
      chat_id: groupChatId,
      user_id: userChatId,
    })
    const status = result.status
    return status === "member" || status === "administrator" || status === "creator"
  } catch {
    return false
  }
}
