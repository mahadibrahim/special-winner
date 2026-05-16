"use client"

import { useEffect, useState } from "react"
import type { AttentionItem } from "@/lib/admin/attention-feed"

/**
 * Top-of-home action queue for the super-admin. Empty state → renders
 * nothing (don't waste real-estate). On load, fetches the API; on error,
 * silently hides (the feed is hint-only — the page still works).
 */
export function NeedsAttentionPanel() {
  const [items, setItems] = useState<AttentionItem[] | null>(null)

  useEffect(() => {
    let alive = true
    fetch("/api/admin/attention")
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .catch(() => ({ items: [] }))
      .then((d: { items: AttentionItem[] }) => {
        if (alive) setItems(d.items ?? [])
      })
    return () => {
      alive = false
    }
  }, [])

  if (items === null || items.length === 0) return null

  return (
    <div className="bg-amber-50 border border-amber-200 border-l-4 border-l-amber-500 rounded p-4">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-amber-900 mb-2">
        Needs your attention · {items.length}
      </div>
      <ul className="space-y-1 text-sm">
        {items.map((it) => (
          <li key={it.id} className="text-ink">
            {it.href ? (
              <a href={it.href} className="underline hover:no-underline">
                {it.text}
              </a>
            ) : (
              it.text
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
