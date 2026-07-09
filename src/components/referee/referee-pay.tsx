"use client"

import { Wallet } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { EmptyState } from "@/components/ui/empty-state"

export interface RefereePayRowView {
  gameId: string
  scheduledAt: string
  homeTeamName: string | null
  awayTeamName: string | null
  feeCents: number
  paymentStatus: string
  locked: boolean
}

const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`

export function RefereePay({ rows, totalUnpaidCents }: { rows: RefereePayRowView[]; totalUnpaidCents: number }) {
  if (rows.length === 0) {
    return (
      <EmptyState
        title="No pay yet"
        description="Fees for matches you officiate will appear here."
        icon={<Wallet className="h-10 w-10" />}
      />
    )
  }
  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Pay</h1>
          <p className="text-muted-foreground mt-1">Fees for your assigned matches.</p>
        </div>
        <Card>
          <CardHeader className="pb-1"><CardTitle className="text-sm font-medium">Total unpaid</CardTitle></CardHeader>
          <CardContent className="text-2xl font-bold">{usd(totalUnpaidCents)}</CardContent>
        </Card>
      </div>
      <Table>
        <TableHeader>
          <TableRow><TableHead>Match</TableHead><TableHead>Date</TableHead><TableHead>Fee</TableHead><TableHead>Status</TableHead></TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.gameId}>
              <TableCell>{r.homeTeamName ?? "TBD"} vs {r.awayTeamName ?? "TBD"}</TableCell>
              <TableCell className="text-muted-foreground">{new Date(r.scheduledAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</TableCell>
              <TableCell>{usd(r.feeCents)}</TableCell>
              <TableCell>
                {r.locked && r.paymentStatus !== "paid" ? (
                  <a href={`/referee/matches/${r.gameId}`} className="text-sm font-medium text-amber-600 hover:underline">
                    🔒 Close out to unlock
                  </a>
                ) : (
                  <Badge variant={r.paymentStatus === "paid" ? "default" : "secondary"} className="capitalize">{r.paymentStatus}</Badge>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
