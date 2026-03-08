import { UploadsWorkspace } from "@/app/components/uploads/uploads-workspace"
import { LayoutApp } from "@/app/components/layout/layout-app"
import { MessagesProvider } from "@/lib/chat-store/messages/provider"
import { isSupabaseEnabled } from "@/lib/supabase/config"
import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import type { Metadata } from "next"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Uploads - AskFleming",
  description: "Manage your private uploads and ingestion progress for retrieval in chat.",
  robots: {
    index: false,
    follow: false,
  },
}

export default async function UploadsPage() {
  if (isSupabaseEnabled) {
    const supabase = await createClient()
    if (supabase) {
      const { data: userData, error: userError } = await supabase.auth.getUser()
      if (userError || !userData?.user) {
        redirect("/")
      }
    }
  }

  return (
    <MessagesProvider>
      <LayoutApp>
        <UploadsWorkspace />
      </LayoutApp>
    </MessagesProvider>
  )
}
