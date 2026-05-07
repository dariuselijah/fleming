"use client"

import { fetchClient } from "@/lib/fetch"
import { createContext, useContext, useMemo, useState, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import {
  hasAnyPermission,
  hasPermission,
  type AppPermission,
} from "./permissions"
import type { AuthPracticeContext } from "./context"

type AuthContextValue = AuthPracticeContext & {
  hasPermission: (permission: AppPermission) => boolean
  hasAnyPermission: (permissions: AppPermission[]) => boolean
  setActivePractice: (practiceId: string) => Promise<void>
}

const AuthPracticeContextProvider = createContext<AuthContextValue | undefined>(
  undefined
)

export function AuthProvider({
  children,
  initialContext,
}: {
  children: ReactNode
  initialContext: AuthPracticeContext
}) {
  const router = useRouter()
  const [context, setContext] = useState<AuthPracticeContext>(initialContext)

  const value = useMemo<AuthContextValue>(
    () => ({
      ...context,
      hasPermission: (permission) => hasPermission(context.activeRole, permission),
      hasAnyPermission: (permissions) =>
        hasAnyPermission(context.activeRole, permissions),
      setActivePractice: async (practiceId) => {
        const response = await fetchClient("/api/auth/active-practice", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ practiceId }),
        })
        if (!response.ok) {
          throw new Error("Unable to switch practice")
        }
        const next = (await response.json()) as AuthPracticeContext
        setContext(next)
        router.refresh()
      },
    }),
    [context, router]
  )

  return (
    <AuthPracticeContextProvider.Provider value={value}>
      {children}
    </AuthPracticeContextProvider.Provider>
  )
}

export function useAuthContext() {
  const context = useContext(AuthPracticeContextProvider)
  if (!context) {
    throw new Error("useAuthContext must be used within AuthProvider")
  }
  return context
}
