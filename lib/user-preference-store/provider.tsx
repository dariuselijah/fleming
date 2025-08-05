"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createContext, ReactNode, useContext } from "react"
import {
  convertFromApiFormat,
  convertToApiFormat,
  defaultPreferences,
  type LayoutType,
  type UserPreferences,
} from "./utils"
import { fetchClient } from "@/lib/fetch"

export {
  type LayoutType,
  type UserPreferences,
  convertFromApiFormat,
  convertToApiFormat,
}

const PREFERENCES_STORAGE_KEY = "user-preferences"
const LAYOUT_STORAGE_KEY = "preferred-layout"

interface UserPreferencesContextType {
  preferences: UserPreferences
  setLayout: (layout: LayoutType) => void
  setPromptSuggestions: (enabled: boolean) => void
  setShowToolInvocations: (enabled: boolean) => void
  setShowConversationPreviews: (enabled: boolean) => void

  toggleModelVisibility: (modelId: string) => void
  isModelHidden: (modelId: string) => boolean
  updatePreferences: (update: Partial<UserPreferences>) => Promise<void>
  isLoading: boolean
}

const UserPreferencesContext = createContext<
  UserPreferencesContextType | undefined
>(undefined)

async function fetchUserPreferences(): Promise<UserPreferences> {
  const response = await fetch("/api/user-preferences")
  if (!response.ok) {
    throw new Error("Failed to fetch user preferences")
  }
  const data = await response.json()
  return convertFromApiFormat(data)
}

async function updateUserPreferences(
  update: Partial<UserPreferences>
): Promise<UserPreferences> {
  const response = await fetch("/api/user-preferences", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(convertToApiFormat(update)),
  })

  if (!response.ok) {
    throw new Error("Failed to update user preferences")
  }

  const data = await response.json()
  return convertFromApiFormat(data)
}

function getLocalStoragePreferences(): UserPreferences {
  if (typeof window === "undefined") return defaultPreferences

  const stored = localStorage.getItem(PREFERENCES_STORAGE_KEY)
  if (stored) {
    try {
      return JSON.parse(stored)
    } catch {
      // fallback to legacy layout storage if JSON parsing fails
    }
  }

  const layout = localStorage.getItem(LAYOUT_STORAGE_KEY) as LayoutType | null
  return {
    ...defaultPreferences,
    ...(layout ? { layout } : {}),
  }
}

function saveToLocalStorage(preferences: UserPreferences) {
  if (typeof window === "undefined") return

  localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(preferences))
  localStorage.setItem(LAYOUT_STORAGE_KEY, preferences.layout)
}

