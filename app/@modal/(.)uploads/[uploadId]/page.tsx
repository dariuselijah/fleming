import { UploadDocumentViewer } from "@/app/components/uploads/upload-document-viewer"
import { isSupabaseEnabled } from "@/lib/supabase/config"
import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"

type Props = {
  params: Promise<{ uploadId: string }>
}

export const dynamic = "force-dynamic"

export default async function UploadDetailModalPage({ params }: Props) {
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

  return <UploadDocumentViewer uploadId={uploadId} isModal />
}
