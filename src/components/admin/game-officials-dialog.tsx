"use client"

import { useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"

/**
 * Ref-assignment dialog for a single game (opened from /admin/games).
 * Pick a referee (users holding the referee role — assign the role on
 * /admin/users), set the fee, mark paid once the manual payout went out.
 */

interface Official {
  id: string
  userId: string
  position: string
  feeCents: number
  paymentStatus: "unpaid" | "paid"
  official: {
    firstName: string | null
    lastName: string | null
    email: string
    phone: string | null
  }
}

interface Referee {
  id: string
  firstName: string | null
  lastName: string | null
  email: string
}

interface GameOfficialsDialogProps {
  gameId: string | null
  gameLabel: string
  onClose: () => void
}

export function GameOfficialsDialog({
  gameId,
  gameLabel,
  onClose,
}: GameOfficialsDialogProps) {
  const [officials, setOfficials] = useState<Official[]>([])
  const [referees, setReferees] = useState<Referee[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [busy, setBusy] = useState(false)

  const [selectedRefId, setSelectedRefId] = useState("")
  const [fee, setFee] = useState("")

  useEffect(() => {
    if (!gameId) return
    let cancelled = false
    setIsLoading(true)
    Promise.all([
      fetch(`/api/admin/games/${gameId}/officials`).then((r) =>
        r.ok ? r.json() : Promise.reject(new Error()),
      ),
      fetch("/api/admin/referees").then((r) =>
        r.ok ? r.json() : Promise.reject(new Error()),
      ),
    ])
      .then(([o, r]) => {
        if (cancelled) return
        setOfficials(o.officials ?? [])
        setReferees(r.referees ?? [])
      })
      .catch(() => {
        if (!cancelled) toast.error("Could not load officials")
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [gameId])

  const refreshOfficials = async () => {
    if (!gameId) return
    const res = await fetch(`/api/admin/games/${gameId}/officials`)
    if (res.ok) {
      const json = await res.json()
      setOfficials(json.officials ?? [])
    }
  }

  const handleAssign = async () => {
    if (!gameId || !selectedRefId) return
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/games/${gameId}/officials`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: selectedRefId,
          position: "referee",
          feeCents: Math.round((parseFloat(fee) || 0) * 100),
        }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json.error ?? "Could not assign")
      }
      setSelectedRefId("")
      setFee("")
      await refreshOfficials()
      toast.success("Referee assigned")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not assign")
    } finally {
      setBusy(false)
    }
  }

  const handleTogglePaid = async (o: Official) => {
    if (!gameId) return
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/games/${gameId}/officials/${o.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paymentStatus: o.paymentStatus === "paid" ? "unpaid" : "paid",
        }),
      })
      if (!res.ok) throw new Error("Update failed")
      await refreshOfficials()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed")
    } finally {
      setBusy(false)
    }
  }

  const handleRemove = async (o: Official) => {
    if (!gameId) return
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/games/${gameId}/officials/${o.id}`, {
        method: "DELETE",
      })
      if (!res.ok) throw new Error("Remove failed")
      await refreshOfficials()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Remove failed")
    } finally {
      setBusy(false)
    }
  }

  const refName = (r: { firstName: string | null; lastName: string | null; email: string }) =>
    [r.firstName, r.lastName].filter(Boolean).join(" ") || r.email

  // Referees not already assigned to this game.
  const assignable = referees.filter(
    (r) => !officials.some((o) => o.userId === r.id),
  )

  return (
    <Dialog open={gameId !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Referees — {gameLabel}</DialogTitle>
          <DialogDescription>
            Assign refs and track their game fees. Mark paid once the payout
            has gone out. Add people to the ref pool by giving them the
            Referee role on the Users page.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Current assignments */}
            {officials.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No referee assigned yet.
              </p>
            ) : (
              <div className="border border-border rounded-lg divide-y divide-border">
                {officials.map((o) => (
                  <div key={o.id} className="flex items-center gap-3 px-3 py-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {refName(o.official)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        ${(o.feeCents / 100).toFixed(2)} · {o.position}
                      </p>
                    </div>
                    <Badge
                      className={
                        o.paymentStatus === "paid"
                          ? "bg-green-100 text-green-800 hover:bg-green-100"
                          : "bg-yellow-100 text-yellow-800 hover:bg-yellow-100"
                      }
                    >
                      {o.paymentStatus === "paid" ? "Paid" : "Unpaid"}
                    </Badge>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      onClick={() => handleTogglePaid(o)}
                    >
                      {o.paymentStatus === "paid" ? "Mark unpaid" : "Mark paid"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy}
                      onClick={() => handleRemove(o)}
                    >
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {/* Assign new */}
            <div className="space-y-2 border-t border-border pt-4">
              <Label className="text-sm">Assign a referee</Label>
              {referees.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No one holds the Referee role yet —{" "}
                  <a href="/admin/users" className="underline">
                    assign it on the Users page
                  </a>
                  .
                </p>
              ) : (
                <div className="flex gap-2">
                  <Select value={selectedRefId} onValueChange={setSelectedRefId}>
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Pick a referee" />
                    </SelectTrigger>
                    <SelectContent>
                      {assignable.map((r) => (
                        <SelectItem key={r.id} value={r.id}>
                          {refName(r)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="Fee $"
                    value={fee}
                    onChange={(e) => setFee(e.target.value)}
                    className="w-28"
                  />
                  <Button
                    onClick={handleAssign}
                    disabled={!selectedRefId || busy}
                  >
                    Assign
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