export function UserPreferencesProvider({
  children,
  userId,
  initialPreferences,
}: {
  children: ReactNode
  userId?: string
  initialPreferences?: UserPreferences
}) {
  const isAuthenticated = !!userId
  const queryClient = useQueryClient()

  // Merge initial preferences with defaults
  const getInitialData = (): UserPreferences => {
    if (initialPreferences && isAuthenticated) {
      return initialPreferences
    }

    if (!isAuthenticated) {
      return getLocalStoragePreferences()
    }

    return defaultPreferences
  }

  // Query for user preferences
  const queryKey = ["user-preferences", userId]
  console.log("=== USER PREFERENCES PROVIDER DEBUG ===")
  console.log("Using query key:", queryKey)
  console.log("isAuthenticated:", isAuthenticated)
  console.log("initialPreferences:", initialPreferences)
  
      const { data: preferences = getInitialData(), isLoading } =
    useQuery<UserPreferences>({
      queryKey,
      queryFn: async () => {
        if (!isAuthenticated) {
          return getLocalStoragePreferences()
        }

        try {
          return await fetchUserPreferences()
        } catch (error) {
          console.error(
            "Failed to fetch user preferences, falling back to localStorage:",
            error
          )
          return getLocalStoragePreferences()
        }
      },
      enabled: typeof window !== "undefined",
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: (failureCount, error) => {
        // Only retry for authenticated users and network errors
        return isAuthenticated && failureCount < 2
      },
      // Use initial data if available to avoid unnecessary API calls
      initialData:
        initialPreferences && isAuthenticated ? getInitialData() : undefined,
    })

    // Log the preferences data
    console.log("=== PREFERENCES DATA DEBUG ===")
    console.log("preferences:", preferences)
    console.log("preferences.userRole:", preferences?.userRole)
    console.log("preferences.medicalSpecialty:", preferences?.medicalSpecialty)
    console.log("=== END PREFERENCES DATA DEBUG ===")

  // Mutation for updating preferences
  const mutation = useMutation({
    mutationFn: async (update: Partial<UserPreferences>) => {
      const updated = { ...preferences, ...update }

      if (!isAuthenticated) {
        saveToLocalStorage(updated)
        return updated
      }

      try {
        return await updateUserPreferences(update)
      } catch (error) {
        console.error(
          "Failed to update user preferences in database, falling back to localStorage:",
          error
        )
        saveToLocalStorage(updated)
        return updated
      }
    },
    onMutate: async (update) => {
      const queryKey = ["user-preferences", userId]
      await queryClient.cancelQueries({ queryKey })

      const previous = queryClient.getQueryData<UserPreferences>(queryKey)
      const optimistic = { ...previous, ...update }
      console.log("Setting optimistic update:", optimistic)
      queryClient.setQueryData(queryKey, optimistic)

      return { previous }
    },
    onError: (_err, _update, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["user-preferences", userId], context.previous)
      }
    },
    onSuccess: (data) => {
      // Ensure we're using the converted data from the API response
      const queryKey = ["user-preferences", userId]
      console.log("User preferences update success, server returned:", data)
      console.log("Setting query data with:", data)
      
      // Check if the server response contains the expected changes
      // If the server response doesn't match what we expect, keep the optimistic update
      const currentCache = queryClient.getQueryData<UserPreferences>(queryKey)
      console.log("Current cache data:", currentCache)
      
      // Only update if the server response contains the changes we expect
      if (data && (data.userRole !== currentCache?.userRole || data.medicalSpecialty !== currentCache?.medicalSpecialty)) {
        console.log("Server response contains changes, updating cache")
        queryClient.setQueryData(queryKey, data)
      } else {
        console.log("Server response appears stale, keeping optimistic update")
        // Don't update the cache, keep the optimistic update
      }
    },
  })

  const updatePreferences = async (update: Partial<UserPreferences>) => {
    await mutation.mutateAsync(update)
  }

  const setLayout = (layout: LayoutType) => {
    if (isAuthenticated || layout === "fullscreen") {
      updatePreferences({ layout })
    }
  }

  const setPromptSuggestions = (enabled: boolean) => {
    updatePreferences({ promptSuggestions: enabled })
  }

  const setShowToolInvocations = (enabled: boolean) => {
    updatePreferences({ showToolInvocations: enabled })
  }

  const setShowConversationPreviews = (enabled: boolean) => {
    updatePreferences({ showConversationPreviews: enabled })
  }



  const toggleModelVisibility = (modelId: string) => {
    const currentHidden = preferences.hiddenModels || []
    const isHidden = currentHidden.includes(modelId)
    const newHidden = isHidden
      ? currentHidden.filter((id) => id !== modelId)
      : [...currentHidden, modelId]

    updatePreferences({ hiddenModels: newHidden })
  }

  const isModelHidden = (modelId: string) => {
    return (preferences.hiddenModels || []).includes(modelId)
  }

  return (
    <UserPreferencesContext.Provider
      value={{
        preferences,
        setLayout,
        setPromptSuggestions,
        setShowToolInvocations,
        setShowConversationPreviews,

        toggleModelVisibility,
        isModelHidden,
        updatePreferences,
        isLoading,
      }}
    >
      {children}
    </UserPreferencesContext.Provider>
  )
}

export function useUserPreferences() {
  const context = useContext(UserPreferencesContext)
  if (!context) {
    throw new Error(
      "useUserPreferences must be used within UserPreferencesProvider"
    )
  }
  return context
}
