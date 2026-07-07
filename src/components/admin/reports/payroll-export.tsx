"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Checkbox } from "@/components/ui/checkbox"

type ExportKind = "hours" | "referee"

function defaultDates() {
  const today = new Date()
  const twoWeeksAgo = new Date(today.getTime() - 13 * 86400 * 1000)
  const toYmd = (d: Date) => d.toISOString().slice(0, 10)
  return { from: toYmd(twoWeeksAgo), to: toYmd(today) }
}

/**
 * Manual Gusto payroll CSV export (product-backlog build #6). This is a
 * download trigger, not a live Gusto integration — the payroll office
 * hand-uploads the CSV into Gusto's Smart Import. See
 * GET /api/admin/labor/gusto-export for the endpoint this drives.
 */
export function PayrollExport() {
  const initial = defaultDates()
  const [kind, setKind] = useState<ExportKind>("hours")
  const [from, setFrom] = useState(initial.from)
  const [to, setTo] = useState(initial.to)
  const [includePaid, setIncludePaid] = useState(false)

  const dateRangeInvalid = Boolean(from && to && to < from)

  const params = new URLSearchParams({ kind, from, to })
  if (kind === "referee" && includePaid) {
    params.set("includePaid", "1")
  }
  const href = `/api/admin/labor/gusto-export?${params.toString()}`

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Gusto payroll export</h1>
        <p className="text-gray-600 mt-1">
          Download a CSV for the pay period, then upload it into Gusto's Smart Import.
          Hourly labor (coach / venue manager) is hours-only — Gusto applies each
          employee's stored rate. Referee stipends are per-match dollar fees.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Export</CardTitle>
          <CardDescription>Choose a flavor and pay period, then download.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Tabs value={kind} onValueChange={(v) => setKind(v as ExportKind)}>
            <TabsList>
              <TabsTrigger value="hours">Hourly labor (W-2)</TabsTrigger>
              <TabsTrigger value="referee">Referee fees (1099)</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1">
              <Label htmlFor="payroll-from">From</Label>
              <Input
                id="payroll-from"
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="payroll-to">To</Label>
              <Input
                id="payroll-to"
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </div>

            {kind === "referee" && (
              <div className="flex items-center gap-2 pb-2">
                <Checkbox
                  id="payroll-include-paid"
                  checked={includePaid}
                  onCheckedChange={(v) => setIncludePaid(v === true)}
                />
                <Label htmlFor="payroll-include-paid" className="font-normal">
                  Include already-paid referees
                </Label>
              </div>
            )}
          </div>

          {dateRangeInvalid ? (
            <p className="text-sm text-red-600">"To" must be on or after "From".</p>
          ) : (
            <a
              href={href}
              download
              className="inline-flex items-center px-4 py-2 text-sm font-medium rounded border border-border bg-primary text-primary-foreground hover:opacity-90 transition-opacity whitespace-nowrap"
            >
              Download CSV
            </a>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
