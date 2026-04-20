import { Suspense } from "react"
import { InvitePracticeClient } from "./invite-practice-client"

export default function PracticeInvitePage() {
  return (
    <Suspense fallback={<div className="bg-background min-h-dvh" />}>
      <InvitePracticeClient />
    </Suspense>
  )
}
