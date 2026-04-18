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

  // No group exists yet
  if (teamGroup === null) return null

  // Group is archived — nothing actionable
  if (teamGroup.status === "archived") return null

  return (
    <section className="mt-8 px-4 pb-8">
      <h2 className="mb-4 text-xl font-semibold">Team group management</h2>
      <PromoteTeamGroupForm
        teamId={teamId}
        currentStatus={teamGroup.status}
        groupName={teamGroup.name}
        onPromoted={loadGroup}
      />
    </section>
  )
}
