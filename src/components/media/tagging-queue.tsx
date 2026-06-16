"use client"

import { ListChecks } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { EmptyState } from "@/components/ui/empty-state"

export interface TaggingQueueItem {
  sessionId: string
  sessionType: string
  scheduledStart: string
  placeName: string
}

export function TaggingQueue({ items }: { items: TaggingQueueItem[] }) {
  if (items.length === 0) {
    return (
      <EmptyState
        title="Nothing to tag right now"
        description="Sessions ready for tagging in your service area will show up here."
        icon={<ListChecks className="h-10 w-10" />}
      />
    )
  }
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Tagging queue</h1>
        <p className="text-muted-foreground mt-1">Sessions waiting to be tagged in your service area.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((it) => (
          <a key={it.sessionId} href={`/media/tag/${it.sessionId}`} className="block">
            <Card className="transition-colors hover:border-primary">
              <CardHeader className="pb-2">
                <CardTitle className="text-base capitalize">{it.sessionType} — {it.placeName}</CardTitle>
              </CardHeader>
              <CardContent className="pt-0 text-sm text-muted-foreground">
                {new Date(it.scheduledStart).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
              </CardContent>
            </Card>
          </a>
        ))}
      </div>
    </div>
  )
}
