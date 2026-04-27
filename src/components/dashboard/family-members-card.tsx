"use client"

import { useState, useEffect, useRef } from "react"
import { Plus, Edit2, Trash2, User, Calendar, AlertCircle, Loader2, X, Camera, Upload, Image } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { useConfirmDialog } from "@/components/ui/confirm-dialog"

interface FamilyMember {
  id: string
  firstName: string
  lastName: string
  birthDate: string
  gender: string | null
  medicalNotes: string | null
  emergencyContactName: string | null
  emergencyContactPhone: string | null
  photoUrl: string | null
}

export default function FamilyMembersCard() {
  const { confirm, dialog: confirmDialog } = useConfirmDialog()
  const [members, setMembers] = useState<FamilyMember[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingMember, setEditingMember] = useState<FamilyMember | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Photo upload state
  const [isPhotoDialogOpen, setIsPhotoDialogOpen] = useState(false)
  const [photoUploadMember, setPhotoUploadMember] = useState<FamilyMember | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Form state
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [birthDate, setBirthDate] = useState("")
  const [gender, setGender] = useState<string>("")
  const [medicalNotes, setMedicalNotes] = useState("")
  const [emergencyContactName, setEmergencyContactName] = useState("")
  const [emergencyContactPhone, setEmergencyContactPhone] = useState("")
  const [parentalConsent, setParentalConsent] = useState(false)
  const [photoConsent, setPhotoConsent] = useState(false)

  useEffect(() => {
    fetchMembers()
  }, [])

  const fetchMembers = async () => {
    try {
      setIsLoading(true)
      const response = await fetch("/api/family-members")
      if (!response.ok) throw new Error("Failed to fetch")
      const data = await response.json()
      setMembers(data.familyMembers || [])
    } catch {
      setError("Failed to load family members")
    } finally {
      setIsLoading(false)
    }
  }

  const resetForm = () => {
    setFirstName("")
    setLastName("")
    setBirthDate("")
    setGender("")
    setMedicalNotes("")
    setEmergencyContactName("")
    setEmergencyContactPhone("")
    setParentalConsent(false)
    setEditingMember(null)
  }

  const openAddDialog = () => {
    resetForm()
    setIsDialogOpen(true)
  }

  const openEditDialog = (member: FamilyMember) => {
    setEditingMember(member)
    setFirstName(member.firstName)
    setLastName(member.lastName)
    setBirthDate(member.birthDate)
    setGender(member.gender || "")
    setMedicalNotes(member.medicalNotes || "")
    setEmergencyContactName(member.emergencyContactName || "")
    setEmergencyContactPhone(member.emergencyContactPhone || "")
    setIsDialogOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)

    try {
      const payload: Record<string, unknown> = {
        firstName,
        lastName,
        birthDate,
        gender: gender || undefined,
        medicalNotes: medicalNotes || undefined,
        emergencyContactName: emergencyContactName || undefined,
        emergencyContactPhone: emergencyContactPhone || undefined,
      }
      if (!editingMember) {
        payload.parentalConsent = parentalConsent
      }

      const url = editingMember
        ? `/api/family-members/${editingMember.id}`
        : "/api/family-members"
      const method = editingMember ? "PUT" : "POST"

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to save")
      }

      await fetchMembers()
      setIsDialogOpen(false)
      resetForm()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDelete = async (id: string) => {
    const member = members.find((m) => m.id === id)
    const ok = await confirm({
      title: "Delete this child's record?",
      description: member ? (
        <>
          Permanently delete <strong>{member.firstName} {member.lastName}</strong> and all associated data — registrations, photos, roster entries, and assessments. This cannot be undone.
        </>
      ) : (
        "Permanently delete this child's record and all associated data? This cannot be undone."
      ),
      confirmLabel: "Delete record",
      destructive: true,
    })
    if (!ok) return

    try {
      const response = await fetch(`/api/family-members/${id}`, { method: "DELETE" })
      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || "Failed to delete")
      }
      await fetchMembers()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete family member")
    }
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

  // Photo upload functions
  const openPhotoDialog = (member: FamilyMember) => {
    setPhotoUploadMember(member)
    setSelectedFile(null)
    setPreviewUrl(member.photoUrl)
    setPhotoConsent(false)
    setIsPhotoDialogOpen(true)
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate file type
    const validTypes = ["image/jpeg", "image/png", "image/webp"]
    if (!validTypes.includes(file.type)) {
      setError("Please select a JPG, PNG, or WebP image")
      return
    }

    // Validate file size (5MB)
    if (file.size > 5 * 1024 * 1024) {
      setError("Image must be less than 5MB")
      return
    }

    setSelectedFile(file)
    setPreviewUrl(URL.createObjectURL(file))
  }

  const handlePhotoUpload = async () => {
    if (!selectedFile || !photoUploadMember) return

    setIsUploadingPhoto(true)
    setError(null)

    try {
      // Get signed upload params from our API
      const signResponse = await fetch("/api/uploads/sign")
      if (!signResponse.ok) {
        throw new Error("Failed to get upload credentials")
      }
      const signData = await signResponse.json()

      // Upload directly to Cloudinary
      const formData = new FormData()
      formData.append("file", selectedFile)
      formData.append("signature", signData.signature)
      formData.append("timestamp", signData.timestamp.toString())
      formData.append("api_key", signData.apiKey)
      formData.append("folder", signData.folder)

      const uploadResponse = await fetch(
        `https://api.cloudinary.com/v1_1/${signData.cloudName}/image/upload`,
        {
          method: "POST",
          body: formData,
        }
      )

      if (!uploadResponse.ok) {
        throw new Error("Failed to upload image")
      }

      const uploadData = await uploadResponse.json()

      // Save the URL to our database, with explicit consent.
      const saveResponse = await fetch(`/api/family-members/${photoUploadMember.id}/photo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          photoUrl: uploadData.secure_url,
          photoConsent: true,
        }),
      })

      if (!saveResponse.ok) {
        throw new Error("Failed to save photo")
      }

      // Refresh members list
      await fetchMembers()
      setIsPhotoDialogOpen(false)
      setSelectedFile(null)
      setPreviewUrl(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload photo")
    } finally {
      setIsUploadingPhoto(false)
    }
  }

  const handleRemovePhoto = async () => {
    if (!photoUploadMember) return

    setIsUploadingPhoto(true)
    setError(null)

    try {
      const response = await fetch(`/api/family-members/${photoUploadMember.id}/photo`, {
        method: "DELETE",
      })

      if (!response.ok) {
        throw new Error("Failed to remove photo")
      }

      await fetchMembers()
      setIsPhotoDialogOpen(false)
      setPreviewUrl(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove photo")
    } finally {
      setIsUploadingPhoto(false)
    }
  }

  return (
    <div className="bg-paper border border-border rounded-2xl overflow-hidden">
      {confirmDialog}
      <div className="p-6 border-b border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <User className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-ink">Family Members</h3>
              <p className="text-sm text-ink-muted">
                {members.length} {members.length === 1 ? "child" : "children"} registered
              </p>
            </div>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button
                onClick={openAddDialog}
                size="sm"
                className="bg-primary hover:bg-primary/90"
              >
                <Plus className="w-4 h-4 mr-1" />
                Add Child
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-cream border-border text-ink sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>
                  {editingMember ? "Edit Family Member" : "Add Family Member"}
                </DialogTitle>
                <DialogDescription className="text-ink-muted">
                  {editingMember
                    ? "Update the information for this family member."
                    : "Add a child or player to your family account."}
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit}>
                <div className="grid gap-4 py-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="firstName" className="text-ink-2">First Name *</Label>
                      <Input
                        id="firstName"
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        required
                        className="bg-cream-2 border-border text-ink"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="lastName" className="text-ink-2">Last Name *</Label>
                      <Input
                        id="lastName"
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        required
                        className="bg-cream-2 border-border text-ink"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="birthDate" className="text-ink-2">Birth Date *</Label>
                      <Input
                        id="birthDate"
                        type="date"
                        value={birthDate}
                        onChange={(e) => setBirthDate(e.target.value)}
                        required
                        className="bg-cream-2 border-border text-ink"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="gender" className="text-ink-2">Gender</Label>
                      <Select value={gender} onValueChange={setGender}>
                        <SelectTrigger className="bg-cream-2 border-border text-ink">
                          <SelectValue placeholder="Select gender" />
                        </SelectTrigger>
                        <SelectContent className="bg-cream border-border">
                          <SelectItem value="male" className="text-ink-2">Male</SelectItem>
                          <SelectItem value="female" className="text-ink-2">Female</SelectItem>
                          <SelectItem value="other" className="text-ink-2">Other</SelectItem>
                          <SelectItem value="prefer_not_to_say" className="text-ink-2">Prefer not to say</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="medicalNotes" className="text-ink-2">Medical Notes / Allergies</Label>
                    <Input
                      id="medicalNotes"
                      value={medicalNotes}
                      onChange={(e) => setMedicalNotes(e.target.value)}
                      placeholder="Any medical conditions or allergies we should know about"
                      className="bg-cream-2 border-border text-ink placeholder:text-ink-muted"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="emergencyContactName" className="text-ink-2">Emergency Contact</Label>
                      <Input
                        id="emergencyContactName"
                        value={emergencyContactName}
                        onChange={(e) => setEmergencyContactName(e.target.value)}
                        placeholder="Contact name"
                        className="bg-cream-2 border-border text-ink placeholder:text-ink-muted"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="emergencyContactPhone" className="text-ink-2">Emergency Phone</Label>
                      <Input
                        id="emergencyContactPhone"
                        value={emergencyContactPhone}
                        onChange={(e) => setEmergencyContactPhone(e.target.value)}
                        placeholder="Phone number"
                        className="bg-cream-2 border-border text-ink placeholder:text-ink-muted"
                      />
                    </div>
                  </div>
                  {!editingMember && (
                    <div className="space-y-2 rounded-lg border border-border bg-cream-2/60 p-3">
                      <label className="flex items-start gap-3 text-sm text-ink-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={parentalConsent}
                          onChange={(e) => setParentalConsent(e.target.checked)}
                          className="mt-1 h-4 w-4 rounded border-border accent-primary"
                          aria-describedby="parental-consent-help"
                          required
                        />
                        <span>
                          I am the parent or legal guardian of <strong>{firstName || "this child"}{lastName ? ` ${lastName}` : ""}</strong> and I consent to Aspire Sports collecting and storing the information above for the purpose of sports program registration, safety, and communication.
                        </span>
                      </label>
                      <p id="parental-consent-help" className="text-xs text-ink-faint pl-7">
                        Required by federal law (COPPA) for participants under 13. See our{" "}
                        <a href="/privacy" target="_blank" rel="noopener" className="text-primary underline underline-offset-2">privacy policy</a>{" "}for what we collect and how to delete it.
                      </p>
                    </div>
                  )}
                </div>
                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsDialogOpen(false)}
                    className="border-border text-ink-2 hover:bg-cream-2"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={isSubmitting || (!editingMember && !parentalConsent)}
                    className="bg-primary hover:bg-primary/90"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Saving...
                      </>
                    ) : editingMember ? (
                      "Save Changes"
                    ) : (
                      "Add Family Member"
                    )}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="p-6">
        {error && (
          <div className="mb-4 p-3 rounded-lg bg-destructive/10 border border-destructive/20 flex items-center gap-2 text-destructive text-sm">
            <AlertCircle className="w-4 h-4" />
            {error}
            <button onClick={() => setError(null)} className="ml-auto">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : members.length === 0 ? (
          <div className="text-center py-8">
            <div className="w-12 h-12 rounded-full bg-cream-2 flex items-center justify-center mx-auto mb-3">
              <User className="w-6 h-6 text-ink-muted" />
            </div>
            <p className="text-ink-muted mb-1">No family members yet</p>
            <p className="text-sm text-ink-muted">Add your children to start registering for programs</p>
          </div>
        ) : (
          <div className="space-y-3">
            {members.map((member) => (
              <div
                key={member.id}
                className="p-4 rounded-xl bg-paper border border-border hover:border-border transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {/* Avatar with photo upload */}
                    <div className="relative group">
                      {member.photoUrl ? (
                        <img
                          src={member.photoUrl}
                          alt={`${member.firstName} ${member.lastName}`}
                          className="w-10 h-10 rounded-full object-cover"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-semibold">
                          {member.firstName[0]}{member.lastName[0]}
                        </div>
                      )}
                      <button
                        onClick={() => openPhotoDialog(member)}
                        className="absolute inset-0 rounded-full bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                      >
                        <Camera className="w-4 h-4 text-white" />
                      </button>
                    </div>
                    <div>
                      <p className="font-medium text-ink">
                        {member.firstName} {member.lastName}
                      </p>
                      <div className="flex items-center gap-2 text-sm text-ink-muted">
                        <Calendar className="w-3 h-3" />
                        Age {calculateAge(member.birthDate)}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => openEditDialog(member)}
                      className="text-ink-muted hover:text-ink hover:bg-cream-2"
                    >
                      <Edit2 className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(member.id)}
                      className="text-ink-muted hover:text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Photo Upload Dialog */}
      <Dialog open={isPhotoDialogOpen} onOpenChange={setIsPhotoDialogOpen}>
        <DialogContent className="bg-cream border-border text-ink sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Camera className="w-5 h-5 text-primary" />
              {photoUploadMember?.firstName}'s Photo
            </DialogTitle>
            <DialogDescription className="text-ink-muted">
              Upload a profile photo for {photoUploadMember?.firstName}. This will be visible to coaches and staff.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            {/* Preview area */}
            <div className="flex justify-center mb-6">
              {previewUrl ? (
                <div className="relative">
                  <img
                    src={previewUrl}
                    alt="Photo preview"
                    className="w-32 h-32 rounded-full object-cover border-2 border-primary/30"
                  />
                  <button
                    onClick={() => {
                      setSelectedFile(null)
                      setPreviewUrl(photoUploadMember?.photoUrl || null)
                    }}
                    className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-destructive text-white flex items-center justify-center hover:bg-destructive/80 transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <div className="w-32 h-32 rounded-full bg-cream-2 border-2 border-dashed border-border flex items-center justify-center">
                  <Image className="w-10 h-10 text-ink-muted" />
                </div>
              )}
            </div>

            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleFileSelect}
              className="hidden"
            />

            {/* Upload area */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full p-6 border-2 border-dashed border-border rounded-xl hover:border-primary/50 transition-colors text-center group"
            >
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3 group-hover:bg-primary/20 transition-colors">
                <Upload className="w-6 h-6 text-primary" />
              </div>
              <p className="text-ink-2 font-medium mb-1">Click to upload photo</p>
              <p className="text-sm text-ink-muted">JPG, PNG, or WebP • Max 5MB</p>
            </button>

            {selectedFile && (
              <div className="mt-4 space-y-2 rounded-lg border border-border bg-cream-2/60 p-3">
                <label className="flex items-start gap-3 text-sm text-ink-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={photoConsent}
                    onChange={(e) => setPhotoConsent(e.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-border accent-primary"
                    aria-describedby="photo-consent-help"
                    required
                  />
                  <span>
                    I have the right to share this photo of <strong>{photoUploadMember?.firstName}</strong> and I consent to it being displayed in rosters and shared with coaches and staff.
                  </span>
                </label>
                <p id="photo-consent-help" className="text-xs text-ink-faint pl-7">
                  You can remove the photo at any time, which clears this consent.
                </p>
              </div>
            )}
          </div>

          <DialogFooter className="flex flex-col sm:flex-row gap-2">
            {photoUploadMember?.photoUrl && !selectedFile && (
              <Button
                type="button"
                variant="outline"
                onClick={handleRemovePhoto}
                disabled={isUploadingPhoto}
                className="border-destructive/30 text-destructive hover:bg-destructive/10 sm:mr-auto"
              >
                {isUploadingPhoto ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <Trash2 className="w-4 h-4 mr-2" />
                    Remove Photo
                  </>
                )}
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsPhotoDialogOpen(false)}
              className="border-border text-ink-2 hover:bg-cream-2"
            >
              Cancel
            </Button>
            {selectedFile && (
              <Button
                type="button"
                onClick={handlePhotoUpload}
                disabled={isUploadingPhoto || !photoConsent}
                className="bg-primary hover:bg-primary/90"
              >
                {isUploadingPhoto ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4 mr-2" />
                    Upload Photo
                  </>
                )}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
