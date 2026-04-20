"use client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { toast } from "@/components/ui/toast"
import { fetchClient } from "@/lib/fetch"
import type { PracticeStaffRole } from "@/lib/clinical-workspace/types"
import {
  INVITABLE_ROLES,
  ROLE_LABEL,
  ROLE_PERMISSION_SUMMARY,
  canInviteAsRole,
  isOwnerOrAdmin,
} from "@/lib/practice/team-permissions"
import { usePracticeCrypto } from "@/lib/clinical-workspace/practice-crypto-context"
import { useUser } from "@/lib/user-store/provider"
import { Trash, UsersThree } from "@phosphor-icons/react"
import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"

type MemberRow = {
  id: string
  userId: string
  role: string
  email: string | null
  createdAt: string
}

type InviteRow = {
  id: string
  email: string
  role: string
  expires_at: string
  created_at: string
}

export function PracticeTeamSettings() {
  const { user } = useUser()
  const { practiceId } = usePracticeCrypto()
  const [callerRole, setCallerRole] = useState<string | null>(null)
  const [practiceName, setPracticeName] = useState("")
  const [members, setMembers] = useState<MemberRow[]>([])
  const [invitations, setInvitations] = useState<InviteRow[]>([])
  const [loading, setLoading] = useState(false)
  const [inviteEmail, setInviteEmail] = useState("")
  const [inviteRole, setInviteRole] = useState<PracticeStaffRole>("physician")
  const [sending, setSending] = useState(false)

  const roleOptionsForCaller = useMemo(() => {
    return INVITABLE_ROLES.filter((r) => canInviteAsRole(callerRole, r))
  }, [callerRole])

  useEffect(() => {
    if (roleOptionsForCaller.length && !roleOptionsForCaller.includes(inviteRole)) {
      setInviteRole(roleOptionsForCaller[0])
    }
  }, [roleOptionsForCaller, inviteRole])

  const load = useCallback(async () => {
    if (!practiceId || !user?.id) return
    setLoading(true)
    try {
      const res = await fetchClient(`/api/practice/members?practiceId=${encodeURIComponent(practiceId)}`)
      const j = (await res.json()) as {
        error?: string
        callerRole?: string
        practiceName?: string
        members?: MemberRow[]
        invitations?: InviteRow[]
      }
      if (!res.ok) throw new Error(j.error || "Failed to load team")
      setCallerRole(j.callerRole ?? null)
      setPracticeName(j.practiceName ?? "")
      setMembers(j.members ?? [])
      setInvitations(j.invitations ?? [])
    } catch (e) {
      console.warn("[PracticeTeamSettings]", e)
      toast({
        title: e instanceof Error ? e.message : "Could not load team",
        status: "error",
      })
    } finally {
      setLoading(false)
    }
  }, [practiceId, user?.id])

  useEffect(() => {
    void load()
  }, [load])

  const canManage = isOwnerOrAdmin(callerRole)

  const handleInvite = async () => {
    if (!practiceId || !inviteEmail.trim()) return
    setSending(true)
    try {
      const res = await fetchClient("/api/practice/members/invite", {
        method: "POST",
        body: JSON.stringify({
          practiceId,
          email: inviteEmail.trim(),
          role: inviteRole,
        }),
      })
      const j = (await res.json()) as { error?: string; acceptUrl?: string; emailSent?: boolean }
      if (!res.ok) throw new Error(j.error || "Invite failed")
      if (j.acceptUrl) {
        toast({
          title: "Invitation created — email not sent (configure Resend or share the link)",
          description: j.acceptUrl,
          status: "success",
        })
      } else {
        toast({
          title: j.emailSent ? "Invitation sent" : "Invitation created",
          status: "success",
        })
      }
      setInviteEmail("")
      await load()
    } catch (e) {
      toast({
        title: e instanceof Error ? e.message : "Invite failed",
        status: "error",
      })
    } finally {
      setSending(false)
    }
  }

  const revoke = async (invitationId: string) => {
    if (!practiceId) return
    try {
      const res = await fetchClient(
        `/api/practice/members/invite?practiceId=${encodeURIComponent(practiceId)}&invitationId=${encodeURIComponent(invitationId)}`,
        { method: "DELETE" }
      )
      const j = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(j.error || "Could not revoke")
      toast({ title: "Invitation revoked", status: "success" })
      await load()
    } catch (e) {
      toast({
        title: e instanceof Error ? e.message : "Revoke failed",
        status: "error",
      })
    }
  }

  const updateMemberRole = async (userId: string, role: PracticeStaffRole) => {
    if (!practiceId) return
    try {
      const res = await fetchClient("/api/practice/members/role", {
        method: "PATCH",
        body: JSON.stringify({ practiceId, userId, role }),
      })
      const j = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(j.error || "Update failed")
      toast({ title: "Role updated", status: "success" })
      await load()
    } catch (e) {
      toast({
        title: e instanceof Error ? e.message : "Update failed",
        status: "error",
      })
    }
  }

  if (!practiceId) {
    return (
      <div className="text-muted-foreground text-sm">
        Join or create a practice to manage team members.
      </div>
    )
  }

  if (!canManage && !loading) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <UsersThree className="text-muted-foreground size-5" />
          <h3 className="text-sm font-medium">Practice team</h3>
        </div>
        <p className="text-muted-foreground text-xs">
          Only practice owners and administrators can invite colleagues or change roles. Ask an owner to grant
          you the Administrator role if you need access.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="mb-1 flex items-center gap-2">
          <UsersThree className="text-muted-foreground size-5" />
          <h3 className="text-sm font-medium">Practice team</h3>
        </div>
        <p className="text-muted-foreground text-xs">
          Invite colleagues to {practiceName || "your practice"} and assign a role. Each role controls what they
          can see and do in Fleming.
        </p>
      </div>

      <div className="bg-muted/40 space-y-3 rounded-lg border p-4">
        <Label className="text-xs font-medium">Invite by email</Label>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1 space-y-1.5">
            <Input
              type="email"
              placeholder="colleague@clinic.com"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              autoComplete="off"
            />
          </div>
          <div className="w-full space-y-1.5 sm:w-48">
            <Select
              value={inviteRole}
              onValueChange={(v) => setInviteRole(v as PracticeStaffRole)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Role" />
              </SelectTrigger>
              <SelectContent>
                {roleOptionsForCaller.map((r) => (
                  <SelectItem key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            type="button"
            size="sm"
            disabled={sending || !inviteEmail.includes("@")}
            onClick={() => void handleInvite()}
          >
            {sending ? "Sending…" : "Send invite"}
          </Button>
        </div>
        {inviteRole && (
          <p className="text-muted-foreground text-xs leading-relaxed">
            {ROLE_PERMISSION_SUMMARY[inviteRole]}
          </p>
        )}
        <p className="text-muted-foreground text-xs">
          Invites expire after 7 days. The recipient must sign in with the{" "}
          <span className="text-foreground font-medium">same email address</span> as in the invitation.
        </p>
      </div>

      <div className="space-y-2">
        <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Members</h4>
        {loading ? (
          <p className="text-muted-foreground text-sm">Loading…</p>
        ) : members.length === 0 ? (
          <p className="text-muted-foreground text-sm">No members yet.</p>
        ) : (
          <ul className="divide-border divide-y rounded-md border">
            {members.map((m) => {
              const showRolePicker =
                canManage && m.userId !== user?.id && m.role !== "owner"
              return (
                <li
                  key={m.id}
                  className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{m.email ?? m.userId}</p>
                    {!showRolePicker && (
                      <p className="text-muted-foreground text-xs">
                        {ROLE_LABEL[m.role as PracticeStaffRole] ?? m.role}
                      </p>
                    )}
                  </div>
                  {showRolePicker ? (
                    <Select
                      value={m.role}
                      onValueChange={(v) => void updateMemberRole(m.userId, v as PracticeStaffRole)}
                    >
                      <SelectTrigger className="h-8 w-full sm:w-[180px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {INVITABLE_ROLES.filter(
                          (r) => canInviteAsRole(callerRole, r) || r === m.role
                        ).map((r) => (
                          <SelectItem key={r} value={r}>
                            {ROLE_LABEL[r]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <span className="text-muted-foreground text-xs">
                      {ROLE_LABEL[m.role as PracticeStaffRole] ?? m.role}
                    </span>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {invitations.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Pending invitations</h4>
          <ul className="divide-border divide-y rounded-md border">
            {invitations.map((inv) => (
              <li
                key={inv.id}
                className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="text-sm font-medium">{inv.email}</p>
                  <p className="text-muted-foreground text-xs">
                    {ROLE_LABEL[inv.role as PracticeStaffRole] ?? inv.role} · expires{" "}
                    {new Date(inv.expires_at).toLocaleDateString()}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-destructive shrink-0"
                  onClick={() => void revoke(inv.id)}
                >
                  <Trash className="mr-1 size-4" />
                  Revoke
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-muted-foreground text-xs">
        Received an invite? Open the link in the email, or{" "}
        <Link href="/invite/practice" className="text-foreground underline underline-offset-2">
          go to the invite page
        </Link>{" "}
        after signing in.
      </p>
    </div>
  )
}
