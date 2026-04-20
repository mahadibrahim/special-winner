"use client"

import { useEffect, useState } from "react"
import { PromoteTeamGroupForm } from "./promote-team-group-form"

type TeamGroup = {
  id: string
  name: string
  status: string
  telegramChatId: string | null
}

type Props = {
  teamId: string
}

export function TeamGroupManagementSection({ teamId }: Props) {
  const [teamGroup, setTeamGroup] = useState<TeamGroup | null | undefined>(undefined)

  function loadGroup() {
    fetch(`/api/admin/teams/${teamId}/group`)
      .then((r) => r.json())
      .then((json) => setTeamGroup(json.teamGroup ?? null))
      .catch(() => setTeamGroup(null))
  }

  useEffect(() => {
    loadGroup()
  }, [teamId])

  // Still loading
  if (teamGroup === undefined) return null

  // Group is archived — nothing actionable
  if (teamGroup && teamGroup.status === "archived") return null

  // No group yet — offer initialize-and-promote UX. The promote endpoint
  // creates the row on the fly when none exists.
  const currentStatus = teamGroup?.status ?? "not_initialized"
  const groupName = teamGroup?.name ?? "this team's parent group"

  return (
    <section className="mt-8 px-4 pb-8">
      <h2 className="mb-4 text-xl font-semibold">Team group management</h2>
      <PromoteTeamGroupForm
        teamId={teamId}
        currentStatus={currentStatus}
        groupName={groupName}
        onPromoted={loadGroup}
      />
    </section>
  )
}
