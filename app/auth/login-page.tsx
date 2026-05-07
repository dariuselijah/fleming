"use client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { signInWithApple, signInWithEmail, signInWithGoogle } from "@/lib/api"
import { isSupabaseEnabled } from "@/lib/supabase/config"
import { createClient } from "@/lib/supabase/client"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import type { FormEvent } from "react"
import { useMemo, useState } from "react"
import { HeaderGoBack } from "../components/header-go-back"

export default function LoginPage() {
  const searchParams = useSearchParams()
  const nextPath = useMemo(() => {
    const n = searchParams.get("next")?.trim()
    return n?.startsWith("/") && !n.includes("//") ? n : "/"
  }, [searchParams])

  const [loadingAction, setLoadingAction] = useState<"google" | "apple" | "email" | null>(null)
  const [email, setEmail] = useState("")
  const [emailSent, setEmailSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSignInWithGoogle() {
    try {
      setLoadingAction("google")
      setError(null)

      const supabase = createClient()

      if (!supabase) {
        throw new Error("Authentication is not configured for this environment.")
      }

      const data = await signInWithGoogle(supabase, { next: nextPath })

      // Redirect to the provider URL
      if (data?.url) {
        window.location.href = data.url
      }
    } catch (err: unknown) {
      console.error("Error signing in with Google:", err)
      setError(
        (err as Error).message ||
          "An unexpected error occurred. Please try again."
      )
    } finally {
      setLoadingAction(null)
    }
  }

  async function handleSignInWithApple() {
    try {
      setLoadingAction("apple")
      setError(null)

      const supabase = createClient()

      if (!supabase) {
        throw new Error("Authentication is not configured for this environment.")
      }

      const data = await signInWithApple(supabase, { next: nextPath })

      if (data?.url) {
        window.location.href = data.url
      }
    } catch (err: unknown) {
      console.error("Error signing in with Apple:", err)
      setError(
        (err as Error).message ||
          "An unexpected error occurred. Please try again."
      )
    } finally {
      setLoadingAction(null)
    }
  }

  async function handleEmailAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    try {
      setLoadingAction("email")
      setError(null)
      setEmailSent(false)

      const normalizedEmail = email.trim().toLowerCase()
      if (!normalizedEmail) {
        throw new Error("Enter your email address.")
      }

      const supabase = createClient()

      if (!supabase) {
        throw new Error("Authentication is not configured for this environment.")
      }

      await signInWithEmail(supabase, normalizedEmail, { next: nextPath })
      setEmailSent(true)
    } catch (err: unknown) {
      console.error("Error signing in with email:", err)
      setError(
        (err as Error).message ||
          "An unexpected error occurred. Please try again."
      )
    } finally {
      setLoadingAction(null)
    }
  }

  return (
    <div className="bg-background flex h-dvh w-full flex-col">
      <HeaderGoBack href="/" />

      <main className="flex flex-1 flex-col items-center justify-center px-4 sm:px-6">
        <div className="w-full max-w-md space-y-8">
          <div className="text-center">
            <h1 className="text-foreground text-3xl font-medium tracking-tight sm:text-4xl">
              Welcome to Fleming
            </h1>
            <p className="text-muted-foreground mt-3">
              Sign in to continue to Fleming.
            </p>
          </div>
          {!isSupabaseEnabled && (
            <div className="rounded-md border border-amber-500/25 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300">
              Authentication is not configured in this environment. Add the Supabase public URL and anon key to enable sign in.
            </div>
          )}
          {error && (
            <div className="bg-destructive/10 text-destructive rounded-md p-3 text-sm">
              {error}
            </div>
          )}
          <div className="mt-8 space-y-4">
            <form className="space-y-3" onSubmit={handleEmailAuth}>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="doctor@practice.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  disabled={!!loadingAction || !isSupabaseEnabled}
                />
              </div>
              <Button
                type="submit"
                className="w-full text-base sm:text-base"
                size="lg"
                disabled={!!loadingAction || !isSupabaseEnabled}
              >
                {loadingAction === "email" ? "Sending secure link..." : "Continue with email"}
              </Button>
              {emailSent && (
                <p className="text-sm text-muted-foreground">
                  Check your email for a secure sign-in link.
                </p>
              )}
            </form>
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">Or</span>
              </div>
            </div>
            <Button
              variant="secondary"
              className="w-full text-base sm:text-base"
              size="lg"
              onClick={handleSignInWithGoogle}
              disabled={!!loadingAction || !isSupabaseEnabled}
            >
              <img
                src="https://www.google.com/favicon.ico"
                alt="Google logo"
                width={20}
                height={20}
                className="mr-2 size-4"
              />
              <span>
                {loadingAction === "google" ? "Connecting..." : "Continue with Google"}
              </span>
            </Button>
            <Button
              variant="secondary"
              className="w-full text-base sm:text-base"
              size="lg"
              onClick={handleSignInWithApple}
              disabled={!!loadingAction || !isSupabaseEnabled}
            >
              <span className="mr-2 text-sm font-semibold">Apple</span>
              <span>
                {loadingAction === "apple" ? "Connecting..." : "Continue with Apple"}
              </span>
            </Button>
          </div>
        </div>
      </main>

      <footer className="text-muted-foreground py-6 text-center text-sm">
        <p>
          By continuing, you agree to our{" "}
          <Link href="/terms" className="text-foreground hover:underline">
            Terms of Service
          </Link>{" "}
          and{" "}
          <Link href="/privacy" className="text-foreground hover:underline">
            Privacy Policy
          </Link>
        </p>
      </footer>
    </div>
  )
}
