"use client"

import { useEffect, useState } from "react"
import { BroadcastComposer } from "./broadcast-composer"

type TeamData = {
  id: string
  name: string
  coach?: {
    firstName: string | null
    lastName: string | null
    email: string
  } | null
}

type Props = {
  teamId: string
}

export function TeamBroadcastSection({ teamId }: Props) {
  const [team, setTeam] = useState<TeamData | null>(null)

  useEffect(() => {
    fetch(`/api/admin/teams?id=${teamId}`)
      .then((r) => r.json())
      .then((json) => setTeam(json.team ?? null))
      .catch(() => null)
  }, [teamId])

  if (!team) return null

  return (
    <section className="mt-8 px-4 pb-8">
      <h2 className="mb-4 text-xl font-semibold">Send team announcement</h2>
      <BroadcastComposer
        teamId={team.id}
        teamName={team.name}
        coachFirstName={team.coach?.firstName ?? undefined}
      />
    </section>
  )
}
