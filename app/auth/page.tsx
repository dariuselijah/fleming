import { isSupabaseEnabled } from "@/lib/supabase/config"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import LoginPage from "./login-page"

export default function AuthPage() {
  if (!isSupabaseEnabled) {
    return notFound()
  }

  return (
    <Suspense fallback={<div className="bg-background min-h-dvh" />}>
      <LoginPage />
    </Suspense>
  )
}
