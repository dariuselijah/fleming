"use client"

import { useUser } from "@/lib/user-store/provider"
import { redirect } from "next/navigation"
import { useEffect } from "react"

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useUser()

  useEffect(() => {
    if (!isLoading && !user?.id) {
      redirect("/auth")
    }
  }, [user, isLoading])

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto"></div>
          <p className="mt-2 text-sm text-gray-600">Loading...</p>
        </div>
      </div>
    )
  }

  if (!user?.id) {
    return null // Will redirect in useEffect
  }

  return <>{children}</>
} 