"use client"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { useUserPreferences } from "@/lib/user-preference-store/provider"
import { useUser } from "@/lib/user-store/provider"
import { CaretRight, House } from "@phosphor-icons/react"
import { useEffect, useMemo, useState } from "react"
import {
  defaultHealthWorkspaceState,
  readHealthWorkspaceState,
  writeHealthWorkspaceState,
} from "./workspace-state"

type FieldKey =
  | "bio"
  | "healthContext"
  | "lifestyleFactors"
  | "healthConditions"
  | "familyHistory"
  | "medications"

export function HealthProfileView() {
  const { user } = useUser()
  const { preferences, updatePreferences } = useUserPreferences()
  const [workspaceState, setWorkspaceState] = useState(defaultHealthWorkspaceState)
  const [editingField, setEditingField] = useState<FieldKey | null>(null)
  const [draftValue, setDraftValue] = useState("")

  useEffect(() => {
    setWorkspaceState(readHealthWorkspaceState(user?.id))
  }, [user?.id])

  const rows = useMemo(
    () => [
      {
        key: "bio" as const,
        title: "Health Bio",
        value: workspaceState.bio.trim() || "None",
      },
      {
        key: "healthContext" as const,
        title: "Health Goals",
        value: preferences.healthContext?.trim() || "None",
      },
      {
        key: "lifestyleFactors" as const,
        title: "Activity Level",
        value: preferences.lifestyleFactors?.trim() || "None",
      },
      {
        key: "healthConditions" as const,
        title: "Medical Conditions",
        value:
          preferences.healthConditions && preferences.healthConditions.length > 0
            ? preferences.healthConditions.join(", ")
            : "None",
      },
      {
        key: "familyHistory" as const,
        title: "Family History",
        value: preferences.familyHistory?.trim() || "None",
      },
      {
        key: "medications" as const,
        title: "Medications",
        value:
          preferences.medications && preferences.medications.length > 0
            ? preferences.medications.join(", ")
            : "None",
      },
    ],
    [preferences, workspaceState.bio]
  )

  const openEdit = (field: FieldKey, value: string) => {
    setEditingField(field)
    setDraftValue(value === "None" ? "" : value)
  }

  const saveEdit = async () => {
    if (!editingField) return
    if (editingField === "bio") {
      const nextState = { ...workspaceState, bio: draftValue.trim() }
      setWorkspaceState(nextState)
      writeHealthWorkspaceState(user?.id, nextState)
    } else if (editingField === "healthConditions") {
      await updatePreferences({
        healthConditions: draftValue
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
      })
    } else if (editingField === "medications") {
      await updatePreferences({
        medications: draftValue
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
      })
    } else {
      await updatePreferences({
        [editingField]: draftValue.trim(),
      })
    }
    setEditingField(null)
    setDraftValue("")
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-4 pt-22 pb-8">
      <div className="mb-5 flex items-center gap-2 text-sm text-muted-foreground">
        <House className="size-4" />
        <span>Health</span>
      </div>
      <section className="rounded-2xl border border-border/70 bg-background p-4 shadow-sm">
        <h1 className="text-2xl font-semibold">Health Profile</h1>
        <div className="mt-4 divide-y divide-border/70">
          {rows.map((row) => (
            <div key={row.key} className="flex items-center justify-between gap-4 py-3">
              <div>
                <p className="text-sm font-medium">{row.title}</p>
                <p className="text-muted-foreground mt-1 text-xs">{row.value}</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="rounded-full"
                onClick={() => openEdit(row.key, row.value)}
              >
                Manage
                <CaretRight className="ml-1 size-3.5" />
              </Button>
            </div>
          ))}
        </div>
      </section>

      <Dialog open={Boolean(editingField)} onOpenChange={(open) => !open && setEditingField(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update health profile</DialogTitle>
          </DialogHeader>
          {editingField === "healthConditions" || editingField === "medications" ? (
            <Textarea
              value={draftValue}
              onChange={(event) => setDraftValue(event.target.value)}
              placeholder="Enter comma-separated values"
              rows={4}
            />
          ) : editingField === "bio" ? (
            <Textarea
              value={draftValue}
              onChange={(event) => setDraftValue(event.target.value)}
              placeholder="Share a short note about your goals, routine, and health priorities"
              rows={5}
            />
          ) : editingField === "lifestyleFactors" ? (
            <Textarea
              value={draftValue}
              onChange={(event) => setDraftValue(event.target.value)}
              placeholder="Describe your current lifestyle and activity baseline"
              rows={4}
            />
          ) : (
            <Input
              value={draftValue}
              onChange={(event) => setDraftValue(event.target.value)}
              placeholder="Update value"
            />
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setEditingField(null)}>
              Cancel
            </Button>
            <Button onClick={saveEdit}>Save</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
