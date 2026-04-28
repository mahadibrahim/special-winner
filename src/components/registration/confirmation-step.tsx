"use client"

import { CheckCircle2 } from "lucide-react"
import { Button } from "@/components/ui/button"

interface ConfirmationStepProps {
  seasonName: string
  registrantDisplayName: string
}

export function ConfirmationStep({ seasonName, registrantDisplayName }: ConfirmationStepProps) {
  return (
    <div className="text-center py-8">
      <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-4">
        <CheckCircle2 className="w-8 h-8 text-green-500" />
      </div>
      <h3 className="text-xl font-semibold text-ink mb-2">Registration Submitted!</h3>
      <p className="text-ink-muted mb-6">
        {registrantDisplayName || "You"} has been registered for {seasonName}.
        You'll receive a confirmation email shortly.
      </p>
      <div className="flex justify-center gap-3">
        <Button asChild variant="outline" className="border-border text-ink hover:bg-cream-2">
          <a href="/dashboard">Go to Dashboard</a>
        </Button>
        <Button asChild className="bg-primary hover:bg-primary/90">
          <a href="/programs">Register Another</a>
        </Button>
      </div>
    </div>
  )
}
