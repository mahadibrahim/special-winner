"use client"

import { useState } from "react"
import { DollarSign, Users, BarChart3 } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { RevenueReport } from "./revenue-report"
import { RegistrationReport } from "./registration-report"

export function ReportsDashboard() {
  const [activeTab, setActiveTab] = useState("revenue")

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Reports & Analytics</h1>
        <p className="text-gray-600 mt-1">View financial and registration insights</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="revenue" className="flex items-center gap-2">
            <DollarSign className="h-4 w-4" />
            Revenue
          </TabsTrigger>
          <TabsTrigger value="registrations" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Registrations
          </TabsTrigger>
        </TabsList>

        <TabsContent value="revenue">
          <RevenueReport />
        </TabsContent>

        <TabsContent value="registrations">
          <RegistrationReport />
        </TabsContent>
      </Tabs>
    </div>
  )
}
