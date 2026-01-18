"use client"

import { useState, useEffect } from "react"
import { Plus, Pencil, Trash2, Loader2, Megaphone, Pin, Mail, Eye, EyeOff } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

interface Author {
  id: string
  firstName: string | null
  lastName: string | null
  email: string
}

interface Announcement {
  id: string
  title: string
  content: string
  target: string
  targetId: string | null
  status: string
  sendEmail: boolean
  emailSentAt: string | null
  publishedAt: string | null
  expiresAt: string | null
  pinned: boolean
  createdAt: string
  author: Author | null
}

const statusColors: Record<string, string> = {
  draft: "bg-gray-100 text-gray-800",
  published: "bg-green-100 text-green-800",
  archived: "bg-yellow-100 text-yellow-800",
}

const targetLabels: Record<string, string> = {
  all: "Everyone",
  parents: "Parents Only",
  coaches: "Coaches Only",
  program: "Specific Program",
  team: "Specific Team",
}

export function AnnouncementsList() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [editingAnnouncement, setEditingAnnouncement] = useState<Announcement | null>(null)
  const [filterStatus, setFilterStatus] = useState<string>("all")
  const [error, setError] = useState<string | null>(null)

  const [formData, setFormData] = useState({
    title: "",
    content: "",
    target: "all",
    status: "draft",
    pinned: false,
    sendEmail: false,
    expiresAt: "",
  })

  useEffect(() => {
    fetchAnnouncements()
  }, [filterStatus])

  async function fetchAnnouncements() {
    setIsLoading(true)
    try {
      const params = new URLSearchParams({ includeExpired: "true" })
      if (filterStatus !== "all") {
        params.set("status", filterStatus)
      }
      const response = await fetch(`/api/admin/announcements?${params}`)
      if (!response.ok) throw new Error("Failed to fetch announcements")
      const data = await response.json()
      setAnnouncements(data.announcements)
    } catch (err) {
      console.error(err)
    } finally {
      setIsLoading(false)
    }
  }

  function openCreateDialog() {
    setEditingAnnouncement(null)
    setFormData({
      title: "",
      content: "",
      target: "all",
      status: "draft",
      pinned: false,
      sendEmail: false,
      expiresAt: "",
    })
    setIsDialogOpen(true)
  }

  function openEditDialog(announcement: Announcement) {
    setEditingAnnouncement(announcement)
    setFormData({
      title: announcement.title,
      content: announcement.content,
      target: announcement.target,
      status: announcement.status,
      pinned: announcement.pinned,
      sendEmail: announcement.sendEmail,
      expiresAt: announcement.expiresAt ? new Date(announcement.expiresAt).toISOString().slice(0, 16) : "",
    })
    setIsDialogOpen(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setIsSubmitting(true)
    setError(null)

    try {
      const url = "/api/admin/announcements"
      const method = editingAnnouncement ? "PUT" : "POST"
      const body = {
        ...(editingAnnouncement ? { id: editingAnnouncement.id } : {}),
        ...formData,
        expiresAt: formData.expiresAt ? new Date(formData.expiresAt).toISOString() : null,
      }

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Failed to save announcement")
      }

      await fetchAnnouncements()
      setIsDialogOpen(false)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleDelete(announcement: Announcement) {
    if (!confirm(`Are you sure you want to delete "${announcement.title}"?`)) return

    try {
      const response = await fetch(`/api/admin/announcements?id=${announcement.id}`, {
        method: "DELETE",
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Failed to delete announcement")
      }

      await fetchAnnouncements()
    } catch (err: any) {
      alert(err.message)
    }
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    })
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Announcements</h1>
          <p className="text-gray-600 mt-1">Create and manage announcements for your community</p>
        </div>
        <Button onClick={openCreateDialog}>
          <Plus className="h-4 w-4 mr-2" />
          New Announcement
        </Button>
      </div>

      <div className="flex items-center gap-4">
        <Label className="whitespace-nowrap">Filter by Status:</Label>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="published">Published</SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {announcements.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Megaphone className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground mb-4">No announcements yet</p>
            <Button onClick={openCreateDialog}>
              <Plus className="h-4 w-4 mr-2" />
              Create First Announcement
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {announcements.map((announcement) => (
            <Card key={announcement.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      {announcement.pinned && (
                        <Pin className="h-4 w-4 text-primary" />
                      )}
                      <h3 className="font-semibold text-lg">{announcement.title}</h3>
                      <Badge className={statusColors[announcement.status]}>
                        {announcement.status}
                      </Badge>
                      <Badge variant="outline">{targetLabels[announcement.target]}</Badge>
                    </div>
                    <p className="text-muted-foreground text-sm line-clamp-2 mb-2">
                      {announcement.content}
                    </p>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span>
                        By {announcement.author?.firstName || announcement.author?.email || "Unknown"}
                      </span>
                      <span>Created {formatDate(announcement.createdAt)}</span>
                      {announcement.publishedAt && (
                        <span>Published {formatDate(announcement.publishedAt)}</span>
                      )}
                      {announcement.expiresAt && (
                        <span>Expires {formatDate(announcement.expiresAt)}</span>
                      )}
                      {announcement.sendEmail && (
                        <span className="flex items-center gap-1">
                          <Mail className="h-3 w-3" />
                          {announcement.emailSentAt ? "Email sent" : "Will email"}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    <Button variant="ghost" size="icon" onClick={() => openEditDialog(announcement)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(announcement)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Announcement Form Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingAnnouncement ? "Edit Announcement" : "New Announcement"}
            </DialogTitle>
            <DialogDescription>
              {editingAnnouncement ? "Update announcement details" : "Create a new announcement"}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit}>
            {error && (
              <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-lg mb-4">
                {error}
              </div>
            )}

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  value={formData.title}
                  onChange={(e) => setFormData((prev) => ({ ...prev, title: e.target.value }))}
                  placeholder="Announcement title"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="content">Content</Label>
                <Textarea
                  id="content"
                  value={formData.content}
                  onChange={(e) => setFormData((prev) => ({ ...prev, content: e.target.value }))}
                  placeholder="Write your announcement..."
                  rows={5}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Target Audience</Label>
                  <Select
                    value={formData.target}
                    onValueChange={(value) => setFormData((prev) => ({ ...prev, target: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Everyone</SelectItem>
                      <SelectItem value="parents">Parents Only</SelectItem>
                      <SelectItem value="coaches">Coaches Only</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select
                    value={formData.status}
                    onValueChange={(value) => setFormData((prev) => ({ ...prev, status: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft">Draft</SelectItem>
                      <SelectItem value="published">Published</SelectItem>
                      <SelectItem value="archived">Archived</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="expiresAt">Expires At (optional)</Label>
                <Input
                  id="expiresAt"
                  type="datetime-local"
                  value={formData.expiresAt}
                  onChange={(e) => setFormData((prev) => ({ ...prev, expiresAt: e.target.value }))}
                />
              </div>

              <div className="space-y-3">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="pinned"
                    checked={formData.pinned}
                    onCheckedChange={(checked) => setFormData((prev) => ({ ...prev, pinned: checked === true }))}
                  />
                  <Label htmlFor="pinned" className="font-normal flex items-center gap-1">
                    <Pin className="h-4 w-4" />
                    Pin to top
                  </Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="sendEmail"
                    checked={formData.sendEmail}
                    onCheckedChange={(checked) => setFormData((prev) => ({ ...prev, sendEmail: checked === true }))}
                  />
                  <Label htmlFor="sendEmail" className="font-normal flex items-center gap-1">
                    <Mail className="h-4 w-4" />
                    Send email notification
                  </Label>
                </div>
              </div>
            </div>

            <DialogFooter className="mt-6">
              <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : editingAnnouncement ? (
                  "Update"
                ) : (
                  "Create"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
