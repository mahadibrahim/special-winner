"use client"

import { useState, useEffect } from "react"
import {
  User,
  FileCheck,
  CreditCard,
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  Plus,
  Calendar,
  MapPin,
  Users,
  Loader2,
  AlertCircle,
  Shield,
  Tag,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { TelegramConnectStep } from "./telegram-connect-step"

interface Season {
  id: string
  name: string
  slug: string
  startDate: string
  endDate: string
  price: number
  priceCents: number
  deposit: number | null
  depositCents: number | null
  allowDeposit: boolean
  maxParticipants: number | null
  registeredCount: number
  spotsLeft: number | null
  scheduleNotes: string | null
  status: string
  program: {
    id: string
    name: string
    slug: string
    description: string | null
    programType: string
  }
  sport: {
    id: string
    name: string
    slug: string
    icon: string | null
    color: string | null
  }
  location: {
    id: string
    name: string
    slug: string
    address: string | null
    city: string | null
    state: string | null
  }
  ageGroup: {
    id: string
    name: string
    minAge: number
    maxAge: number
  } | null
}

interface FamilyMember {
  id: string
  firstName: string
  lastName: string
  birthDate: string
  gender: string | null
}

interface RegistrationWizardProps {
  seasonId: string
  hasLinkedTelegram?: boolean
}

const STEPS = [
  { id: 1, name: "Select Player", icon: User },
  { id: 2, name: "Sign Waiver", icon: FileCheck },
  { id: 3, name: "Payment", icon: CreditCard },
  { id: 4, name: "Confirm", icon: CheckCircle2 },
]

export default function RegistrationWizard({ seasonId, hasLinkedTelegram = false }: RegistrationWizardProps) {
  const [currentStep, setCurrentStep] = useState(1)
  const [showTelegramStep, setShowTelegramStep] = useState(false)
  const [season, setSeason] = useState<Season | null>(null)
  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [registrationComplete, setRegistrationComplete] = useState(false)

  // Form state
  const [selectedMemberId, setSelectedMemberId] = useState<string>("")
  const [waiverAccepted, setWaiverAccepted] = useState(false)
  const [waiverSignature, setWaiverSignature] = useState("")
  const [paymentOption, setPaymentOption] = useState<"full" | "deposit">("full")

  // Discount code state
  const [discountCode, setDiscountCode] = useState("")
  const [discountCodeInput, setDiscountCodeInput] = useState("")
  const [isValidatingDiscount, setIsValidatingDiscount] = useState(false)
  const [discountError, setDiscountError] = useState<string | null>(null)
  const [appliedDiscount, setAppliedDiscount] = useState<{
    code: string
    discountType: "percentage" | "fixed_amount"
    discountValue: number
    discountAmountCents: number
  } | null>(null)

  // New member form
  const [showAddMember, setShowAddMember] = useState(false)
  const [newMemberFirstName, setNewMemberFirstName] = useState("")
  const [newMemberLastName, setNewMemberLastName] = useState("")
  const [newMemberBirthDate, setNewMemberBirthDate] = useState("")
  const [newMemberGender, setNewMemberGender] = useState("")
  const [isAddingMember, setIsAddingMember] = useState(false)

  useEffect(() => {
    fetchData()
  }, [seasonId])

  const fetchData = async () => {
    try {
      setIsLoading(true)
      const [seasonRes, membersRes] = await Promise.all([
        fetch(`/api/public/seasons/${seasonId}`),
        fetch("/api/family-members"),
      ])

      if (!seasonRes.ok) throw new Error("Failed to fetch season")
      const seasonData = await seasonRes.json()
      setSeason(seasonData.season)

      if (membersRes.ok) {
        const membersData = await membersRes.json()
        setFamilyMembers(membersData.familyMembers || [])
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data")
    } finally {
      setIsLoading(false)
    }
  }

  const handleAddMember = async () => {
    if (!newMemberFirstName || !newMemberLastName || !newMemberBirthDate) return

    setIsAddingMember(true)
    try {
      const response = await fetch("/api/family-members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: newMemberFirstName,
          lastName: newMemberLastName,
          birthDate: newMemberBirthDate,
          gender: newMemberGender || undefined,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to add member")
      }

      const data = await response.json()
      setFamilyMembers([...familyMembers, data.familyMember])
      setSelectedMemberId(data.familyMember.id)
      setShowAddMember(false)
      setNewMemberFirstName("")
      setNewMemberLastName("")
      setNewMemberBirthDate("")
      setNewMemberGender("")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add member")
    } finally {
      setIsAddingMember(false)
    }
  }

  const handleApplyDiscount = async () => {
    if (!discountCodeInput.trim() || !season) return

    setIsValidatingDiscount(true)
    setDiscountError(null)

    try {
      const purchaseAmountCents = paymentOption === "deposit" && season.depositCents
        ? season.depositCents
        : season.priceCents

      const response = await fetch("/api/public/validate-discount", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: discountCodeInput.trim().toUpperCase(),
          seasonId: season.id,
          purchaseAmountCents,
        }),
      })

      const data = await response.json()

      if (!data.valid) {
        setDiscountError(data.error || "Invalid discount code")
        return
      }

      setDiscountCode(discountCodeInput.trim().toUpperCase())
      setAppliedDiscount({
        code: data.discount.code,
        discountType: data.discount.discountType,
        discountValue: data.discount.discountValue,
        discountAmountCents: data.calculatedDiscount?.discountAmountCents || 0,
      })
      setDiscountCodeInput("")
    } catch (err) {
      setDiscountError("Failed to validate discount code")
    } finally {
      setIsValidatingDiscount(false)
    }
  }

  const handleRemoveDiscount = () => {
    setDiscountCode("")
    setAppliedDiscount(null)
    setDiscountError(null)
  }

  const handleSubmitRegistration = async () => {
    if (!selectedMemberId || !waiverAccepted || !waiverSignature) return

    setIsSubmitting(true)
    setError(null)

    try {
      // Step 1: Create registration
      const regResponse = await fetch("/api/registrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          seasonId,
          familyMemberId: selectedMemberId,
          registrationType: paymentOption,
          waiverSigned: true,
          waiverSignedBy: waiverSignature,
          discountCode: discountCode || undefined,
        }),
      })

      if (!regResponse.ok) {
        const data = await regResponse.json()
        throw new Error(data.error || "Failed to complete registration")
      }

      const regData = await regResponse.json()

      if (regData.requiresPayment) {
        // Step 2: Create Stripe checkout session
        const checkoutResponse = await fetch("/api/payments/create-checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            registrationId: regData.registration.id,
            discountCode: discountCode || undefined,
          }),
        })

        if (!checkoutResponse.ok) {
          const checkoutData = await checkoutResponse.json()
          // If Stripe isn't configured, show success without payment
          if (checkoutData.error === "Payment processing is not configured") {
            setRegistrationComplete(true)
            if (!hasLinkedTelegram) {
              setShowTelegramStep(true)
            } else {
              setCurrentStep(4)
            }
            return
          }
          throw new Error(checkoutData.error || "Failed to create checkout session")
        }

        const checkoutData = await checkoutResponse.json()

        // Redirect to Stripe checkout
        if (checkoutData.checkoutUrl) {
          window.location.href = checkoutData.checkoutUrl
          return
        }
      }

      // Waitlisted or no payment required — show Telegram step first (if not already linked)
      setRegistrationComplete(true)
      if (!hasLinkedTelegram) {
        setShowTelegramStep(true)
      } else {
        setCurrentStep(4)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to complete registration")
    } finally {
      setIsSubmitting(false)
    }
  }

  const canProceed = () => {
    switch (currentStep) {
      case 1:
        return selectedMemberId !== ""
      case 2:
        return waiverAccepted && waiverSignature.length >= 2
      case 3:
        return true
      default:
        return false
    }
  }

  const formatDateRange = (start: string, end: string) => {
    // Parse as local dates so "2026-05-16" doesn't render as May 15 in -04 TZs.
    const [sy, sm, sd] = start.split("-").map(Number)
    const [ey, em, ed] = end.split("-").map(Number)
    const startDate = new Date(sy, (sm ?? 1) - 1, sd ?? 1)
    const endDate = new Date(ey, (em ?? 1) - 1, ed ?? 1)
    const startMonth = startDate.toLocaleDateString("en-US", { month: "short" })
    const endMonth = endDate.toLocaleDateString("en-US", { month: "short" })
    const startDay = startDate.getDate()
    const endDay = endDate.getDate()
    const year = endDate.getFullYear()

    if (startMonth === endMonth) {
      return `${startMonth} ${startDay} - ${endDay}, ${year}`
    }
    return `${startMonth} ${startDay} - ${endMonth} ${endDay}, ${year}`
  }

  const calculateAge = (birthDate: string) => {
    const today = new Date()
    const birth = new Date(birthDate)
    let age = today.getFullYear() - birth.getFullYear()
    const monthDiff = today.getMonth() - birth.getMonth()
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--
    }
    return age
  }

  const selectedMember = familyMembers.find((m) => m.id === selectedMemberId)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  if (error && !season) {
    return (
      <div className="text-center py-20">
        <AlertCircle className="w-12 h-12 text-destructive mx-auto mb-4" />
        <p className="text-ink mb-2">Failed to load registration</p>
        <p className="text-ink-muted text-sm">{error}</p>
      </div>
    )
  }

  if (!season) return null

  return (
    <div className="max-w-3xl mx-auto">
      {/* Progress Steps */}
      <div className="mb-8">
        <div className="flex items-center justify-between relative">
          {/* Progress line */}
          <div className="absolute top-5 left-0 right-0 h-0.5 bg-border" />
          <div
            className="absolute top-5 left-0 h-0.5 bg-primary transition-all duration-500"
            style={{ width: `${((currentStep - 1) / (STEPS.length - 1)) * 100}%` }}
          />

          {STEPS.map((step) => {
            const StepIcon = step.icon
            const isActive = currentStep === step.id
            const isComplete = currentStep > step.id

            return (
              <div key={step.id} className="relative flex flex-col items-center z-10">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                    isComplete
                      ? "bg-primary text-primary-foreground"
                      : isActive
                        ? "bg-primary text-primary-foreground ring-4 ring-primary/20"
                        : "bg-cream-3 text-ink-muted"
                  }`}
                >
                  {isComplete ? (
                    <CheckCircle2 className="w-5 h-5" />
                  ) : (
                    <StepIcon className="w-5 h-5" />
                  )}
                </div>
                <span
                  className={`mt-2 text-xs font-medium ${
                    isActive ? "text-ink" : "text-ink-muted"
                  }`}
                >
                  {step.name}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="mb-6 p-4 rounded-xl bg-destructive/10 border border-destructive/20 flex items-center gap-3 text-destructive">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-auto text-sm underline">
            Dismiss
          </button>
        </div>
      )}

      {/* Program Summary */}
      <div className="mb-6 p-4 rounded-xl bg-paper border border-border">
        <div className="flex items-center gap-4">
          <div
            className="w-14 h-14 rounded-xl flex items-center justify-center text-2xl"
            style={{
              backgroundColor: `${season.sport.color || "#6b7280"}15`,
              border: `1px solid ${season.sport.color || "#6b7280"}30`,
            }}
          >
            {season.sport.icon || "🏃"}
          </div>
          <div className="flex-1">
            <h2 className="font-semibold text-ink">{season.name}</h2>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-muted">
              <span className="flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" />
                {formatDateRange(season.startDate, season.endDate)}
              </span>
              <span className="flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5" />
                {season.location.name}
              </span>
              {season.ageGroup && (
                <span className="flex items-center gap-1">
                  <Users className="w-3.5 h-3.5" />
                  Ages {season.ageGroup.minAge}-{season.ageGroup.maxAge}
                </span>
              )}
            </div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-ink">${season.price}</div>
            {season.allowDeposit && season.deposit && (
              <div className="text-sm text-ink-muted">
                or ${season.deposit} deposit
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Step Content */}
      <div className="bg-paper border border-border rounded-2xl p-6">
        {/* Step 1: Select Player */}
        {currentStep === 1 && (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold text-ink mb-2">Select Player</h3>
              <p className="text-ink-muted text-sm">
                Choose which family member you're registering for this program.
              </p>
            </div>

            {familyMembers.length > 0 && !showAddMember && (
              <RadioGroup value={selectedMemberId} onValueChange={setSelectedMemberId}>
                <div className="space-y-3">
                  {familyMembers.map((member) => {
                    const age = calculateAge(member.birthDate)
                    const isEligible =
                      !season.ageGroup ||
                      (age >= season.ageGroup.minAge && age <= season.ageGroup.maxAge)

                    return (
                      <Label
                        key={member.id}
                        htmlFor={`member-${member.id}`}
                        className={`flex items-center p-4 rounded-xl border cursor-pointer transition-all ${
                          selectedMemberId === member.id
                            ? "border-primary bg-primary/10"
                            : "border-border hover:border-ink-faint bg-paper"
                        } ${!isEligible ? "opacity-50" : ""}`}
                      >
                        <RadioGroupItem
                          value={member.id}
                          id={`member-${member.id}`}
                          disabled={!isEligible}
                          className="mr-4"
                        />
                        <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-semibold mr-3">
                          {member.firstName[0]}
                          {member.lastName[0]}
                        </div>
                        <div className="flex-1">
                          <p className="font-medium text-ink">
                            {member.firstName} {member.lastName}
                          </p>
                          <p className="text-sm text-ink-muted">Age {age}</p>
                        </div>
                        {!isEligible && (
                          <span className="text-xs text-yellow-500 bg-yellow-500/10 px-2 py-1 rounded">
                            Outside age range
                          </span>
                        )}
                      </Label>
                    )
                  })}
                </div>
              </RadioGroup>
            )}

            {!showAddMember ? (
              <Button
                variant="outline"
                onClick={() => setShowAddMember(true)}
                className="w-full border-dashed border-border text-ink-muted hover:text-ink hover:bg-cream-2"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add New Family Member
              </Button>
            ) : (
              <div className="space-y-4 p-4 rounded-xl border border-border bg-paper">
                <h4 className="font-medium text-ink">Add New Family Member</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-ink-muted">First Name *</Label>
                    <Input
                      value={newMemberFirstName}
                      onChange={(e) => setNewMemberFirstName(e.target.value)}
                      className="bg-cream-2 border-border text-ink focus:border-primary placeholder:text-ink-faint"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-ink-muted">Last Name *</Label>
                    <Input
                      value={newMemberLastName}
                      onChange={(e) => setNewMemberLastName(e.target.value)}
                      className="bg-cream-2 border-border text-ink focus:border-primary placeholder:text-ink-faint"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-ink-muted">Birth Date *</Label>
                    <Input
                      type="date"
                      value={newMemberBirthDate}
                      onChange={(e) => setNewMemberBirthDate(e.target.value)}
                      className="bg-cream-2 border-border text-ink focus:border-primary"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-ink-muted">Gender</Label>
                    <Select value={newMemberGender} onValueChange={setNewMemberGender}>
                      <SelectTrigger className="bg-cream-2 border-border text-ink">
                        <SelectValue placeholder="Select" />
                      </SelectTrigger>
                      <SelectContent className="bg-cream border-border">
                        <SelectItem value="male" className="text-ink-2">Male</SelectItem>
                        <SelectItem value="female" className="text-ink-2">Female</SelectItem>
                        <SelectItem value="other" className="text-ink-2">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    onClick={() => setShowAddMember(false)}
                    className="border-border text-ink-muted"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleAddMember}
                    disabled={!newMemberFirstName || !newMemberLastName || !newMemberBirthDate || isAddingMember}
                    className="bg-primary hover:bg-primary/90"
                  >
                    {isAddingMember ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                    Add & Select
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 2: Waiver */}
        {currentStep === 2 && (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold text-ink mb-2">Participant Waiver</h3>
              <p className="text-ink-muted text-sm">
                Please read and sign the waiver to continue with registration.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-cream-2 border border-border max-h-64 overflow-y-auto">
              <h4 className="font-medium text-ink mb-3 flex items-center gap-2">
                <Shield className="w-4 h-4 text-primary" />
                Aspire Sports Participation Waiver
              </h4>
              <div className="text-sm text-ink-muted space-y-3">
                <p>
                  By signing this waiver, I acknowledge and agree to the following terms and conditions
                  for participation in Aspire Sports programs:
                </p>
                <p>
                  <strong className="text-ink">1. Assumption of Risk:</strong> I understand that participation in
                  sports activities involves inherent risks, including but not limited to physical
                  injury, illness, and exposure to communicable diseases. I voluntarily assume all
                  such risks.
                </p>
                <p>
                  <strong className="text-ink">2. Medical Authorization:</strong> In the event of an emergency, I
                  authorize Aspire Sports staff to seek and consent to medical treatment for the
                  participant if I cannot be reached.
                </p>
                <p>
                  <strong className="text-ink">3. Photo/Video Release:</strong> I grant permission for Aspire Sports
                  to use photographs and video recordings of the participant for promotional purposes.
                </p>
                <p>
                  <strong className="text-ink">4. Release of Liability:</strong> I release and hold harmless Aspire
                  Sports, its coaches, volunteers, and facilities from any claims arising from
                  participation in the program.
                </p>
                <p>
                  <strong className="text-ink">5. Code of Conduct:</strong> I agree that the participant will adhere
                  to all program rules and demonstrate good sportsmanship at all times.
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <Checkbox
                  id="waiver"
                  checked={waiverAccepted}
                  onCheckedChange={(checked) => setWaiverAccepted(checked === true)}
                  className="mt-1 border-border data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                />
                <Label htmlFor="waiver" className="text-sm text-ink-2 cursor-pointer">
                  I have read, understand, and agree to the terms of this waiver on behalf of{" "}
                  <span className="text-ink font-medium">
                    {selectedMember?.firstName} {selectedMember?.lastName}
                  </span>.
                </Label>
              </div>

              <div className="space-y-2">
                <Label className="text-ink-muted">Digital Signature *</Label>
                <Input
                  value={waiverSignature}
                  onChange={(e) => setWaiverSignature(e.target.value)}
                  placeholder="Type your full legal name"
                  className="bg-cream-2 border-border text-ink focus:border-primary placeholder:text-ink-faint"
                />
                <p className="text-xs text-ink-muted">
                  By typing your name above, you agree that this constitutes a legal signature.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Payment */}
        {currentStep === 3 && (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold text-ink mb-2">Payment Option</h3>
              <p className="text-ink-muted text-sm">
                Choose how you'd like to pay for this registration.
              </p>
            </div>

            <RadioGroup value={paymentOption} onValueChange={(v) => setPaymentOption(v as "full" | "deposit")}>
              <div className="space-y-3">
                <Label
                  htmlFor="pay-full"
                  className={`flex items-center p-4 rounded-xl border cursor-pointer transition-all ${
                    paymentOption === "full"
                      ? "border-primary bg-primary/10"
                      : "border-border hover:border-ink-faint bg-paper"
                  }`}
                >
                  <RadioGroupItem value="full" id="pay-full" className="mr-4" />
                  <div className="flex-1">
                    <p className="font-medium text-ink">Pay in Full</p>
                    <p className="text-sm text-ink-muted">Complete payment now</p>
                  </div>
                  <div className="text-xl font-bold text-ink">${season.price}</div>
                </Label>

                {season.allowDeposit && season.deposit && (
                  <Label
                    htmlFor="pay-deposit"
                    className={`flex items-center p-4 rounded-xl border cursor-pointer transition-all ${
                      paymentOption === "deposit"
                        ? "border-primary bg-primary/10"
                        : "border-border hover:border-ink-faint bg-paper"
                    }`}
                  >
                    <RadioGroupItem value="deposit" id="pay-deposit" className="mr-4" />
                    <div className="flex-1">
                      <p className="font-medium text-ink">Pay Deposit</p>
                      <p className="text-sm text-ink-muted">
                        Remaining ${(season.price - season.deposit).toFixed(2)} due before season starts
                      </p>
                    </div>
                    <div className="text-xl font-bold text-ink">${season.deposit}</div>
                  </Label>
                )}
              </div>
            </RadioGroup>

            {/* Discount Code */}
            <div className="space-y-3">
              <Label className="text-ink-muted flex items-center gap-2">
                <Tag className="w-4 h-4" />
                Discount Code
              </Label>
              {appliedDiscount ? (
                <div className="flex items-center justify-between p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                    <span className="text-green-400 font-medium">{appliedDiscount.code}</span>
                    <span className="text-green-400/70 text-sm">
                      (-${(appliedDiscount.discountAmountCents / 100).toFixed(2)})
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleRemoveDiscount}
                    className="text-ink-muted hover:text-ink p-1"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Input
                    value={discountCodeInput}
                    onChange={(e) => {
                      setDiscountCodeInput(e.target.value.toUpperCase())
                      setDiscountError(null)
                    }}
                    placeholder="Enter code"
                    className="bg-cream-2 border-border text-ink focus:border-primary placeholder:text-ink-faint uppercase"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleApplyDiscount}
                    disabled={!discountCodeInput.trim() || isValidatingDiscount}
                    className="border-border text-ink-2 hover:text-ink hover:bg-cream-2 px-6"
                  >
                    {isValidatingDiscount ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      "Apply"
                    )}
                  </Button>
                </div>
              )}
              {discountError && (
                <p className="text-sm text-red-400 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  {discountError}
                </p>
              )}
            </div>

            {/* Order Summary */}
            <div className="p-4 rounded-xl bg-primary/10 border border-primary/20">
              <div className="flex items-center justify-between mb-2">
                <span className="text-ink-2">Registration for</span>
                <span className="text-ink font-medium">
                  {selectedMember?.firstName} {selectedMember?.lastName}
                </span>
              </div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-ink-2">Program</span>
                <span className="text-ink font-medium">{season.name}</span>
              </div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-ink-2">
                  {paymentOption === "deposit" ? "Deposit" : "Subtotal"}
                </span>
                <span className="text-ink">
                  ${paymentOption === "deposit" && season.deposit ? season.deposit : season.price}
                </span>
              </div>
              {appliedDiscount && (
                <div className="flex items-center justify-between mb-2 text-green-400">
                  <span>Discount ({appliedDiscount.code})</span>
                  <span>-${(appliedDiscount.discountAmountCents / 100).toFixed(2)}</span>
                </div>
              )}
              <div className="flex items-center justify-between pt-2 border-t border-primary/20">
                <span className="text-ink font-semibold">Total Due Today</span>
                <span className="text-ink font-bold text-xl">
                  ${(
                    (paymentOption === "deposit" && season.deposit ? season.deposit : season.price) -
                    (appliedDiscount ? appliedDiscount.discountAmountCents / 100 : 0)
                  ).toFixed(2)}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Telegram Connect Step (between payment and confirmation) */}
        {showTelegramStep && (
          <TelegramConnectStep
            onComplete={() => {
              setShowTelegramStep(false)
              setCurrentStep(4)
            }}
            onSkip={() => {
              setShowTelegramStep(false)
              setCurrentStep(4)
            }}
          />
        )}

        {/* Step 4: Confirmation */}
        {currentStep === 4 && !showTelegramStep && registrationComplete && (
          <div className="text-center py-8">
            <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-8 h-8 text-green-500" />
            </div>
            <h3 className="text-xl font-semibold text-ink mb-2">Registration Submitted!</h3>
            <p className="text-ink-muted mb-6">
              {selectedMember?.firstName} has been registered for {season.name}.
              You'll receive a confirmation email shortly.
            </p>
            <div className="flex justify-center gap-3">
              <Button asChild variant="outline" className="border-border text-ink hover:bg-cream-2">
                <a href="/dashboard">Go to Dashboard</a>
              </Button>
              <Button asChild className="bg-primary hover:bg-primary/90">
                <a href="/#programs">Register Another</a>
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Navigation */}
      {currentStep < 4 && !showTelegramStep && (
        <div className="mt-6 flex items-center justify-between">
          <Button
            variant="ghost"
            onClick={() => setCurrentStep(currentStep - 1)}
            disabled={currentStep === 1}
            className="text-ink-muted hover:text-ink"
          >
            <ChevronLeft className="w-4 h-4 mr-1" />
            Back
          </Button>

          {currentStep < 3 ? (
            <Button
              onClick={() => setCurrentStep(currentStep + 1)}
              disabled={!canProceed()}
              className="bg-primary hover:bg-primary/90"
            >
              Continue
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          ) : (
            <Button
              onClick={handleSubmitRegistration}
              disabled={isSubmitting}
              className="bg-primary hover:bg-primary/90"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Processing...
                </>
              ) : (
                <>
                  Complete Registration
                  <CheckCircle2 className="w-4 h-4 ml-2" />
                </>
              )}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
