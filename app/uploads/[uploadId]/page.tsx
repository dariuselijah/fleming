import { LayoutApp } from "@/app/components/layout/layout-app"
import { UploadDocumentViewer } from "@/app/components/uploads/upload-document-viewer"
import { MessagesProvider } from "@/lib/chat-store/messages/provider"
import { isSupabaseEnabled } from "@/lib/supabase/config"
import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import type { Metadata } from "next"

type Props = {
  params: Promise<{ uploadId: string }>
}

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Upload Viewer - AskFleming",
  description: "Inspect uploaded study materials with page-level context and highlighted references.",
  robots: {
    index: false,
    follow: false,
  },
}

export default async function UploadDetailPage({ params }: Props) {
  const { uploadId } = await params

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
        <UploadDocumentViewer uploadId={uploadId} isModal={false} />
      </LayoutApp>
    </MessagesProvider>
  )
}
