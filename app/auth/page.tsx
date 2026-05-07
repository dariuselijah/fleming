import { Suspense } from "react"
import LoginPage from "./login-page"

export default function AuthPage() {
  return (
    <Suspense fallback={<div className="bg-background min-h-dvh" />}>
      <LoginPage />
    </Suspense>
  )
}
